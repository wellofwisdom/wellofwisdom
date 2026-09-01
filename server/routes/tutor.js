// SPDX-License-Identifier: AGPL-3.0-or-later
// Tutor routes. Learners hold the conversations; guides read every one of them
// and decide how much the tutor gives away.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const tutor = require("../lib/tutor");

const router = express.Router();
router.use(auth.authRequired);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function num(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

router.get("/modes", (_req, res) => {
  res.json({ modes: Object.values(tutor.MODES).map((m) => ({
    id: m.id, label: m.label, blurb: m.blurb, seesAnswer: m.seesAnswer,
  })) });
});

/** Start, or reuse, a thread for a lesson or an exercise. One open thread per
 *  item keeps the history in one place instead of scattering it. */
router.post("/threads", async (req, res, next) => {
  try {
    if (req.user.role !== "learner") return bad(res, "learner_only", 403);
    const lessonId = num((req.body || {}).lessonId);
    const itemId = num((req.body || {}).itemId);

    if (lessonId) {
      const owns = await db.query(
        `select l.id from lessons l join units u on u.id = l.unit_id
           join courses c on c.id = u.course_id
          where l.id = $1 and c.family_id = $2`,
        [lessonId, req.user.familyId]
      );
      if (!owns.rowCount) return bad(res, "lesson_not_found", 404);
    }

    const existing = await db.query(
      `select id from tutor_threads
        where learner_id = $1 and coalesce(item_id, 0) = coalesce($2, 0)
          and coalesce(lesson_id, 0) = coalesce($3, 0)
        order by updated_at desc limit 1`,
      [req.user.id, itemId, lessonId]
    );
    if (existing.rows[0]) return res.json({ threadId: Number(existing.rows[0].id), reused: true });

    const { rows } = await db.query(
      `insert into tutor_threads (family_id, learner_id, lesson_id, item_id, title)
       values ($1,$2,$3,$4,$5) returning id`,
      [req.user.familyId, req.user.id, lessonId, itemId, String((req.body || {}).title || "").slice(0, 160) || null]
    );
    res.status(201).json({ threadId: Number(rows[0].id), reused: false });
  } catch (err) {
    next(err);
  }
});

/** Say something to the tutor. */
router.post("/threads/:id/messages", async (req, res, next) => {
  try {
    if (req.user.role !== "learner") return bad(res, "learner_only", 403);
    const id = num(req.params.id);
    if (id === null) return bad(res, "id_invalid");
    const text = String((req.body || {}).text || "");
    if (!text.trim()) return bad(res, "empty_message");

    const out = await tutor.ask({
      threadId: id, learnerId: req.user.id, familyId: req.user.familyId, text,
    });
    res.json(out);
  } catch (err) {
    if (err.message === "thread_not_found") return bad(res, "not_found", 404);
    if (err.message === "empty_message") return bad(res, "empty_message");
    next(err);
  }
});

/** Read a thread. A learner sees their own; a guide sees any in the family. */
router.get("/threads/:id", async (req, res, next) => {
  try {
    const id = num(req.params.id);
    if (id === null) return bad(res, "id_invalid");
    const where = req.user.role === "learner"
      ? { sql: "th.id = $1 and th.learner_id = $2", params: [id, req.user.id] }
      : { sql: "th.id = $1 and th.family_id = $2", params: [id, req.user.familyId] };

    const t = await db.query(
      `select th.id, th.learner_id, th.lesson_id, th.item_id, th.title, th.created_at,
              u.name as learner_name, u.tutor_mode, l.title as lesson_title
         from tutor_threads th
         join users u on u.id = th.learner_id
         left join lessons l on l.id = th.lesson_id
        where ${where.sql}`,
      where.params
    );
    if (!t.rows[0]) return bad(res, "not_found", 404);

    const msgs = await db.query(
      "select id, role, content, refused, created_at from tutor_messages where thread_id = $1 order by created_at",
      [id]
    );
    res.json({
      thread: { ...t.rows[0], id: Number(t.rows[0].id), learner_id: Number(t.rows[0].learner_id) },
      messages: msgs.rows.map((m) => ({ ...m, id: Number(m.id) })),
    });
  } catch (err) {
    next(err);
  }
});

/** Every conversation in the family. This is the guide's window, and it is not
 *  optional: a child talking to an AI leaves a record their parent can read. */
router.get("/threads", auth.parentOnly, async (req, res, next) => {
  try {
    const learnerId = num(req.query.learnerId);
    const { rows } = await db.query(
      `select th.id, th.learner_id, th.title, th.created_at, th.updated_at,
              u.name as learner_name, l.title as lesson_title,
              (select count(*) from tutor_messages m where m.thread_id = th.id)::int as messages,
              (select count(*) from tutor_messages m where m.thread_id = th.id and m.refused)::int as refusals,
              (select content from tutor_messages m where m.thread_id = th.id
                order by created_at desc limit 1) as last_message
         from tutor_threads th
         join users u on u.id = th.learner_id
         left join lessons l on l.id = th.lesson_id
        where th.family_id = $1 ${learnerId ? "and th.learner_id = $2" : ""}
        order by th.updated_at desc limit 100`,
      learnerId ? [req.user.familyId, learnerId] : [req.user.familyId]
    );
    res.json({
      threads: rows.map((r) => ({
        ...r, id: Number(r.id), learner_id: Number(r.learner_id),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** How much the tutor gives this learner away. Guides only. */
router.put("/mode/:learnerId", auth.parentOnly, async (req, res, next) => {
  try {
    const learnerId = num(req.params.learnerId);
    const modeId = String((req.body || {}).mode || "");
    if (!tutor.MODES[modeId]) return bad(res, "mode_invalid");
    const { rows } = await db.query(
      `update users set tutor_mode = $3
        where id = $1 and family_id = $2 and role = 'learner'
        returning id, name, tutor_mode`,
      [learnerId, req.user.familyId, modeId]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ learner: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
