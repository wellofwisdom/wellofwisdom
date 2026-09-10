// SPDX-License-Identifier: AGPL-3.0-or-later
// Submitted work: the guide's side of a project hand-in.
//
// The shape of this feature is one rule made concrete: the AI drafts, a person
// decides. POST /:id/draft writes to `ai_feedback`, which no learner route ever
// selects. PATCH writes `feedback` and `outcome`, and only a guide can call it.
// Nothing here has an "auto-grade" path, on purpose: a model marking a child's
// work by itself is the thing this project exists not to be.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const ai = require("../lib/ai");
const perm = require("../lib/perm");
const rubric = require("../lib/rubric");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

const ROW = `s.id, s.learner_id, s.item_id, s.body, s.status, s.submitted_at,
             s.feedback, s.outcome, s.returned_at, s.ai_feedback, s.ai_at, s.updated_at,
             u.name as learner_name, u.grade_level,
             i.content as item_content, l.id as lesson_id, l.title as lesson_title,
             c.id as course_id, c.title as course_title`;

const FROM = `from submissions s
              join users u on u.id = s.learner_id
              join lesson_items i on i.id = s.item_id
              join lessons l on l.id = i.lesson_id
              join units un on un.id = l.unit_id
              join courses c on c.id = un.course_id`;

function shape(row, { withBody = true } = {}) {
  const content = row.item_content || {};
  return {
    id: Number(row.id),
    learner_id: Number(row.learner_id),
    learner_name: row.learner_name,
    grade_level: row.grade_level,
    item_id: Number(row.item_id),
    lesson_id: Number(row.lesson_id),
    lesson_title: row.lesson_title,
    course_id: Number(row.course_id),
    course_title: row.course_title,
    project: { title: content.title || null, description: content.description || null, rubric: content.rubric || null },
    body: withBody ? row.body || "" : "",
    words: rubric.wordCount(row.body),
    status: row.status,
    submitted_at: row.submitted_at,
    feedback: row.feedback || null,
    outcome: row.outcome || null,
    returned_at: row.returned_at,
    ai_feedback: row.ai_feedback || null,
    ai_at: row.ai_at,
    updated_at: row.updated_at,
  };
}

/** Everything handed in, newest first. A draft nobody has handed in yet is not
 *  listed: reading over a learner's shoulder while they write is not the deal. */
router.get("/", async (req, res, next) => {
  try {
    const assigned = await assignedLearners(req.user.id);
    const visible = perm.visibleLearnerIds(req.user, assigned);
    const params = [req.user.familyId];
    let scope = "";
    if (visible !== null) {
      params.push(visible);
      scope = ` and s.learner_id = any($${params.length}::bigint[])`;
    }
    let statusFilter = "";
    const wanted = String(req.query.status || "").trim();
    if (wanted === "submitted" || wanted === "returned") {
      params.push(wanted);
      statusFilter = ` and s.status = $${params.length}`;
    }
    const { rows } = await db.query(
      `select ${ROW} ${FROM}
        where s.family_id = $1 and s.status <> 'draft'${scope}${statusFilter}
        order by (s.status = 'submitted') desc, s.submitted_at desc nulls last, s.id desc
        limit 200`,
      params
    );
    res.json({
      submissions: rows.map((r) => shape(r, { withBody: false })),
      outcomes: rubric.OUTCOMES,
      aiConfigured: ai.configured(),
    });
  } catch (err) {
    next(err);
  }
});

/** One submission in full, with the brief and rubric it was written against. */
async function load(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    bad(res, "id_invalid");
    return null;
  }
  const { rows } = await db.query(
    `select ${ROW} ${FROM} where s.id = $1 and s.family_id = $2`,
    [id, req.user.familyId]
  );
  if (!rows[0]) {
    // A stranger's submission reads as not-found, never as not-allowed.
    bad(res, "not_found", 404);
    return null;
  }
  const assigned = await assignedLearners(req.user.id);
  if (!perm.canSeeLearner(req.user, rows[0].learner_id, assigned)) {
    bad(res, "not_your_learner", 403);
    return null;
  }
  return rows[0];
}

router.get("/:id", async (req, res, next) => {
  try {
    const row = await load(req, res);
    if (!row) return;
    res.json({ submission: shape(row), outcomes: rubric.OUTCOMES, aiConfigured: ai.configured() });
  } catch (err) {
    next(err);
  }
});

/** Draft feedback against the rubric. On demand only, so the spend happens when
 *  a guide asks for it and never on a learner's hand-in. The draft is stored
 *  where only a guide can read it. */
router.post("/:id/draft", auth.requirePerm("grade"), async (req, res, next) => {
  try {
    const row = await load(req, res);
    if (!row) return;
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    const content = row.item_content || {};
    if (!content.rubric) return bad(res, "no_rubric");

    const draft = await rubric.draftFeedback({
      title: content.title,
      description: content.description,
      rubric: content.rubric,
      body: row.body,
      gradeLevel: row.grade_level,
      familyId: req.user.familyId,
    });
    if (draft.note === "too_short") {
      return res.json({ draft, note: "too_short" });
    }
    await db.query(
      "update submissions set ai_feedback = $2, ai_at = now(), updated_at = now() where id = $1",
      [row.id, JSON.stringify(draft)]
    );
    res.json({ draft });
  } catch (err) {
    next(err);
  }
});

/** Save the guide's own words, and hand them back when they are ready.
 *  `return` is separate from saving so a guide can stop halfway through
 *  writing without the learner reading a half-finished note. */
router.patch("/:id", auth.requirePerm("grade"), async (req, res, next) => {
  try {
    const row = await load(req, res);
    if (!row) return;
    const b = req.body || {};
    const sets = [];
    const params = [row.id];
    const add = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (b.feedback !== undefined) add("feedback", String(b.feedback || "").slice(0, 8000) || null);
    if (b.outcome !== undefined) {
      const o = b.outcome ? String(b.outcome) : null;
      if (o && !rubric.OUTCOME_IDS.includes(o)) return bad(res, "outcome_invalid");
      add("outcome", o);
    }
    const returning = Boolean(b.return);
    if (returning) {
      const text = b.feedback !== undefined ? String(b.feedback || "") : row.feedback || "";
      if (!text.trim()) return bad(res, "nothing_to_return");
      add("status", "returned");
      sets.push("returned_at = now()");
      add("graded_by", req.user.id);
    }
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");

    const { rows } = await db.query(
      `update submissions s set ${sets.join(", ")} where s.id = $1 returning s.id`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    const fresh = await db.query(`select ${ROW} ${FROM} where s.id = $1`, [row.id]);
    res.json({ submission: shape(fresh.rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
