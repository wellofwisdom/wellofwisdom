// SPDX-License-Identifier: AGPL-3.0-or-later
// Attendance: days of instruction, derived from the work and adjusted by the
// guide. The first piece of the compliance pack.
//
// What this file does NOT do is decide what any state requires. The requirement
// is a number the guide types in and a label they write themselves. Homeschool
// law varies by state, changes, and turns on facts about a family that no app
// knows; telling somebody they had filed enough days when they had not is worse
// than never offering the number.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const perm = require("../lib/perm");
const attendance = require("../lib/attendance");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

/** Family scope first, then assistant scope, so a stranger's learner reads as
 *  not-found rather than not-allowed. Returns the learner row or null (having
 *  already answered). */
async function loadLearner(req, res, learnerId) {
  if (!Number.isInteger(learnerId)) {
    bad(res, "id_invalid");
    return null;
  }
  const { rows } = await db.query(
    "select id, name from users where id = $1 and family_id = $2 and role = 'learner'",
    [learnerId, req.user.familyId]
  );
  if (!rows[0]) {
    bad(res, "learner_not_found", 404);
    return null;
  }
  const assigned = await assignedLearners(req.user.id);
  if (!perm.canSeeLearner(req.user, learnerId, assigned)) {
    bad(res, "not_your_learner", 403);
    return null;
  }
  return rows[0];
}

async function familyPrefs(familyId) {
  const { rows } = await db.query("select prefs from families where id = $1", [familyId]);
  return (rows[0] && rows[0].prefs) || {};
}

/** Every day this learner has something in the record for, with what it was.
 *  Three sources, each with its own timestamp column, unioned and folded to one
 *  row per day: the counts are what make a claimed day defensible to whoever
 *  reads the filing. */
async function workDays(learnerId, fromISO, toISO) {
  const from = `${fromISO} 00:00:00`;
  const to = `${toISO} 23:59:59`;
  const { rows } = await db.query(
    `select day, sum(attempts)::int as attempts, sum(lessons)::int as lessons, sum(submissions)::int as submissions
       from (
         select date(created_at) as day, count(*) as attempts, 0 as lessons, 0 as submissions
           from attempts where learner_id = $1 and created_at between $2 and $3 group by 1
         union all
         select date(completed_at) as day, 0, count(*), 0
           from lesson_completions where learner_id = $1 and completed_at between $2 and $3 group by 1
         union all
         select date(submitted_at) as day, 0, 0, count(*)
           from submissions where learner_id = $1 and submitted_at between $2 and $3 group by 1
       ) all_work
      group by day order by day`,
    [learnerId, from, to]
  );
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    attempts: r.attempts,
    lessons: r.lessons,
    submissions: r.submissions,
  }));
}

async function overrides(learnerId, fromISO, toISO) {
  const { rows } = await db.query(
    `select day, counted, minutes, note from attendance_days
      where learner_id = $1 and day between $2 and $3 order by day`,
    [learnerId, fromISO, toISO]
  );
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    counted: r.counted,
    minutes: r.minutes,
    note: r.note,
  }));
}

/** The range to report on: what was asked for, or the school year containing
 *  today under the family's own year start. */
function rangeFor(query, requirement) {
  const { from, to } = query || {};
  if (attendance.isDay(from) && attendance.isDay(to) && from <= to) return { from, to };
  const y = attendance.schoolYear(new Date().toISOString().slice(0, 10), requirement.yearStartMonth);
  return { from: y.from, to: y.to, label: y.label };
}

async function buildLog(req, learner, query) {
  const prefs = await familyPrefs(req.user.familyId);
  const requirement = attendance.requirementFrom(prefs);
  const range = rangeFor(query, requirement);
  const [work, manual] = await Promise.all([
    workDays(learner.id, range.from, range.to),
    overrides(learner.id, range.from, range.to),
  ]);
  const days = attendance.mergeDays(work, manual);
  return { range, requirement, days, summary: attendance.summarize(days, requirement) };
}

/** Who can be reported on, so the page can offer a picker without a second
 *  round trip through /api/me (which is not scoped for an assistant). */
router.get("/learners", async (req, res, next) => {
  try {
    const assigned = await assignedLearners(req.user.id);
    const visible = perm.visibleLearnerIds(req.user, assigned);
    const params = [req.user.familyId];
    let scope = "";
    if (visible !== null) {
      params.push(visible);
      scope = ` and id = any($${params.length}::bigint[])`;
    }
    const { rows } = await db.query(
      `select id, name, grade_level from users
        where family_id = $1 and role = 'learner'${scope} order by created_at`,
      params
    );
    const prefs = await familyPrefs(req.user.familyId);
    res.json({
      learners: rows.map((r) => ({ ...r, id: Number(r.id) })),
      requirement: attendance.requirementFrom(prefs),
    });
  } catch (err) {
    next(err);
  }
});

/** The log for one learner over a range. */
router.get("/:learnerId", async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const out = await buildLog(req, learner, req.query);
    res.json({ learner: { id: Number(learner.id), name: learner.name }, ...out });
  } catch (err) {
    next(err);
  }
});

/** The same log as a CSV to hand to an office. Not under /api, in spirit, but
 *  it needs the session, so it stays here and sets its own headers. */
router.get("/:learnerId/export.csv", async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const { range, days } = await buildLog(req, learner, req.query);
    const safeName = String(learner.name).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "learner";
    res.type("text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="attendance-${safeName}-${range.from}-to-${range.to}.csv"`);
    res.send(attendance.toCsv(days, { learnerName: learner.name, from: range.from, to: range.to }));
  } catch (err) {
    next(err);
  }
});

/** Claim a day, or strike one. An override row exists only where the guide has
 *  made a decision; everything else stays derived. */
router.put("/:learnerId/:day", auth.requirePerm("record_attendance"), async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const day = String(req.params.day);
    if (!attendance.isDay(day)) return bad(res, "day_invalid");
    const b = req.body || {};
    const counted = b.counted !== false;
    const minutes = b.minutes == null || b.minutes === ""
      ? null
      : Math.max(0, Math.min(1440, Math.round(Number(b.minutes) || 0)));
    const note = b.note ? String(b.note).slice(0, 500) : null;

    await db.query(
      `insert into attendance_days (family_id, learner_id, day, counted, minutes, note, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (learner_id, day) do update
          set counted = excluded.counted, minutes = excluded.minutes,
              note = excluded.note, updated_at = now()`,
      [req.user.familyId, learner.id, day, counted, minutes, note, req.user.id]
    );
    res.json({ ok: true, day: { day, counted, minutes, note } });
  } catch (err) {
    next(err);
  }
});

/** Drop the override and let the record speak again. */
router.delete("/:learnerId/:day", auth.requirePerm("record_attendance"), async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const day = String(req.params.day);
    if (!attendance.isDay(day)) return bad(res, "day_invalid");
    await db.query("delete from attendance_days where learner_id = $1 and day = $2", [learner.id, day]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** What this family has to file, in their own words and numbers. Owner and
 *  guide only: it is a family-wide setting, not a per-learner one. */
router.put("/requirement", auth.requirePerm("set_compliance"), async (req, res, next) => {
  try {
    const prefs = await familyPrefs(req.user.familyId);
    const b = req.body || {};
    const next_ = {
      ...prefs,
      compliance: attendance.requirementFrom({
        compliance: {
          label: b.label,
          requiredDays: b.requiredDays,
          requiredHours: b.requiredHours,
          yearStartMonth: b.yearStartMonth,
        },
      }),
    };
    await db.query("update families set prefs = $2 where id = $1", [req.user.familyId, JSON.stringify(next_)]);
    res.json({ requirement: next_.compliance });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
