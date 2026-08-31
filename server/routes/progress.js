// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide progress overview: real numbers per learner, per course.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");

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

module.exports = router;
