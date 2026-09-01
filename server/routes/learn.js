// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner routes: my courses, tree WITHOUT answers, graded attempts,
// explain-my-mistake (AI), progress. Learners only see published courses
// assigned to them (learner_id null = whole family).
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const ai = require("../lib/ai");
const { gradeExercise } = require("../lib/grade");
const review = require("../lib/review");

const router = express.Router();
router.use(auth.authRequired);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Strip answers/explanations/hints from item content before it reaches a learner.
function learnerItem(item) {
  const c = item.content || {};
  if (item.type === "exercise") {
    const out = { prompt: c.prompt, kind: c.kind };
    if (c.choices) out.choices = c.choices;
    return { id: item.id, type: item.type, position: item.position, content: out };
  }
  if (item.type === "video") {
    const out = { youtubeId: c.youtubeId, uploadId: c.uploadId, title: c.title, note: c.note };
    if (c.questions) out.questions = c.questions.map((q) => ({ prompt: q.prompt, choices: q.choices }));
    return { id: item.id, type: item.type, position: item.position, content: out };
  }
  return { id: item.id, type: item.type, position: item.position, content: c };
}

router.get("/courses", async (req, res, next) => {
  try {
    const courses = await db.query(
      `select c.id, c.title, c.topic, c.lens, c.description
         from courses c
        where c.family_id = $1 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $2)
        order by c.created_at desc`,
      [req.user.familyId, req.user.id]
    );
    if (!courses.rows.length) return res.json({ courses: [] });

    // Everything needed to compute per-lesson completion in one pass.
    const ids = courses.rows.map((c) => c.id);
    const lessons = await db.query(
      `select l.id, l.unit_id, un.course_id
         from lessons l join units un on un.id = l.unit_id
        where un.course_id = any($1::bigint[])`,
      [ids]
    );
    const items = await db.query(
      `select i.id, i.lesson_id, i.type, i.content
         from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
        where un.course_id = any($1::bigint[])`,
      [ids]
    );
    const attempts = await db.query(
      `select a.item_id, a.question_index, a.correct
         from attempts a join lesson_items i on i.id = a.item_id
         join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
        where un.course_id = any($1::bigint[]) and a.learner_id = $2`,
      [ids, req.user.id]
    );
    const state = new Map();
    for (const a of attempts.rows) {
      if (!state.has(a.item_id)) state.set(a.item_id, { correct: new Set(), attempted: new Set() });
      const s = state.get(a.item_id);
      s.attempted.add(a.question_index);
      if (a.correct === true) s.correct.add(a.question_index);
    }
    const lessonDone = new Set();
    for (const l of lessons.rows) {
      const lItems = items.rows.filter((i) => i.lesson_id === l.id);
      const gradable = lItems.filter(
        (i) =>
          (i.type === "exercise" && i.content.kind !== "text") ||
          (i.type === "video" && Array.isArray(i.content.questions) && i.content.questions.length)
      );
      const selfCheck = lItems.filter((i) => i.type === "exercise" && i.content.kind === "text");
      const done =
        gradable.length + selfCheck.length > 0 &&
        gradable.every((i) => {
          const s = state.get(i.id);
          const qCount = i.type === "video" ? i.content.questions.length : 1;
          return s && Array.from({ length: qCount }, (_, x) => x).every((x) => s.correct.has(x));
        }) &&
        selfCheck.every((i) => state.has(i.id));
      if (done) lessonDone.add(l.id);
    }
    res.json({
      courses: courses.rows.map((c) => {
        const total = lessons.rows.filter((l) => l.course_id === c.id).length;
        const done = lessons.rows.filter((l) => l.course_id === c.id && lessonDone.has(l.id)).length;
        return { ...c, lesson_count: total, lessons_done: done };
      }),
    });
  } catch (err) {
    next(err);
  }
});

async function loadCourseForLearner(courseId, user) {
  const c = await db.query(
    `select id, title, topic, lens, description from courses
      where id = $1 and family_id = $2 and status = 'published'
        and (learner_id is null or learner_id = $3)`,
    [courseId, user.familyId, user.id]
  );
  if (!c.rows[0]) return null;
  const units = await db.query("select id, title, position from units where course_id = $1 order by position, id", [courseId]);
  const lessons = await db.query(
    `select l.id, l.unit_id, l.title, l.summary, l.position
       from lessons l join units un on un.id = l.unit_id where un.course_id = $1 order by l.position, l.id`,
    [courseId]
  );
  const items = await db.query(
    `select i.id, i.lesson_id, i.type, i.position, i.content
       from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
      where un.course_id = $1 order by i.position, i.id`,
    [courseId]
  );
  // graded-item state per item for THIS learner
  const attempts = await db.query(
    `select a.item_id, a.question_index, a.correct from attempts a
       join lesson_items i on i.id = a.item_id
       join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
      where un.course_id = $1 and a.learner_id = $2`,
    [courseId, user.id]
  );
  const state = new Map(); // itemId -> { gradedTotal, correctSet:Set("qIdx") , attempted:Set }
  for (const a of attempts.rows) {
    if (!state.has(a.item_id)) state.set(a.item_id, { correct: new Set(), attempted: new Set() });
    const s = state.get(a.item_id);
    s.attempted.add(a.question_index);
    if (a.correct === true) s.correct.add(a.question_index);
  }
  const lessonDone = new Set();
  const byUnit = units.rows.map((u) => ({
    id: u.id,
    title: u.title,
    lessons: lessons.rows
      .filter((l) => l.unit_id === u.id)
      .map((l) => {
        const lItems = items.rows.filter((i) => i.lesson_id === l.id).map(learnerItem);
        const gradable = lItems.filter(
          (i) =>
            (i.type === "exercise" && i.content.kind !== "text") ||
            (i.type === "video" && Array.isArray(i.content.questions) && i.content.questions.length)
        );
        const selfCheck = lItems.filter((i) => i.type === "exercise" && i.content.kind === "text");
        const allDone =
          gradable.length + selfCheck.length > 0 &&
          gradable.every((i) => {
            const s = state.get(i.id);
            const qCount = i.type === "video" ? i.content.questions.length : 1;
            return s && Array.from({ length: qCount }, (_, x) => x).every((x) => s.correct.has(x));
          }) &&
          selfCheck.every((i) => state.has(i.id));
        if (allDone) lessonDone.add(l.id);
        return { id: l.id, title: l.title, summary: l.summary, done: allDone, items: lItems };
      }),
  }));
  const totalLessons = lessons.rows.length;
  return { ...c.rows[0], units: byUnit, progress: { lessonsDone: lessonDone.size, lessonsTotal: totalLessons } };
}

router.get("/courses/:id", async (req, res, next) => {
  try {
    const course = await loadCourseForLearner(Number(req.params.id), req.user);
    if (!course) return bad(res, "not_found", 404);
    res.json({ course });
  } catch (err) {
    next(err);
  }
});

// Fetch a single lesson (with item state) for the player.
router.get("/lessons/:id", async (req, res, next) => {
  try {
    const lessonId = Number(req.params.id);
    const owned = await db.query(
      `select c.id as course_id, c.title as course_title, l.title, l.summary
         from lessons l join units un on un.id = l.unit_id join courses c on c.id = un.course_id
        where l.id = $1 and c.family_id = $2 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $3)`,
      [lessonId, req.user.familyId, req.user.id]
    );
    if (!owned.rows[0]) return bad(res, "not_found", 404);
    const items = await db.query(
      "select id, type, position, content from lesson_items where lesson_id = $1 order by position, id",
      [lessonId]
    );
    const attempts = await db.query(
      "select item_id, question_index, correct from attempts where learner_id = $1 and item_id = any($2::bigint[])",
      [req.user.id, items.rows.length ? items.rows.map((i) => i.id) : [0]]
    );
    const state = {};
    for (const a of attempts.rows) {
      const key = `${a.item_id}:${a.question_index}`;
      state[key] = state[key] || a.correct === true;
      if (a.correct === true) state[key] = true;
    }
    res.json({
      lesson: { id: lessonId, ...owned.rows[0], items: items.rows.map(learnerItem) },
      solved: state,
    });
  } catch (err) {
    next(err);
  }
});

// Submit an answer. Grading happens here: answers never reach the client.
router.post("/attempt", async (req, res, next) => {
  try {
    const { itemId, questionIndex, answer } = req.body || {};
    const id = Number(itemId);
    const qIdx = Math.max(0, Math.min(9, Number(questionIndex) || 0));
    if (!Number.isInteger(id)) return bad(res, "item_invalid");

    const item = await db.query(
      `select i.id, i.type, i.content
         from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
         join courses c on c.id = un.course_id
        where i.id = $1 and c.family_id = $2 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $3)`,
      [id, req.user.familyId, req.user.id]
    );
    if (!item.rows[0]) return bad(res, "not_found", 404);
    const row = item.rows[0];
    const c = row.content || {};

    let correct = null;
    let reveal = null;
    if (row.type === "exercise") {
      correct = gradeExercise(c, answer);
      reveal = { kind: c.kind, explanation: c.explanation || null, hint: c.hint || null, answer: c.kind === "text" ? c.answer : null };
      if (c.kind === "mcq" && correct === true) reveal.answer = null; // never leak future answers; mcq self-evident
    } else if (row.type === "video" && Array.isArray(c.questions) && c.questions[qIdx]) {
      const q = c.questions[qIdx];
      correct = gradeExercise({ kind: "mcq", choices: q.choices, answer: q.answer }, answer);
      reveal = { kind: "mcq", explanation: null };
    } else {
      return bad(res, "not_gradable");
    }

    await db.query(
      "insert into attempts (family_id, learner_id, item_id, question_index, correct, answer) values ($1,$2,$3,$4,$5,$6)",
      [req.user.familyId, req.user.id, id, qIdx, correct, JSON.stringify(answer ?? null)]
    );

    // Spaced review: every graded exercise feeds the scheduler (fail-open).
    if (row.type === "exercise" && c.kind && c.kind !== "text") {
      review.recordAttempt({ familyId: req.user.familyId, learnerId: req.user.id, itemId: id, correct: correct === true });
    }

    // Badges: check after any attempt (fail-open)
    require("../lib/badges").checkAndAward(req.user.id, req.user.familyId).catch(() => {});

    // Adventure XP: correct answers on adventured courses earn XP (fail-open).
    if (correct === true) {
      db.query(
        `update adventures set xp = xp + 10
          where course_id = (select un.course_id from lesson_items i
                              join lessons l on l.id = i.lesson_id
                              join units un on un.id = l.unit_id where i.id = $1)
            and (learner_id = $2 or learner_id is null) and family_id = $3`,
        [id, req.user.id, req.user.familyId]
      ).catch(() => {});
    }
    res.json({ correct, reveal });
  } catch (err) {
    next(err);
  }
});

// Spaced review queue: exercises due across all the learner's courses.
router.get("/review", async (req, res, next) => {
  try {
    const rows = await review.dueForLearner(req.user.id, req.user.familyId);
    res.json({
      due: rows.length ? rows[0].due_total : 0,
      items: rows.map((r) => ({
        item_id: r.item_id,
        reps: r.reps,
        lapses: r.lapses,
        lesson_title: r.lesson_title,
        course_title: r.course_title,
        course_id: r.course_id,
        content: {
          prompt: (r.content || {}).prompt,
          kind: (r.content || {}).kind,
          choices: (r.content || {}).choices,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Streak + badges for the learner's home screen.
router.get("/gamification", async (req, res, next) => {
  try {
    const streak = await require("../lib/badges").computeStreak(req.user.id);
    const badges = await require("../lib/badges").forLearner(req.user.id);
    const all = require("../lib/badges").BADGES;
    res.json({
      streak,
      badges,
      locked: all.filter((b) => !badges.some((e) => e.id === b.id)),
    });
  } catch (err) {
    next(err);
  }
});

// The learner's adventure for a course (world + xp + portraits).
router.get("/adventure/:courseId", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select a.id, a.world, a.xp, a.learner_id,
              (select url from media_assets m where m.ref_type = 'adventure' and m.ref_id = a.id and m.purpose = 'adventure-cover' order by m.id desc limit 1) as cover_url,
              (select json_agg(url) from (
                select url from media_assets m
                 where m.ref_type = 'adventure' and m.ref_id = a.id and m.purpose = 'character-portrait'
                 order by m.id
              ) p) as portraits
         from adventures a
        where a.course_id = $1 and a.family_id = $2
          and (a.learner_id = $3 or a.learner_id is null)
        order by a.created_at desc limit 1`,
      [Number(req.params.courseId), req.user.familyId, req.user.id]
    );
    if (!rows[0]) return res.json({ adventure: null });
    res.json({ adventure: rows[0] });
  } catch (err) {
    next(err);
  }
});

// The learner's learning paths: what's coming up next on each active plan.
router.get("/plans", async (req, res, next) => {
  try {
    const plans = await db.query(
      `select p.id, p.title, p.subject, p.end_date
         from term_plans p join plan_enrollments e on e.plan_id = p.id
        where p.family_id = $1 and e.learner_id = $2 and p.status = 'active'
        order by p.created_at desc`,
      [req.user.familyId, req.user.id]
    );
    const out = [];
    for (const p of plans.rows) {
      const ms = await db.query(
        `select m.id, m.title, m.description, m.target_date, m.course_id, c.title as course_title,
                (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = m.course_id)::int as lessons_total,
                (select count(*) from lesson_completions lc where lc.course_id = m.course_id and lc.learner_id = $2)::int as lessons_done
           from plan_milestones m left join courses c on c.id = m.course_id
          where m.plan_id = $1 and c.status = 'published'
          order by m.position, m.id`,
        [p.id, req.user.id]
      );
      const all = await db.query(
        `select m.id from plan_milestones m left join courses c on c.id = m.course_id
          where m.plan_id = $1 and (c.id is null or c.status = 'published') order by m.position`,
        [p.id]
      );
      const doneCount = ms.rows.filter((m) => m.lessons_total > 0 && m.lessons_done >= m.lessons_total).length;
      const next = ms.rows.find((m) => !(m.lessons_total > 0 && m.lessons_done >= m.lessons_total));
      out.push({
        ...p,
        milestones_total: all.rows.length,
        milestones_done: doneCount,
        next: next || null,
      });
    }
    res.json({ plans: out });
  } catch (err) {
    next(err);
  }
});

// Coming up for this learner: family events + milestones on their plans.
router.get("/upcoming", async (req, res, next) => {
  try {
    const events = await db.query(
      `select id, title, description, on_date, at_time, kind
         from events
        where family_id = $1 and on_date between current_date and current_date + 21
        order by on_date limit 5`,
      [req.user.familyId]
    );
    const milestones = await db.query(
      `select m.title, m.target_date, p.title as plan_title
         from plan_milestones m
         join term_plans p on p.id = m.plan_id
         join plan_enrollments e on e.plan_id = p.id
        where e.learner_id = $1 and p.status = 'active'
          and m.target_date between current_date and current_date + 21
        order by m.target_date limit 5`,
      [req.user.id]
    );
    res.json({ events: events.rows, milestones: milestones.rows });
  } catch (err) {
    next(err);
  }
});

// Lesson completion log (idempotent): feeds the Progress page.
router.post("/lessons/:id/complete", async (req, res, next) => {
  try {
    const lessonId = Number(req.params.id);
    const owned = await db.query(
      `select c.id as course_id
         from lessons l join units un on un.id = l.unit_id join courses c on c.id = un.course_id
        where l.id = $1 and c.family_id = $2 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $3)`,
      [lessonId, req.user.familyId, req.user.id]
    );
    if (!owned.rows[0]) return bad(res, "not_found", 404);
    await db.query(
      `insert into lesson_completions (family_id, learner_id, course_id, lesson_id)
       values ($1,$2,$3,$4) on conflict (learner_id, lesson_id) do nothing`,
      [req.user.familyId, req.user.id, owned.rows[0].course_id, lessonId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// "Explain my mistake", AI diagnosis, kid-friendly. Flash tier.
router.post("/explain", async (req, res, next) => {
  try {
    const { itemId, questionIndex, myAnswer } = req.body || {};
    const id = Number(itemId);
    const qIdx = Math.max(0, Math.min(9, Number(questionIndex) || 0));
    const item = await db.query(
      `select i.type, i.content
         from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
         join courses c on c.id = un.course_id
        where i.id = $1 and c.family_id = $2 and (c.learner_id is null or c.learner_id = $3)`,
      [id, req.user.familyId, req.user.id]
    );
    if (!item.rows[0]) return bad(res, "not_found", 404);
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);

    const c = item.rows[0].content || {};
    let prompt, correctAnswer;
    if (item.rows[0].type === "exercise") {
      prompt = c.prompt;
      correctAnswer =
        c.kind === "mcq"
          ? ((c.choices || []).find((ch) => ch.id === c.answer) || {}).text
          : c.answer;
    } else {
      const q = (c.questions || [])[qIdx];
      if (!q) return bad(res, "not_found", 404);
      prompt = q.prompt;
      correctAnswer = ((q.choices || []).find((ch) => ch.id === q.answer) || {}).text;
    }

    const out = await ai.chat(
      "hint",
      [
        {
          role: "system",
          content:
            "You explain mistakes to a school kid. Warm, never condescending, max 120 words. " +
            "Do NOT just restate the correct answer. Walk from the learner's wrong thinking to the right idea, one step at a time. Plain language.",
        },
        {
          role: "user",
          content:
            `Question: ${prompt}\nLearner answered: ${String(myAnswer ?? "(no answer)").slice(0, 300)}\n` +
            `Correct answer: ${String(correctAnswer ?? "").slice(0, 300)}\nExplain the mistake.`,
        },
      ],
      { maxTokens: 500, temperature: 0.5, usage: { familyId: req.user.familyId, note: "explain-mistake" } }
    );
    res.json({ explanation: out.content });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
