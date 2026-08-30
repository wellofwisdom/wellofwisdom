// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner routes: my courses, tree WITHOUT answers, graded attempts,
// explain-my-mistake (AI), progress. Learners only see published courses
// assigned to them (learner_id null = whole family).
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const ai = require("../lib/ai");
const { gradeExercise } = require("../lib/grade");

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
    const out = { youtubeId: c.youtubeId, title: c.title, note: c.note };
    if (c.questions) out.questions = c.questions.map((q) => ({ prompt: q.prompt, choices: q.choices }));
    return { id: item.id, type: item.type, position: item.position, content: out };
  }
  return { id: item.id, type: item.type, position: item.position, content: c };
}

router.get("/courses", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select c.id, c.title, c.topic, c.lens, c.description,
              (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = c.id)::int as lesson_count
         from courses c
        where c.family_id = $1 and c.status = 'published'
          and (c.learner_id is null or c.learner_id = $2)
        order by c.created_at desc`,
      [req.user.familyId, req.user.id]
    );
    res.json({ courses: rows });
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

// Submit an answer. Grading happens here — answers never reach the client.
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
    res.json({ correct, reveal });
  } catch (err) {
    next(err);
  }
});

// "Explain my mistake" — AI diagnosis, kid-friendly. Flash tier.
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
            "Do NOT just restate the correct answer — walk from the learner's wrong thinking to the right idea, one step at a time. Plain language.",
        },
        {
          role: "user",
          content:
            `Question: ${prompt}\nLearner answered: ${String(myAnswer ?? "(no answer)").slice(0, 300)}\n` +
            `Correct answer: ${String(correctAnswer ?? "").slice(0, 300)}\nExplain the mistake.`,
        },
      ],
      { maxTokens: 500, temperature: 0.5 }
    );
    res.json({ explanation: out.content });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
