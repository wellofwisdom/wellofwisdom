// SPDX-License-Identifier: AGPL-3.0-or-later
// Badge engine: auto-awards badges from real work. Streaks derive from
// attempt dates (consecutive days with any activity, grace for today).
const db = require("./db");

const BADGES = [
  { id: "first_lesson", label: "First Steps", icon: "🌱", description: "Completed your first lesson" },
  { id: "first_correct", label: "Bullseye", icon: "🎯", description: "Got your first answer right" },
  { id: "ten_correct", label: "Sharpshooter", icon: "✏️", description: "10 correct answers" },
  { id: "fifty_correct", label: "Half Century", icon: "🏃", description: "50 correct answers" },
  { id: "century", label: "Century Club", icon: "💯", description: "100 correct answers" },
  { id: "streak_3", label: "Warming Up", icon: "🔥", description: "3-day learning streak" },
  { id: "streak_7", label: "On Fire", icon: "🔥", description: "7-day learning streak" },
  { id: "streak_30", label: "Unstoppable", icon: "🌟", description: "30-day learning streak" },
  { id: "course_first", label: "Course Conqueror", icon: "🏔️", description: "Completed your first course" },
  { id: "review_10", label: "Memory Master", icon: "🧠", description: "10 spaced reviews completed" },
  { id: "adventure_xp_100", label: "Rising Hero", icon: "⚔️", description: "Earned 100 adventure XP" },
  { id: "adventure_xp_500", label: "Legendary", icon: "👑", description: "Earned 500 adventure XP" },
];

function badgeById(id) {
  return BADGES.find((b) => b.id === id);
}

/** Compute the learner's current + best streak from attempt dates. */
async function computeStreak(learnerId) {
  const { rows } = await db.query(
    `select distinct date(created_at) as day from attempts
      where learner_id = $1 order by day desc limit 60`,
    [learnerId]
  );
  if (!rows.length) return { current: 0, best: 0, activeToday: false };

  const days = rows.map((r) => r.day);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const activeToday = days.some((d) => d === todayStr || d === yesterdayStr);

  // current streak: walk backward from today/yesterday
  let current = 0;
  if (activeToday) {
    let check = new Date(today);
    // if no activity today yet, start from yesterday
    if (!days.includes(todayStr)) check = new Date(today.getTime() - 86400000);
    while (true) {
      const s = check.toISOString().slice(0, 10);
      if (days.includes(s)) {
        current++;
        check = new Date(check.getTime() - 86400000);
      } else break;
    }
  }

  // best streak: scan all days
  let best = 0;
  let run = 0;
  let prev = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (prev && (d - prev) === 86400000) {
      run++;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }

  return { current, best: Math.max(best, current), activeToday: days.includes(todayStr) };
}

/** Check all badge conditions for a learner; auto-award any newly earned.
 *  Fail-open: badge problems never break learning. Returns newly earned. */
async function checkAndAward(learnerId, familyId) {
  try {
    const stats = await db.query(
      `select
        (select count(*) from lesson_completions where learner_id = $1)::int as lessons,
        (select count(*) from attempts where learner_id = $1 and correct)::int as correct,
        (select count(*) from review_schedule where learner_id = $1 and reps > 0)::int as reviews,
        (select coalesce(sum(xp), 0) from adventures where learner_id = $1 or learner_id is null)::int as xp`,
      [learnerId]
    );
    const s = stats.rows[0];
    const streak = await computeStreak(learnerId);
    const completed = await db.query(
      `select count(*)::int from (
        select c.id,
          (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = c.id) as total,
          (select count(*) from lesson_completions lc where lc.course_id = c.id and lc.learner_id = $1) as done
        from courses c where c.family_id = $2 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $1)
      ) t where t.total > 0 and t.done >= t.total`,
      [learnerId, familyId]
    );

    const earned = [];
    // first lesson
    if (s.lessons >= 1) earned.push("first_lesson");
    // correct answer milestones
    if (s.correct >= 1) earned.push("first_correct");
    if (s.correct >= 10) earned.push("ten_correct");
    if (s.correct >= 50) earned.push("fifty_correct");
    if (s.correct >= 100) earned.push("century");
    // streaks
    if (streak.best >= 3) earned.push("streak_3");
    if (streak.best >= 7) earned.push("streak_7");
    if (streak.best >= 30) earned.push("streak_30");
    // course complete
    if (completed.rows[0] && completed.rows[0].count >= 1) earned.push("course_first");
    // reviews
    if (s.reviews >= 10) earned.push("review_10");
    // adventure XP
    if (s.xp >= 100) earned.push("adventure_xp_100");
    if (s.xp >= 500) earned.push("adventure_xp_500");

    const newlyEarned = [];
    for (const badge of earned) {
      const r = await db.query(
        `insert into badges (family_id, learner_id, badge)
         values ($1, $2, $3) on conflict (learner_id, badge) do nothing returning id`,
        [familyId, learnerId, badge]
      );
      if (r.rowCount) newlyEarned.push(badgeById(badge));
    }
    return newlyEarned;
  } catch (err) {
    console.error(`[badges] check failed (ignored): ${err.message}`);
    return [];
  }
}

/** Get all badges for a learner (with full metadata). */
async function forLearner(learnerId) {
  const { rows } = await db.query(
    "select badge, earned_at from badges where learner_id = $1 order by earned_at",
    [learnerId]
  );
  return rows.map((r) => ({ ...badgeById(r.badge), earned_at: r.earned_at })).filter((b) => b.id);
}

module.exports = { BADGES, badgeById, computeStreak, checkAndAward, forLearner };
