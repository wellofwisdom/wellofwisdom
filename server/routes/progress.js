// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide progress overview: real numbers per learner, per course.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const ai = require("../lib/ai");
const perm = require("../lib/perm");
const misconceptions = require("../lib/misconceptions");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

router.get("/", async (req, res, next) => {
  try {
    const learners = await db.query(
      `select u.id, u.name, u.grade_level,
              (select count(*) from attempts a where a.learner_id = u.id)::int as attempts_total,
              (select count(*) from attempts a where a.learner_id = u.id and a.correct)::int as attempts_correct,
              (select count(distinct date(a.created_at)) from attempts a where a.learner_id = u.id)::int as active_days,
              (select count(*) from lesson_completions lc where lc.learner_id = u.id)::int as lessons_done,
              (select count(*) from review_schedule rs where rs.learner_id = u.id and rs.due_at <= now())::int as reviews_due,
              (select count(*) from badges b where b.learner_id = u.id)::int as badge_count
         from users u where u.family_id = $1 and u.role = 'learner' order by u.created_at`,
      [req.user.familyId]
    );

    const out = [];
    for (const l of learners.rows) {
      const courses = await db.query(
        `select c.id, c.title, c.lens,
                (select count(*) from lessons ls join units un on un.id = ls.unit_id where un.course_id = c.id)::int as lessons_total,
                (select count(*) from lesson_completions lc where lc.course_id = c.id and lc.learner_id = $2)::int as lessons_done
           from courses c
          where c.family_id = $1 and c.status = 'published'
            and (c.learner_id is null or c.learner_id = $2)
          order by c.created_at desc`,
        [req.user.familyId, l.id]
      );
      out.push({ ...l, courses: courses.rows });
    }
    res.json({ learners: out });
  } catch (err) {
    next(err);
  }
});

// Misconception detection: name the pattern behind a learner's wrong answers.
// On demand (a guide clicks a button), so the AI cost is paid only when asked.
router.post("/misconceptions/:learnerId", async (req, res, next) => {
  try {
    const learnerId = Number(req.params.learnerId);
    if (!Number.isInteger(learnerId)) return res.status(400).json({ error: "id_invalid" });

    // Family scope, plus assistant scoping: a tutor only sees their own student.
    const own = await db.query(
      "select id from users where id = $1 and family_id = $2 and role = 'learner'",
      [learnerId, req.user.familyId]
    );
    if (!own.rows[0]) return res.status(404).json({ error: "learner_not_found" });
    const assigned = await assignedLearners(req.user.id);
    if (!perm.canSeeLearner(req.user, learnerId, assigned)) return res.status(403).json({ error: "not_allowed" });

    if (!ai.configured()) return res.status(503).json({ error: "ai_not_configured" });

    // Only wrong answers with a ground truth (mcq/numeric): a text exercise is
    // self-check, its correct is null, so it never lands here.
    const wrong = await db.query(
      `select a.answer as given, a.question_index, i.type, i.content, c.title as course_title, c.lens
         from attempts a
         join lesson_items i on i.id = a.item_id
         join lessons l on l.id = i.lesson_id
         join units un on un.id = l.unit_id
         join courses c on c.id = un.course_id
        where a.family_id = $1 and a.learner_id = $2 and a.correct = false
        order by a.created_at desc
        limit 60`,
      [req.user.familyId, learnerId]
    );

    const rows = wrong.rows.map((r) => {
      const subject = r.lens ? `${r.course_title} (through ${r.lens})` : r.course_title;
      const content = r.content || {};
      if (r.type === "exercise") {
        return { prompt: content.prompt, kind: content.kind, choices: content.choices, correctAnswer: content.answer, given: r.given, subject };
      }
      if (r.type === "video") {
        const q = (content.questions && content.questions[r.question_index]) || {};
        return { prompt: q.prompt, kind: "mcq", choices: q.choices, correctAnswer: q.answer, given: r.given, subject };
      }
      return null;
    }).filter(Boolean);

    const analysis = await misconceptions.analyze({ attempts: rows, familyId: req.user.familyId });
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
