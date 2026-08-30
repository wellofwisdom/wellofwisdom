// SPDX-License-Identifier: AGPL-3.0-or-later
// Learning-path routes (guide): outline job, create, list, detail, edit,
// generate-a-course-from-a-milestone. Every query family-scoped.
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const auth = require("../lib/auth");
const db = require("../lib/db");
const jobs = require("../lib/jobs");
const ai = require("../lib/ai");
const { spreadDates } = require("../lib/plangen");

// Plan templates ship with the app: full curricula that need NO AI key.
const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "plans");
function listTemplates() {
  return fs.readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => jsonLoad(f))
    .filter(Boolean);
}
function jsonLoad(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, file), "utf8"));
  } catch {
    return null;
  }
}

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Templates (list = metadata only; :id = full milestones).
router.get("/templates", (_req, res) => {
  res.json({
    templates: listTemplates().map((t) => ({
      id: t.id, title: t.title, subject: t.subject, description: t.description,
      suggestedWeeks: t.suggestedWeeks, milestoneCount: t.milestones.length,
    })),
  });
});

router.get("/templates/:id", (req, res) => {
  const t = listTemplates().find((x) => x.id === String(req.params.id || ""));
  if (!t) return bad(res, "not_found", 404);
  res.json({ template: t });
});

// Kick off AI outline generation (a job — takes ~a minute).
router.post("/outline", async (req, res, next) => {
  try {
    const { subject, goal, startDate, endDate, lens, learnerNotes } = req.body || {};
    if (!String(subject || "").trim()) return bad(res, "subject_required");
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    const s = new Date(startDate || "");
    const e = new Date(endDate || "");
    if (isNaN(s) || isNaN(e) || e <= s) return bad(res, "dates_invalid");
    const jobId = await jobs.enqueue(req.user.familyId, "plan-outline", {
      subject: String(subject).trim().slice(0, 200),
      goal: String(goal || "").trim().slice(0, 2000) || null,
      startDate: String(startDate).slice(0, 10),
      endDate: String(endDate).slice(0, 10),
      lens: String(lens || "").trim().slice(0, 100) || null,
      learnerNotes: String(learnerNotes || "").trim().slice(0, 2000) || null,
    }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:id", async (req, res, next) => {
  try {
    const job = await jobs.get(Number(req.params.id), req.user.familyId);
    if (!job) return bad(res, "not_found", 404);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// Save the (guide-reviewed) plan: enrollments + milestones + spread dates.
router.post("/", async (req, res, next) => {
  try {
    const { title, subject, goal, startDate, endDate, sessionsPerWeek, minutesPerSession, learners, milestones } = req.body || {};
    if (!String(title || "").trim() || !String(subject || "").trim()) return bad(res, "title_subject_required");
    const s = new Date(startDate || "");
    const e = new Date(endDate || "");
    if (isNaN(s) || isNaN(e) || e <= s) return bad(res, "dates_invalid");
    const list = (Array.isArray(milestones) ? milestones : []).filter((m) => m && String(m.title || "").trim());
    if (list.length < 3) return bad(res, "milestones_required");

    const client = await db.getPool().connect();
    try {
      await client.query("begin");
      const plan = await client.query(
        `insert into term_plans (family_id, title, subject, goal, start_date, end_date, sessions_per_week, minutes_per_session, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          req.user.familyId, String(title).slice(0, 160), String(subject).slice(0, 160),
          String(goal || "").slice(0, 2000) || null, String(startDate).slice(0, 10), String(endDate).slice(0, 10),
          Math.min(7, Math.max(1, Number(sessionsPerWeek) || 3)), Math.min(240, Math.max(10, Number(minutesPerSession) || 30)),
          req.user.id,
        ]
      );
      const planId = plan.rows[0].id;
      for (const l of (Array.isArray(learners) ? learners : [])) {
        if (!l || !l.learnerId) continue;
        const owns = await client.query(
          "select 1 from users where id = $1 and family_id = $2 and role = 'learner'",
          [Number(l.learnerId), req.user.familyId]
        );
        if (!owns.rowCount) continue;
        await client.query(
          `insert into plan_enrollments (plan_id, learner_id, lens_override, personal_note)
           values ($1,$2,$3,$4) on conflict (plan_id, learner_id) do nothing`,
          [planId, Number(l.learnerId), String(l.lens || "").slice(0, 100) || null, String(l.note || "").slice(0, 1000) || null]
        );
      }
      const dates = spreadDates(startDate, endDate, list.length);
      let pos = 0;
      for (const m of list.slice(0, 36)) {
        await client.query(
          `insert into plan_milestones (plan_id, title, description, position, target_date, project_ideas, resources)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            planId, String(m.title).slice(0, 200), String(m.description || "").slice(0, 600) || null,
            pos, m.targetDate || dates[pos] || null,
            JSON.stringify(Array.isArray(m.projectIdeas) ? m.projectIdeas.slice(0, 3) : []),
            JSON.stringify(Array.isArray(m.resources) ? m.resources.slice(0, 5) : []),
          ]
        );
        pos++;
      }
      await client.query("commit");
      res.status(201).json({ planId });
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select p.id, p.title, p.subject, p.status, p.start_date, p.end_date, p.sessions_per_week, p.minutes_per_session,
              (select count(*) from plan_milestones m where m.plan_id = p.id)::int as milestone_count,
              (select count(*) from plan_milestones m where m.plan_id = p.id and m.course_id is not null)::int as courses_made,
              (select string_agg(u.name, ', ') from plan_enrollments e join users u on u.id = e.learner_id where e.plan_id = p.id) as learners
         from term_plans p where p.family_id = $1 and p.status != 'archived'
        order by p.created_at desc`,
      [req.user.familyId]
    );
    res.json({ plans: rows });
  } catch (err) {
    next(err);
  }
});

async function planTree(planId, familyId) {
  const p = await db.query(
    "select * from term_plans where id = $1 and family_id = $2", [planId, familyId]
  );
  if (!p.rows[0]) return null;
  const enrolled = await db.query(
    `select e.learner_id, e.lens_override, e.personal_note, u.name, u.grade_level, u.interests, u.ai_notes
       from plan_enrollments e join users u on u.id = e.learner_id
      where e.plan_id = $1 order by u.name`,
    [planId]
  );
  const milestones = await db.query(
    `select m.*, c.title as course_title, c.status as course_status,
            (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = m.course_id)::int as lessons_total
       from plan_milestones m left join courses c on c.id = m.course_id
      where m.plan_id = $1 order by m.position, m.id`,
    [planId]
  );
  // per-learner completion of each linked course
  const progress = {};
  for (const e of enrolled.rows) {
    progress[e.learner_id] = {};
    for (const m of milestones.rows) {
      if (!m.course_id) continue;
      const done = await db.query(
        `select count(*)::int as n from lesson_completions where course_id = $1 and learner_id = $2`,
        [m.course_id, e.learner_id]
      );
      progress[e.learner_id][m.id] = done.rows[0].n;
    }
  }
  return { ...p.rows[0], enrollments: enrolled.rows, milestones: milestones.rows, progress };
}

router.get("/:id", async (req, res, next) => {
  try {
    const tree = await planTree(Number(req.params.id), req.user.familyId);
    if (!tree) return bad(res, "not_found", 404);
    res.json({ plan: tree });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { title, goal, status, startDate, endDate, sessionsPerWeek, minutesPerSession } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.id)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) { if (!String(title || "").trim()) return bad(res, "title_required"); add("title", String(title).slice(0, 160)); }
    if (goal !== undefined) add("goal", String(goal || "").slice(0, 2000) || null);
    if (status !== undefined) { if (!["draft", "active", "archived"].includes(status)) return bad(res, "status_invalid"); add("status", status); }
    if (startDate !== undefined) add("start_date", String(startDate).slice(0, 10));
    if (endDate !== undefined) add("end_date", String(endDate).slice(0, 10));
    if (sessionsPerWeek !== undefined) add("sessions_per_week", Math.min(7, Math.max(1, Number(sessionsPerWeek) || 3)));
    if (minutesPerSession !== undefined) add("minutes_per_session", Math.min(240, Math.max(10, Number(minutesPerSession) || 30)));
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");
    const { rowCount } = await db.query(`update term_plans set ${sets.join(", ")} where id = $2 and family_id = $1`, params);
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await db.query("delete from term_plans where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]);
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/milestones/:mid", async (req, res, next) => {
  try {
    const { title, description, targetDate, resources, projectIdeas } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.mid)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) { if (!String(title || "").trim()) return bad(res, "title_required"); add("title", String(title).slice(0, 200)); }
    if (description !== undefined) add("description", String(description || "").slice(0, 600) || null);
    if (targetDate !== undefined) add("target_date", targetDate ? String(targetDate).slice(0, 10) : null);
    if (resources !== undefined) add("resources", JSON.stringify(Array.isArray(resources) ? resources.slice(0, 8) : []));
    if (projectIdeas !== undefined) add("project_ideas", JSON.stringify(Array.isArray(projectIdeas) ? projectIdeas.slice(0, 5) : []));
    if (!sets.length) return bad(res, "nothing_to_update");
    const { rowCount } = await db.query(
      `update plan_milestones m set ${sets.join(", ")}
         from term_plans p where m.plan_id = p.id and m.id = $2 and p.family_id = $1`,
      params
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generate a course for a milestone (just-in-time). Uses the enrolled
// learner's overrides when a specific learner is chosen.
router.post("/milestones/:mid/course", async (req, res, next) => {
  try {
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    const mid = Number(req.params.mid);
    const { learnerId } = req.body || {};
    const m = await db.query(
      `select m.*, p.family_id, p.subject, p.goal
         from plan_milestones m join term_plans p on p.id = m.plan_id
        where m.id = $1 and p.family_id = $2`,
      [mid, req.user.familyId]
    );
    if (!m.rows[0]) return bad(res, "not_found", 404);
    const row = m.rows[0];

    let lens = null;
    let learnerProfile = null;
    if (learnerId) {
      const l = await db.query(
        `select u.grade_level, u.interests, u.ai_notes, e.lens_override, e.personal_note
           from users u left join plan_enrollments e on e.learner_id = u.id and e.plan_id = $3
          where u.id = $1 and u.family_id = $2 and u.role = 'learner'`,
        [Number(learnerId), req.user.familyId, row.plan_id]
      );
      if (!l.rows[0]) return bad(res, "learner_not_found", 404);
      learnerProfile = l.rows[0];
      lens = learnerProfile.lens_override || null;
    }

    const spec = {
      topic: `${row.title}${row.description ? ` — ${row.description}` : ""}`,
      lens,
      learnerId: learnerId ? Number(learnerId) : null,
      gradeLevel: learnerProfile ? learnerProfile.grade_level : null,
      interests: learnerProfile ? learnerProfile.interests : [],
      learnerNotes: learnerProfile
        ? [learnerProfile.ai_notes, learnerProfile.personal_note].filter(Boolean).join("\n")
        : null,
      notes: `Part of the learning path "${row.subject}". ${row.goal || ""}`.slice(0, 1000),
      sources: [],
      milestoneId: mid,
    };
    const jobId = await jobs.enqueue(req.user.familyId, "course", spec, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
