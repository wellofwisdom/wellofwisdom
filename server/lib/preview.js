// SPDX-License-Identifier: AGPL-3.0-or-later
// "View as learner": let a guide walk the learner's app to see how it works.
//
// The naive way to do this is to log the guide in as the child. That is a bad
// idea twice over: it pollutes the child's real record with the guide's
// clicking, and it leaves the guide holding a learner session they have to
// escape from.
//
// Instead the identity is swapped for the duration of ONE request, and preview
// requests can only read. Every learner route already reads req.user.id, so
// they all work unchanged, and no route can accidentally write, including
// routes written later. The child's attempts, XP, streak, completions and
// tutor history are untouchable from here.
const db = require("./db");
const perm = require("./perm");

/** Learner ids an assistant is allowed to see. Loaded once per request. */
async function assignedLearners(userId) {
  const { rows } = await db.query(
    "select learner_id from guide_learners where guide_id = $1",
    [userId]
  );
  return rows.map((r) => Number(r.learner_id));
}

/**
 * If the caller asked to view as a learner and is allowed to, replace req.user
 * with that learner plus a preview flag. Otherwise leave the request alone.
 */
async function attachPreview(req, res, next) {
  try {
    const asId = Number(req.query.as || req.get("x-preview-learner") || 0);
    if (!asId || !req.user || req.user.role !== "parent") return next();
    if (!perm.can(req.user, "view_progress")) return next();

    const assigned = perm.visibleLearnerIds(req.user, null) === null
      ? null
      : await assignedLearners(req.user.id);
    if (!perm.canSeeLearner(req.user, asId, assigned || [])) {
      return res.status(403).json({ error: "not_your_learner" });
    }

    const { rows } = await db.query(
      `select id, name, grade_level, interests, ai_notes, tutor_mode
         from users where id = $1 and family_id = $2 and role = 'learner'`,
      [asId, req.user.familyId]
    );
    const learner = rows[0];
    if (!learner) return res.status(404).json({ error: "learner_not_found" });

    req.previewBy = { id: req.user.id, name: req.user.name };
    req.user = {
      id: Number(learner.id),
      role: "learner",
      name: learner.name,
      familyId: req.user.familyId,
      familyName: req.user.familyName,
      joinCode: req.user.joinCode,
      prefs: {},
      gradeLevel: learner.grade_level,
      interests: learner.interests || [],
      guideRole: null,
      // The flag the write guard looks for.
      preview: true,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Preview can look at anything the learner sees and change none of it. */
function denyPreviewWrites(req, res, next) {
  if (req.user && req.user.preview && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return res.status(403).json({
      error: "preview_read_only",
      message: "You are viewing as a learner. Nothing you do here is recorded.",
    });
  }
  next();
}

module.exports = { attachPreview, denyPreviewWrites, assignedLearners };
