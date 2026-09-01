// SPDX-License-Identifier: AGPL-3.0-or-later
// Spaced review scheduler. An SM-2-style ladder, the decades-proven core of
// spaced repetition. (An FSRS adapter can slot in behind this same interface
// later; the schema already stores everything it needs.)
//
// Right answer: 1 day → 3 days → 7 days → interval × ease (ease drifts up).
// Wrong answer: comes back today, ease drifts down. Ease clamped [1.3, 3.0].
const db = require("./db");

const LADDER = [1, 3, 7];

function nextSchedule(prev, correct) {
  const s = prev || { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
  const ease = Number(s.ease);
  if (correct) {
    const interval = s.reps < LADDER.length ? LADDER[s.reps] : Math.round(s.interval_days * ease);
    return {
      ease: Math.min(3, ease + 0.05),
      interval_days: interval,
      reps: s.reps + 1,
      lapses: s.lapses,
    };
  }
  return {
    ease: Math.max(1.3, ease - 0.2),
    interval_days: 0, // due immediately: mistakes come back today
    reps: 0,
    lapses: s.lapses + 1,
  };
}

function dueDate(intervalDays) {
  return new Date(Date.now() + Number(intervalDays) * 86400000);
}

/** Called after every graded exercise attempt. Fail-open: never blocks grading. */
async function recordAttempt({ familyId, learnerId, itemId, correct }) {
  try {
    const { rows } = await db.query(
      "select ease, interval_days, reps, lapses from review_schedule where learner_id = $1 and item_id = $2",
      [learnerId, itemId]
    );
    const next = nextSchedule(rows[0], correct);
    await db.query(
      `insert into review_schedule (family_id, learner_id, item_id, ease, interval_days, reps, lapses, due_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, now())
       on conflict (learner_id, item_id)
       do update set ease = $4, interval_days = $5, reps = $6, lapses = $7, due_at = $8, updated_at = now()`,
      [familyId, learnerId, itemId, next.ease, next.interval_days, next.reps, next.lapses, dueDate(next.interval_days)]
    );
  } catch (err) {
    console.error(`[review] schedule update failed (ignored): ${err.message}`);
  }
}

/** Exercises due for review across the learner's published courses. */
async function dueForLearner(learnerId, familyId, { limit = 25 } = {}) {
  const { rows } = await db.query(
    `select rs.item_id, rs.reps, rs.lapses,
            i.content, l.title as lesson_title, c.title as course_title, c.id as course_id,
            (select count(*) from review_schedule rs2
               join lesson_items i2 on i2.id = rs2.item_id
               join lessons l2 on l2.id = i2.lesson_id join units un2 on un2.id = l2.unit_id
               join courses c2 on c2.id = un2.course_id
              where rs2.learner_id = $1 and rs2.due_at <= now()
                and c2.status = 'published' and (c2.learner_id is null or c2.learner_id = $1)
                and i2.type = 'exercise')::int as due_total
       from review_schedule rs
       join lesson_items i on i.id = rs.item_id
       join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
       join courses c on c.id = un.course_id
      where rs.learner_id = $1 and rs.due_at <= now()
        and c.status = 'published' and (c.learner_id is null or c.learner_id = $1)
        and i.type = 'exercise'
      order by rs.due_at asc
      limit $2`,
    [learnerId, limit]
  );
  return rows;
}

module.exports = { nextSchedule, recordAttempt, dueForLearner };
