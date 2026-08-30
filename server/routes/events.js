// SPDX-License-Identifier: AGPL-3.0-or-later
// Calendar events: sessions, deadlines, field trips, exams. The guide's
// calendar merges these with plan milestone target dates.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");

const router = express.Router();
router.use(auth.parentOnly);

const KINDS = ["session", "deadline", "field_trip", "exam", "other"];

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

// All events + upcoming milestone targets, merged for the calendar view.
router.get("/", async (req, res, next) => {
  try {
    const events = await db.query(
      `select e.*, p.title as plan_title, c.title as course_title
         from events e
         left join term_plans p on p.id = e.plan_id
         left join courses c on c.id = e.course_id
        where e.family_id = $1
        order by e.on_date, e.id`,
      [req.user.familyId]
    );
    const milestones = await db.query(
      `select m.id, m.title, m.target_date, p.title as plan_title, p.id as plan_id
         from plan_milestones m join term_plans p on p.id = m.plan_id
        where p.family_id = $1 and p.status = 'active' and m.target_date is not null
        order by m.target_date`,
      [req.user.familyId]
    );
    res.json({ events: events.rows, milestones: milestones.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { title, description, onDate, atTime, kind, planId, courseId } = req.body || {};
    if (!String(title || "").trim()) return bad(res, "title_required");
    if (!validDate(onDate)) return bad(res, "date_invalid");
    const { rows } = await db.query(
      `insert into events (family_id, title, description, on_date, at_time, kind, plan_id, course_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        req.user.familyId,
        String(title).trim().slice(0, 200),
        description ? String(description).slice(0, 2000) : null,
        String(onDate),
        atTime ? String(atTime).slice(0, 10) : null,
        KINDS.includes(kind) ? kind : "other",
        planId ? Number(planId) : null,
        courseId ? Number(courseId) : null,
        req.user.id,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { title, description, onDate, atTime, kind, notifiedReset } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.id)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) { if (!String(title || "").trim()) return bad(res, "title_required"); add("title", String(title).trim().slice(0, 200)); }
    if (description !== undefined) add("description", description ? String(description).slice(0, 2000) : null);
    if (onDate !== undefined) { if (!validDate(onDate)) return bad(res, "date_invalid"); add("on_date", String(onDate)); add("notified_at", null); }
    if (atTime !== undefined) add("at_time", atTime ? String(atTime).slice(0, 10) : null);
    if (kind !== undefined) { if (!KINDS.includes(kind)) return bad(res, "kind_invalid"); add("kind", kind); }
    if (notifiedReset) add("notified_at", null);
    if (!sets.length) return bad(res, "nothing_to_update");
    const { rowCount } = await db.query(
      `update events set ${sets.join(", ")} where id = $2 and family_id = $1`, params
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from events where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
