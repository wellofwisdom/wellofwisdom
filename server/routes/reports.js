// SPDX-License-Identifier: AGPL-3.0-or-later
// Progress reports: real stats from real work + an AI narrative the guide
// can edit. Works with no AI configured (falls back to a plain summary).
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const ai = require("../lib/ai");
const perm = require("../lib/perm");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// A scoped assistant (a tutor) may only touch their assigned learners; owner,
// guide and observer see the whole family. Call after the family-ownership
// check, so a stranger's learner still reads as "not found" rather than "not
// allowed" (never confirm a learner exists in another family).
async function canSeeLearner(req, learnerId) {
  const assigned = await assignedLearners(req.user.id);
  return perm.canSeeLearner(req.user, learnerId, assigned);
}

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

async function computeStats(familyId, learnerId, fromISO, toISO) {
  const from = `${fromISO} 00:00:00`;
  const to = `${toISO} 23:59:59`;
  const totals = await db.query(
    `select
       (select count(*) from lesson_completions where learner_id = $1 and completed_at between $2 and $3)::int as lessons_completed,
       (select count(*) from attempts where learner_id = $1 and created_at between $2 and $3)::int as attempts_total,
       (select count(*) from attempts where learner_id = $1 and created_at between $2 and $3 and correct)::int as attempts_correct,
       (select count(distinct date(created_at)) from attempts where learner_id = $1 and created_at between $2 and $3)::int as active_days,
       (select count(*) from review_schedule where learner_id = $1 and updated_at between $2 and $3 and reps > 0)::int as skills_reviewed`,
    [learnerId, from, to]
  );
  const courses = await db.query(
    `select c.title, c.lens,
            (select count(*) from lesson_completions lc where lc.course_id = c.id and lc.learner_id = $1 and lc.completed_at between $2 and $3)::int as lessons_done,
            (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = c.id)::int as lessons_total
       from courses c
      where c.family_id = $4 and c.status = 'published'
        and (c.learner_id is null or c.learner_id = $1)
        and exists (select 1 from lesson_completions lc where lc.course_id = c.id and lc.learner_id = $1 and lc.completed_at between $2 and $3)
      order by c.created_at`,
    [learnerId, from, to, familyId]
  );
  const t = totals.rows[0];
  return {
    period: { from: fromISO, to: toISO },
    lessonsCompleted: t.lessons_completed,
    attemptsTotal: t.attempts_total,
    attemptsCorrect: t.attempts_correct,
    accuracy: t.attempts_total ? Math.round((t.attempts_correct / t.attempts_total) * 100) : null,
    activeDays: t.active_days,
    skillsReviewed: t.skills_reviewed,
    courses: courses.rows,
  };
}

function templateNarrative(learnerName, stats) {
  const courseLines = stats.courses.map((c) => `${c.title}: ${c.lessons_done} lessons`).join("; ");
  return [
    `During this period, ${learnerName} completed ${stats.lessonsCompleted} lessons across ${stats.courses.length} course${stats.courses.length === 1 ? "" : "s"}${courseLines ? ` (${courseLines})` : ""}, answering ${stats.attemptsTotal} exercises with ${stats.accuracy === null ? "" : stats.accuracy + "% "}accuracy over ${stats.activeDays} active learning days.`,
    stats.skillsReviewed ? `${stats.skillsReviewed} skills came back for spaced review: that's long-term memory being built.` : "",
    "Edit this narrative to add your own observations.",
  ].filter(Boolean).join("\n\n");
}

async function aiNarrative(learnerName, stats, familyId) {
  const out = await ai.chat(
    "lesson-content",
    [
      {
        role: "system",
        content:
          "You write warm, specific progress summaries for a learning report that a guide (parent/teacher) will review, edit, and possibly hand to a school authority or keep for records. " +
          "3 short paragraphs max: what they did (concrete), strengths and growth (honest, kind), one encouragement. Plain language. No invented facts: only the numbers given.",
      },
      {
        role: "user",
        content: JSON.stringify({ learner: learnerName, stats }),
      },
    ],
    { maxTokens: 800, temperature: 0.6, usage: { familyId, note: "report-narrative" } }
  );
  return out.content;
}

// A portfolio: the work itself, not a count of it.
//
// The states that do not ask for days of instruction usually ask for a
// portfolio review, and what a reviewer wants to see is the actual work with
// the guide's response beside it. All of that already exists here (submissions,
// completions, badges, the attendance log), so this assembles it rather than
// asking anyone to keep a second record by hand.
//
// Read-only and unsaved on purpose: there is no "portfolio" row to go stale.
// Ask for a period and it is built from what is true right now.
router.get("/portfolio/:learnerId", async (req, res, next) => {
  try {
    const learnerId = Number(req.params.learnerId);
    const { from, to } = req.query;
    if (!validDate(from) || !validDate(to)) return bad(res, "dates_invalid");
    if (!Number.isInteger(learnerId)) return bad(res, "id_invalid");

    const own = await db.query(
      `select u.id, u.name, u.grade_level, f.name as family_name
         from users u join families f on f.id = u.family_id
        where u.id = $1 and u.family_id = $2 and u.role = 'learner'`,
      [learnerId, req.user.familyId]
    );
    if (!own.rows[0]) return bad(res, "learner_not_found", 404);
    if (!(await canSeeLearner(req, learnerId))) return bad(res, "not_allowed", 403);

    const start = `${from} 00:00:00`;
    const end = `${to} 23:59:59`;

    // The work handed in, with what the guide said back. Feedback only appears
    // once it was actually returned: an unfinished note is not part of a record.
    const work = await db.query(
      `select s.id, s.body, s.status, s.submitted_at, s.returned_at, s.outcome, s.feedback,
              i.content as item_content, l.title as lesson_title, c.title as course_title
         from submissions s
         join lesson_items i on i.id = s.item_id
         join lessons l on l.id = i.lesson_id
         join units un on un.id = l.unit_id
         join courses c on c.id = un.course_id
        where s.learner_id = $1 and s.family_id = $2 and s.status <> 'draft'
          and s.submitted_at between $3 and $4
        order by s.submitted_at`,
      [learnerId, req.user.familyId, start, end]
    );

    const badges = await db.query(
      "select badge, earned_at from badges where learner_id = $1 and earned_at between $2 and $3 order by earned_at",
      [learnerId, start, end]
    );
    const { badgeById } = require("../lib/badges");

    const attendance = require("../lib/attendance");
    const prefs = await db.query("select prefs from families where id = $1", [req.user.familyId]);
    const requirement = attendance.requirementFrom((prefs.rows[0] && prefs.rows[0].prefs) || {});
    const [workDayRows, overrideRows] = await Promise.all([
      db.query(
        `select day, sum(a)::int as attempts, sum(b)::int as lessons, sum(c)::int as submissions from (
           select date(created_at) as day, count(*) as a, 0 as b, 0 as c
             from attempts where learner_id = $1 and created_at between $2 and $3 group by 1
           union all
           select date(completed_at), 0, count(*), 0
             from lesson_completions where learner_id = $1 and completed_at between $2 and $3 group by 1
           union all
           select date(submitted_at), 0, 0, count(*)
             from submissions where learner_id = $1 and submitted_at between $2 and $3 group by 1
         ) w group by day`,
        [learnerId, start, end]
      ),
      db.query(
        "select day, counted, minutes, note from attendance_days where learner_id = $1 and day between $2 and $3",
        [learnerId, from, to]
      ),
    ]);
    const asDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
    const days = attendance.mergeDays(
      workDayRows.rows.map((r) => ({ ...r, day: asDay(r.day) })),
      overrideRows.rows.map((r) => ({ ...r, day: asDay(r.day) }))
    );

    res.json({
      learner: { id: learnerId, name: own.rows[0].name, gradeLevel: own.rows[0].grade_level },
      familyName: own.rows[0].family_name,
      period: { from, to },
      stats: await computeStats(req.user.familyId, learnerId, from, to),
      attendance: attendance.summarize(days, requirement),
      requirement,
      work: work.rows.map((r) => {
        const c = r.item_content || {};
        const returned = r.status === "returned" || Boolean(r.returned_at);
        return {
          id: Number(r.id),
          title: c.title || r.lesson_title,
          courseTitle: r.course_title,
          lessonTitle: r.lesson_title,
          brief: c.description || null,
          body: r.body || "",
          submittedAt: r.submitted_at,
          outcome: returned ? r.outcome || null : null,
          feedback: returned ? r.feedback || null : null,
        };
      }),
      badges: badges.rows.map((b) => {
        const def = badgeById(b.badge);
        return {
          id: b.badge,
          label: (def && def.label) || b.badge,
          description: (def && def.description) || null,
          icon: (def && def.icon) || "⭐",
          earnedAt: b.earned_at,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Live stats preview for a learner + period (no AI, no save).
router.get("/preview", async (req, res, next) => {
  try {
    const { learnerId, from, to } = req.query;
    if (!validDate(from) || !validDate(to)) return bad(res, "dates_invalid");
    const owns = await db.query(
      "select name from users where id = $1 and family_id = $2 and role = 'learner'",
      [Number(learnerId), req.user.familyId]
    );
    if (!owns.rows[0]) return bad(res, "learner_not_found", 404);
    if (!(await canSeeLearner(req, Number(learnerId)))) return bad(res, "not_allowed", 403);
    res.json({ learner: owns.rows[0].name, stats: await computeStats(req.user.familyId, Number(learnerId), from, to) });
  } catch (err) {
    next(err);
  }
});

// Generate + save: stats from real work; narrative AI or template.
router.post("/generate", async (req, res, next) => {
  try {
    const { learnerId, from, to, title } = req.body || {};
    if (!validDate(from) || !validDate(to)) return bad(res, "dates_invalid");
    const owns = await db.query(
      "select name from users where id = $1 and family_id = $2 and role = 'learner'",
      [Number(learnerId), req.user.familyId]
    );
    if (!owns.rows[0]) return bad(res, "learner_not_found", 404);
    if (!(await canSeeLearner(req, Number(learnerId)))) return bad(res, "not_allowed", 403);
    const learnerName = owns.rows[0].name;
    const stats = await computeStats(req.user.familyId, Number(learnerId), from, to);
    if (stats.lessonsCompleted === 0 && stats.attemptsTotal === 0) return bad(res, "no_activity_in_period");

    let narrative;
    if (ai.configured()) {
      try {
        narrative = await aiNarrative(learnerName, stats, req.user.familyId);
      } catch {
        narrative = templateNarrative(learnerName, stats);
      }
    } else {
      narrative = templateNarrative(learnerName, stats);
    }

    const { rows } = await db.query(
      `insert into reports (family_id, learner_id, period_start, period_end, title, stats, narrative, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        req.user.familyId, Number(learnerId), from, to,
        String(title || `Progress report: ${from} to ${to}`).slice(0, 200),
        JSON.stringify(stats), narrative, req.user.id,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    // Same scoping as the progress list: an assistant sees only their learners'
    // reports, everyone else sees the family's.
    const assigned = await assignedLearners(req.user.id);
    const visible = perm.visibleLearnerIds(req.user, assigned);
    const params = [req.user.familyId];
    let scope = "";
    if (visible !== null) {
      params.push(visible);
      scope = ` and r.learner_id = any($${params.length}::bigint[])`;
    }
    const { rows } = await db.query(
      `select r.id, r.title, r.period_start, r.period_end, r.created_at, u.name as learner_name
         from reports r join users u on u.id = r.learner_id
        where r.family_id = $1${scope} order by r.created_at desc`,
      params
    );
    res.json({ reports: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select r.*, u.name as learner_name, f.name as family_name
         from reports r join users u on u.id = r.learner_id join families f on f.id = r.family_id
        where r.id = $1 and r.family_id = $2`,
      [Number(req.params.id), req.user.familyId]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    if (!(await canSeeLearner(req, rows[0].learner_id))) return bad(res, "not_allowed", 403);
    res.json({ report: rows[0] });
  } catch (err) {
    next(err);
  }
});

/** The report's learner, if it belongs to the caller's family. A scoped
 *  assistant must not edit or delete a report for a learner they cannot see. */
async function reportLearner(req) {
  const { rows } = await db.query(
    "select learner_id from reports where id = $1 and family_id = $2",
    [Number(req.params.id), req.user.familyId]
  );
  return rows[0] ? Number(rows[0].learner_id) : null;
}

router.patch("/:id", async (req, res, next) => {
  try {
    const learnerId = await reportLearner(req);
    if (learnerId === null) return bad(res, "not_found", 404);
    if (!(await canSeeLearner(req, learnerId))) return bad(res, "not_allowed", 403);

    const { title, narrative } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.id)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) { if (!String(title || "").trim()) return bad(res, "title_required"); add("title", String(title).slice(0, 200)); }
    if (narrative !== undefined) add("narrative", String(narrative || "").slice(0, 8000));
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");
    const { rowCount } = await db.query(`update reports set ${sets.join(", ")} where id = $2 and family_id = $1`, params);
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const learnerId = await reportLearner(req);
    if (learnerId === null) return bad(res, "not_found", 404);
    if (!(await canSeeLearner(req, learnerId))) return bad(res, "not_allowed", 403);

    const { rowCount } = await db.query("delete from reports where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]);
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
