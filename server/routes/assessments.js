// SPDX-License-Identifier: AGPL-3.0-or-later
// Assessments: test results and written evaluations, the third piece of the
// compliance pack after attendance and the portfolio.
//
// The guide records what the report said. This file never decides whether a
// result is enough: that belongs to the law of one place and the facts of one
// family, and the app knows neither. See lib/assessments.js.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const perm = require("../lib/perm");
const assessments = require("../lib/assessments");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

/** Family scope first, then assistant scope, so a stranger's learner reads as
 *  not-found rather than not-allowed. Returns the learner row or null (having
 *  already answered). Same gate as the attendance routes. */
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

const COLUMNS = "id, learner_id, taken_on, kind, title, given_by, grade_level, scores, summary, created_at, updated_at";

/** Every result on file for one learner, newest first. Not range-filtered by
 *  default: a family has one or two a year, and the whole history is short. */
router.get("/:learnerId", async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const { rows } = await db.query(
      `select ${COLUMNS} from assessments
        where learner_id = $1 and family_id = $2
        order by taken_on desc, id desc`,
      [learner.id, req.user.familyId]
    );
    res.json({
      learner: { id: Number(learner.id), name: learner.name },
      kinds: assessments.KINDS,
      assessments: rows.map(assessments.fromRow),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:learnerId", auth.requirePerm("record_assessment"), async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const { value, error } = assessments.normalizeAssessment(req.body);
    if (error) return bad(res, error);
    const { rows } = await db.query(
      `insert into assessments
         (family_id, learner_id, taken_on, kind, title, given_by, grade_level, scores, summary, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning ${COLUMNS}`,
      [
        req.user.familyId, learner.id, value.takenOn, value.kind, value.title, value.givenBy,
        value.gradeLevel, JSON.stringify(value.scores), value.summary, req.user.id,
      ]
    );
    res.status(201).json({ assessment: assessments.fromRow(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/** A correction replaces the whole record: the form always sends all of it, so
 *  there is no half-edited state to reason about. */
router.put("/:learnerId/:id", auth.requirePerm("record_assessment"), async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { value, error } = assessments.normalizeAssessment(req.body);
    if (error) return bad(res, error);
    const { rows } = await db.query(
      `update assessments
          set taken_on = $4, kind = $5, title = $6, given_by = $7, grade_level = $8,
              scores = $9, summary = $10, updated_at = now()
        where id = $1 and learner_id = $2 and family_id = $3
        returning ${COLUMNS}`,
      [
        id, learner.id, req.user.familyId, value.takenOn, value.kind, value.title, value.givenBy,
        value.gradeLevel, JSON.stringify(value.scores), value.summary,
      ]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ assessment: assessments.fromRow(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:learnerId/:id", auth.requirePerm("record_assessment"), async (req, res, next) => {
  try {
    const learner = await loadLearner(req, res, Number(req.params.learnerId));
    if (!learner) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { rowCount } = await db.query(
      "delete from assessments where id = $1 and learner_id = $2 and family_id = $3",
      [id, learner.id, req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
