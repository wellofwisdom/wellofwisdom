// SPDX-License-Identifier: AGPL-3.0-or-later
// Resource library: one database of learning resources, many views.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");

const router = express.Router();
router.use(auth.parentOnly);

const TYPES = ["link", "video", "book", "tool", "place", "note"];
const STATUSES = ["inbox", "queued", "in_use", "done"];

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select r.*, c.title as course_title, p.title as plan_title
         from resources r
         left join courses c on c.id = r.course_id
         left join term_plans p on p.id = r.plan_id
        where r.family_id = $1
        order by r.updated_at desc`,
      [req.user.familyId]
    );
    res.json({ resources: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { title, url, type, subject, status, rating, dateFor, notes, courseId, planId } = req.body || {};
    if (!String(title || "").trim()) return bad(res, "title_required");
    if (url && !/^https?:\/\//.test(String(url))) return bad(res, "url_invalid");
    const { rows } = await db.query(
      `insert into resources (family_id, title, url, type, subject, status, rating, date_for, notes, course_id, plan_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [
        req.user.familyId,
        String(title).trim().slice(0, 300),
        url ? String(url).trim().slice(0, 1000) : null,
        TYPES.includes(type) ? type : "link",
        subject ? String(subject).trim().slice(0, 100) : null,
        STATUSES.includes(status) ? status : "inbox",
        Math.min(5, Math.max(0, Number(rating) || 0)),
        dateFor ? String(dateFor).slice(0, 10) : null,
        notes ? String(notes).slice(0, 5000) : null,
        courseId ? Number(courseId) : null,
        planId ? Number(planId) : null,
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
    const { title, url, type, subject, status, rating, dateFor, notes, courseId, planId } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.id)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) { if (!String(title || "").trim()) return bad(res, "title_required"); add("title", String(title).trim().slice(0, 300)); }
    if (url !== undefined) add("url", url ? String(url).trim().slice(0, 1000) : null);
    if (type !== undefined) { if (!TYPES.includes(type)) return bad(res, "type_invalid"); add("type", type); }
    if (subject !== undefined) add("subject", subject ? String(subject).trim().slice(0, 100) : null);
    if (status !== undefined) { if (!STATUSES.includes(status)) return bad(res, "status_invalid"); add("status", status); }
    if (rating !== undefined) add("rating", Math.min(5, Math.max(0, Number(rating) || 0)));
    if (dateFor !== undefined) add("date_for", dateFor ? String(dateFor).slice(0, 10) : null);
    if (notes !== undefined) add("notes", notes ? String(notes).slice(0, 5000) : null);
    if (courseId !== undefined) add("course_id", courseId ? Number(courseId) : null);
    if (planId !== undefined) add("plan_id", planId ? Number(planId) : null);
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");
    const { rowCount } = await db.query(
      `update resources set ${sets.join(", ")} where id = $2 and family_id = $1`,
      params
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
      "delete from resources where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
