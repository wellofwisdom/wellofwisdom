// SPDX-License-Identifier: AGPL-3.0-or-later
// AI course generation: prompt → strict JSON → normalize → persist.
// The normalizer is the trust boundary: AI output is coerced, clamped, and
// checked before it ever becomes a course.
const db = require("./db");
const ai = require("./ai");
const { youtubeId } = require("./grade");

const GEN_SYSTEM = `You are an expert curriculum designer building courses for a homeschool family.
You ALWAYS respond with a single valid JSON object and nothing else — no markdown fences, no commentary.

Schema (obey exactly):
{
  "title": string,
  "description": string (2-3 sentences),
  "units": [
    {
      "title": string,
      "lessons": [
        {
          "title": string,
          "summary": string (one sentence),
          "items": [
            { "type": "article", "content": { "title": string, "body": string } }
            | { "type": "exercise", "content": {
                "prompt": string,
                "kind": "mcq" | "numeric" | "text",
                "choices": [{"id": "c1", "text": string}, ...] (mcq only, 3-4 choices),
                "answer": choice id (mcq) | number (numeric) | model answer string (text),
                "explanation": string (why the answer is right, kid-friendly),
                "hint": string (a nudge, never the answer)
              } }
            | { "type": "video", "content": { "youtubeId": string (11-char id only if a REAL relevant video is known), "title": string, "note": string, "questions": [{"prompt": string, "choices": [{"id":"c1","text":string},...], "answer": "c1"}] } }
            | { "type": "project", "content": { "title": string, "description": string, "rubric": string } }
          ]
        }
      ]
    }
  ]
}

Rules:
- EXACTLY 3 units, each with 3 lessons. Every lesson: exactly ONE article first, then 2-3 exercises. Use a "project" item as the final item of the final lesson of the course when it fits naturally. Use "video" items ONLY when you are certain of a real, relevant, well-known YouTube video id; otherwise omit them entirely.
- Keep article bodies 120-220 words. Keep the whole JSON compact — no commentary outside the JSON.
- Article body: plain paragraphs separated by blank lines. Bold with **word**. Bullet lines start with "- ". Math MUST be wrapped in $...$ using LaTeX (e.g. $\\frac{3}{4}$). No other markdown.
- Language must match the learner's grade level. Explain like a brilliant, warm tutor.
- If a LENS (interest context) is given, weave it through: examples, word problems, and projects use the lens constantly. A sewing lens means fraction problems about fabric, seam allowances, and patterns.
- If SOURCES are given, ground the content in them, quote their key facts, and do not contradict them.
- Vary exercise kinds: mix mcq, numeric, and short text. Answers must be objectively checkable.`;

function buildUserPrompt(spec, sourcesText) {
  const lines = [];
  lines.push(`Design a complete course.`);
  lines.push(`Topic: ${spec.topic}`);
  if (spec.gradeLevel) lines.push(`Learner grade level: ${spec.gradeLevel}`);
  if (spec.lens) lines.push(`LENS — teach this subject through: ${spec.lens}`);
  if (spec.interests && spec.interests.length) lines.push(`Learner interests: ${spec.interests.join(", ")}`);
  if (spec.learnerNotes) lines.push(`REMEMBERED learner notes (the guide set these; apply automatically): ${spec.learnerNotes}`);
  if (spec.notes) lines.push(`Guide notes for this course: ${spec.notes}`);
  if (sourcesText) {
    lines.push(`SOURCES the course must be grounded in:`);
    lines.push(sourcesText.slice(0, 20000));
  }
  lines.push(`Return only the JSON object.`);
  return lines.join("\n");
}

// ---------- normalizer ----------

const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s) => str(s).replace(/<[^>]*>/g, "");

function normalizeChoice(c, i) {
  if (!c || typeof c !== "object") return null;
  const text = clean(c.text, 500);
  if (!text) return null;
  return { id: `c${i + 1}`, text };
}

function normalizeExercise(content) {
  const kind = ["mcq", "numeric", "text"].includes(content.kind) ? content.kind : "mcq";
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const ex = { prompt, kind };
  if (kind === "mcq") {
    const choices = (Array.isArray(content.choices) ? content.choices : [])
      .map(normalizeChoice)
      .filter(Boolean)
      .slice(0, 5);
    if (choices.length < 2) return null;
    const raw = String(content.answer ?? "");
    const match = choices.some((c, i) => c.id === raw || clean(content.answer, 500) === choices[i].text);
    ex.choices = choices;
    ex.answer = match ? (choices.some((c) => c.id === raw) ? raw : choices.find((c) => c.text === clean(content.answer, 500)).id) : choices[0].id;
  } else if (kind === "numeric") {
    const n = Number(String(content.answer ?? "").replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(n)) return null;
    ex.answer = n;
  } else {
    const a = str(content.answer, 2000);
    if (!a) return null;
    ex.answer = a;
  }
  const explanation = str(content.explanation, 3000);
  const hint = str(content.hint, 500);
  if (explanation) ex.explanation = explanation;
  if (hint) ex.hint = hint;
  return ex;
}

function normalizeVideo(content) {
  const id = youtubeId(content.youtubeId || content.url || "");
  if (!id) return null;
  const v = { youtubeId: id, title: clean(content.title, 300) || "Video", note: str(content.note, 1000) };
  const questions = [];
  if (Array.isArray(content.questions)) {
    for (const q of content.questions.slice(0, 4)) {
      const prompt = clean(q.prompt, 1000);
      const choices = (Array.isArray(q.choices) ? q.choices : []).map(normalizeChoice).filter(Boolean).slice(0, 5);
      if (!prompt || choices.length < 2) continue;
      const raw = String(q.answer ?? "");
      questions.push({ prompt, choices, answer: choices.some((c) => c.id === raw) ? raw : choices[0].id });
    }
  }
  if (questions.length) v.questions = questions;
  return v;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = item.type;
  const content = item.content || {};
  if (type === "article") {
    const body = str(content.body, 20000);
    if (!body) return null;
    return { type, content: { title: clean(content.title, 300) || "Lesson", body } };
  }
  if (type === "exercise") {
    const ex = normalizeExercise(content);
    return ex ? { type, content: ex } : null;
  }
  if (type === "video") {
    const v = normalizeVideo(content);
    return v ? { type, content: v } : null;
  }
  if (type === "project") {
    const title = clean(content.title, 300);
    const description = str(content.description, 5000);
    if (!title || !description) return null;
    const p = { title, description };
    const rubric = str(content.rubric, 3000);
    if (rubric) p.rubric = rubric;
    return { type, content: p };
  }
  return null;
}

function normalizeCourse(raw) {
  const title = clean(raw.title, 200);
  const unitsIn = Array.isArray(raw.units) ? raw.units : [];
  const units = [];
  for (const u of unitsIn.slice(0, 6)) {
    const unitTitle = clean(u.title, 200);
    const lessonsIn = Array.isArray(u.lessons) ? u.lessons : [];
    const lessons = [];
    for (const l of lessonsIn.slice(0, 6)) {
      const lessonTitle = clean(l.title, 200);
      if (!lessonTitle) continue;
      const items = (Array.isArray(l.items) ? l.items : []).map(normalizeItem).filter(Boolean).slice(0, 8);
      if (!items.length) continue;
      const lesson = { title: lessonTitle, items };
      const summary = str(l.summary, 500);
      if (summary) lesson.summary = summary;
      lessons.push(lesson);
    }
    if (unitTitle && lessons.length) units.push({ title: unitTitle, lessons: lessons.slice(0, 5) });
  }
  if (!title || !units.length) return null;
  const out = { title, units };
  const description = str(raw.description, 1000);
  if (description) out.description = description;
  return out;
}

// ---------- persistence ----------

async function persistCourse(course, spec, userId, familyId) {
  const client = await db.getPool().connect();
  try {
    await client.query("begin");
    const c = await client.query(
      `insert into courses (family_id, learner_id, title, topic, lens, grade_level, description, sources, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [
        familyId,
        spec.learnerId || null,
        course.title,
        spec.topic,
        spec.lens || null,
        spec.gradeLevel || null,
        course.description || null,
        JSON.stringify(spec.sources || []),
        userId,
      ]
    );
    const courseId = c.rows[0].id;
    let unitPos = 0;
    let counts = { units: 0, lessons: 0, items: 0, exercises: 0 };
    for (const u of course.units) {
      const un = await client.query(
        "insert into units (course_id, title, position) values ($1,$2,$3) returning id",
        [courseId, u.title, unitPos++]
      );
      counts.units++;
      let lessonPos = 0;
      for (const l of u.lessons) {
        const ln = await client.query(
          "insert into lessons (unit_id, title, summary, position) values ($1,$2,$3,$4) returning id",
          [un.rows[0].id, l.title, l.summary || null, lessonPos++]
        );
        counts.lessons++;
        let itemPos = 0;
        for (const item of l.items) {
          await client.query(
            "insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)",
            [ln.rows[0].id, item.type, itemPos++, JSON.stringify(item.content)]
          );
          counts.items++;
          if (item.type === "exercise") counts.exercises++;
        }
      }
    }
    await client.query("commit");
    return { courseId, counts };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------- entrypoint (runs inside a job) ----------

async function generateCourse(spec, userId, familyId) {
  const sourcesText = (spec.sources || [])
    .map((s, i) => `--- SOURCE ${i + 1}: ${s.title || "untitled"} ---\n${String(s.text || "").slice(0, 6000)}`)
    .join("\n\n");

  const out = await ai.chatJson(
    "course-gen",
    [
      { role: "system", content: GEN_SYSTEM },
      { role: "user", content: buildUserPrompt(spec, sourcesText) },
    ],
    { maxTokens: 8000, temperature: 0.7, usage: { familyId, note: `course: ${spec.topic}` } }
  );

  const course = normalizeCourse(out.json);
  if (!course) throw new Error("ai_course_unparseable: model output failed normalization (no usable units/lessons)");
  const { courseId, counts } = await persistCourse(course, spec, userId, familyId);
  // A milestone-generated course links back to its milestone automatically.
  if (spec.milestoneId) {
    await db
      .query("update plan_milestones set course_id = $2 where id = $1", [spec.milestoneId, courseId])
      .catch((err) => console.error(`[coursegen] milestone link failed (ignored): ${err.message}`));
  }
  return { courseId, title: course.title, counts };
}

module.exports = { generateCourse, normalizeCourse, normalizeItem, normalizeExercise, buildUserPrompt, persistCourse };
