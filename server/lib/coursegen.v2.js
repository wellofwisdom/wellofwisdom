// SPDX-License-Identifier: AGPL-3.0-or-later
// Generator v2 helpers: outline, lesson-by-lesson, verification, media.

const db = require("./db");
const ai = require("./ai");
const { stripTags } = require("./text");

const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

let CAPS = null;
try { CAPS = require("./coursegen"); } catch { CAPS = {}; }
const MAX_UNITS = CAPS.MAX_UNITS || 6;
const MAX_LESSONS = CAPS.MAX_LESSONS || 5;
const LESSONS_SCANNED = CAPS.LESSONS_SCANNED || 6;

// Optional language plumbing: when a course teaches a target language,
// Studio sends language (like "es") and cefr (like "A1"). They flow through
// spec -> prompt -> job payload and surface in the kind menu only when present.
// Non-language courses omit them and generate the same 1-unit 4-lesson shapes.
const CEFR_LEVELS = new Set(["A1","A2","B1","B2","C1","C2"]);
function normalizeLanguage(v) {
  const s = String(v || "").trim().toLowerCase().slice(0, 20);
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(s)) return null;
  return s;
}
function normalizeCefr(v) {
  const s = String(v || "").trim().toUpperCase().slice(0, 4);
  return CEFR_LEVELS.has(s) ? s : null;
}

const OUTLINE_SYSTEM = `You are an expert curriculum outline designer for a homeschool family.
You ALWAYS respond with a single valid JSON object and nothing else. No markdown fences, no commentary.

Schema (obey exactly):
{
  "title": string,
  "description": string (2-3 sentences),
  "units": [
    {
      "title": string,
      "objective": string (one sentence: what the learner will be able to do),
      "timeEstimateMin": number (15-120, minutes for this unit),
      "lessons": [
        {
          "title": string,
          "objective": string (one sentence),
          "plannedKind": string (one entry from the kind menu the user message gives you),
          "timeEstimateMin": number (15-60)
        }
      ]
    }
  ]
}

Rules:
- Obey the unit and lesson caps given in the user message. Never exceed them.
- Keep titles short and objectives concrete and kid-facing.
- Choose plannedKinds that fit the lesson idea, not to hit a quota.
- Language must match the learner grade level when given.`;

const LESSON_SYSTEM = `You are an expert lesson author for a homeschool family.
You ALWAYS respond with a single valid JSON object and nothing else. No markdown fences, no commentary.

Schema (obey exactly):
{
  "title": string,
  "summary": string (one sentence),
  "items": [
    { "type": "article", "content": { "title": string, "body": string } }
    | { "type": "figure", "content": { "alt": string, "caption": string, "prompt": string } }
    | { "type": "steps", "content": { "title": string, "problem": string, "steps": [{"text": string}, ...], "fadeLast": number } }
    | { "type": "predict", "content": { "prompt": string, "choices": [{"id":"c1","text":string},...], "reveal": string } }
    | { "type": "flashcards", "content": { "cards": [{"front": string, "back": string}, ...] } }
    | { "type": "exercise", "content": { "prompt": string, "kind": string, "choices": [...], "answer": ..., "explanation": string, "hints": [string], "feedback": string } }
    | { "type": "video", "content": { "youtubeId": string, "title": string, "note": string, "questions": [{"prompt": string, "choices":[...],"answer":string}] } }
    | { "type": "project", "content": { "title": string, "description": string, "rubric": string } }
  ]
}

Lesson shape (follow in order, no extra items):
- Hook: a predict or a lens-grounded question.
- Short explanation with a figure (one image the idea needs).
- A steps worked example (reveal one step at a time; fadeLast may turn the last step into a cloze).
- One manipulative or sorting item that fits the idea (choose from the kind menu).
- Two or three practice items of rising difficulty.
- One one-question check at the end.

Rules:
- Keep article bodies 120-220 words, wrap math in dollars, bold and bullets allowed.
- Every wrong choice must be a mistake a real learner makes, with feedback naming it.
- Keep items within the existing item caps; never invent a new kind.`;

const VERIFY_SYSTEM = `You re-solve gradable items without seeing the answer key.
You receive only prompt, choices and kind. Return JSON { "answers": [ { "id": string, "answer": string } ] }
where id matches the item's id and answer is the leaf answer (choice id, number string, or model text).
No markdown fences, no commentary. Disagreements will be flagged for a human.`;

function buildKindMenu(language) {
  let itemTypes = {};
  let kinds = {};
  try { itemTypes = require("./items").registry(); } catch {}
  try { const m = require("./items/kinds"); kinds = typeof m.kinds === "function" ? m.kinds() : m.REGISTRY || {}; } catch {}
  const entries = [];
  const typeOrder = ["article", "figure", "steps", "predict", "flashcards", "video", "audio", "project", "exercise"];
  for (const t of typeOrder) {
    const mod = itemTypes[t];
    if (!mod || !mod.normalize) continue;
    if (t === "exercise") {
      for (const k of Object.keys(kinds).sort()) {
        const h = kinds[k];
        if (!h || !h.normalize) continue;
        if (k === "mcq") entries.push("- exercise kind mcq: content { prompt, kind: 'mcq', choices[{id,text,feedback?}], answer: 'c1', explanation, hints:[], feedback } -- answer is one choice id");
        else if (k === "multi") entries.push("- exercise kind multi: content { prompt, kind: 'multi', choices, answer: ['c1','c3'] } -- sets match exactly");
        else if (k === "numeric") entries.push("- exercise kind numeric: content { prompt, kind: 'numeric', answer: number|string, explanation, hints[] } -- 0.5% tolerance");
        else if (k === "text") entries.push("- exercise kind text: content { prompt, kind: 'text', answer: string (model answer, self-check) }");
        else if (!language && (k === "vocab_card" || k === "listen_choice" || k === "listen_repeat" || k === "translate" || k === "dialogue")) { /* language-only, skip when no language */ }
        else entries.push("- exercise kind " + k);
      }
    } else if (t === "article") entries.push("- article: { title, body } -- body 120-220 words, math, bold, bullets");
    else if (t === "figure") entries.push("- figure: { alt (required), caption, prompt (image generation), uploadId } -- prompt queues kie image");
    else if (t === "steps") entries.push("- steps: { title, problem, steps:[{text}], fadeLast? } -- worked example, steps revealed one by one");
    else if (t === "predict") entries.push("- predict: { prompt, choices[{id,text}], reveal } -- learner commits guess, never graded");
    else if (t === "flashcards") entries.push("- flashcards: { cards:[{front, back}] } -- review, not graded here");
    else if (t === "video") entries.push("- video: { youtubeId (11 chars only if real), title, note, questions:[{prompt,choices,answer}] } -- only when certain");
    else if (t === "audio") entries.push("- audio: { title, transcript, uploadId } -- prefer transcript");
    else if (t === "project") entries.push("- project: { title, description, rubric } -- end of course or unit");
    else entries.push("- " + t);
  }
  if (language) {
    const lang = normalizeLanguage(language);
    if (lang) {
      entries.push("- exercise kind vocab_card: content { prompt, kind: 'vocab_card', lemma, gloss, example, alternatives[] } -- vocabulary word with gloss, spaced review");
      entries.push("- exercise kind listen_choice: content { prompt, kind: 'listen_choice', audioText, audioUrl, choices[{id,text}], answer: 'c1' } -- listen then pick");
      entries.push("- exercise kind listen_repeat: content { prompt, kind: 'listen_repeat', expected, audioText, audioUrl, hints[] } -- listen and repeat, STT scored");
      entries.push("- exercise kind translate: content { prompt, kind: 'translate', direction: 'en_to_es'|'en_to_fr'|'fr_to_en'|'es_to_en', expected, alternatives[], rubric } -- translate, exact match or rubric");
      entries.push("- exercise kind dialogue: content { prompt, kind: 'dialogue', scene, turns, goals[], goodEndings[] } -- short role-play dialogue, completeness graded");
      entries.push("- graded_reader: { title, body, level (A1-C2), glosses {word:gloss} } -- short CEFR reader, not graded, followed by checks");
    }
  }
  if (!entries.length) return "Available kinds: article, exercise (mcq, numeric, text), video, audio, project.";
  return "Kind menu (choose from these; later kinds appear here without prompt edits):\n" + entries.join("\n");
}

function buildOutlinePrompt(spec, sourcesText, size) {
  const lines = [];
  lines.push("Design a course outline.");
  lines.push("Topic: " + spec.topic);
  if (spec.language) { const lang = normalizeLanguage(spec.language); if (lang) lines.push("Target language: " + lang + (spec.cefr ? " (CEFR " + normalizeCefr(spec.cefr) + ")" : "")); }
  if (spec.cefr && !spec.language) { const lvl = normalizeCefr(spec.cefr); if (lvl) lines.push("CEFR level: " + lvl); }
  if (spec.gradeLevel) lines.push("Learner grade level: " + spec.gradeLevel);
  if (spec.lens) lines.push("LENS: teach this subject through: " + spec.lens);
  if (spec.interests && spec.interests.length) lines.push("Learner interests: " + spec.interests.join(", "));
  if (spec.learnerNotes) lines.push("REMEMBERED learner notes: " + spec.learnerNotes);
  if (spec.notes) lines.push("Guide notes for this course: " + spec.notes);
  if (sourcesText) { lines.push("SOURCES:"); lines.push(sourcesText.slice(0, 20000)); }
  const units = size && Number.isInteger(size.units) ? Math.max(1, Math.min(size.units, MAX_UNITS)) : MAX_UNITS;
  const lessonsPer = size && Number.isInteger(size.lessonsPerUnit) ? Math.max(1, Math.min(size.lessonsPerUnit, MAX_LESSONS)) : 3;
  const weeks = size && size.weeks ? " Desired length: about " + size.weeks + " week(s)." : "";
  lines.push("Caps (never exceed): " + MAX_UNITS + " units, " + MAX_LESSONS + " lessons per unit, first " + LESSONS_SCANNED + " scanned. Requested: " + units + " unit(s), " + lessonsPer + " lesson(s) per unit." + weeks);
  lines.push("Return only the JSON object.");
  if (size && size.outlineNote) lines.push(String(size.outlineNote).slice(0, 500));
  return lines.join("\n");
}

function buildLessonPrompt(spec, lessonPlan, kindMenu, sourcesText, outlineContext) {
  const lines = [];
  lines.push("Author one lesson as JSON: { title, summary, items }.");
  lines.push("Course topic: " + spec.topic);
  if (spec.language) { const lang = normalizeLanguage(spec.language); if (lang) lines.push("Target language: " + lang + (spec.cefr ? " (CEFR " + normalizeCefr(spec.cefr) + ")" : "") + " -- content in target language, instructions in learner language."); }
  if (spec.cefr && !spec.language) { const lvl = normalizeCefr(spec.cefr); if (lvl) lines.push("CEFR level: " + lvl); }
  if (spec.gradeLevel) lines.push("Grade level: " + spec.gradeLevel);
  if (spec.lens) lines.push("Lens: " + spec.lens);
  if (spec.learnerNotes) lines.push("Learner notes: " + spec.learnerNotes);
  if (lessonPlan && lessonPlan.title) lines.push("Lesson: " + lessonPlan.title + " -- objective: " + (lessonPlan.objective || "") + " (plannedKind: " + (lessonPlan.plannedKind || "any") + ")");
  if (outlineContext) lines.push("Outline context: " + outlineContext.slice(0, 4000));
  lines.push("Kind menu:\n" + kindMenu);
  lines.push("Follow the lesson shape in the system prompt. Vary difficulty, use misconception-aware distractors with feedback, and ground in any SOURCES.");
  if (sourcesText) { lines.push("SOURCES:"); lines.push(sourcesText.slice(0, 12000)); }
  lines.push("Return only the JSON object.");
  return lines.join("\n");
}

function normalizeOutline(raw, size) {
  const title = clean(raw.title, 200);
  if (!title) return null;
  const unitsIn = Array.isArray(raw.units) ? raw.units : [];
  const units = [];
  const reqUnits = size && Number.isInteger(size.units) ? Math.max(1, Math.min(size.units, MAX_UNITS)) : unitsIn.length;
  const reqLessons = size && Number.isInteger(size.lessonsPerUnit) ? Math.max(1, Math.min(size.lessonsPerUnit, MAX_LESSONS)) : null;
  for (const u of unitsIn.slice(0, MAX_UNITS)) {
    if (!u || typeof u !== "object") continue;
    const unitTitle = clean(u.title, 200);
    if (!unitTitle) continue;
    const objective = clean(u.objective || u.summary || "", 500);
    const timeEstimateMin = Number(u.timeEstimateMin != null ? u.timeEstimateMin : u.timeEstimate);
    const t = Number.isFinite(timeEstimateMin) ? Math.max(5, Math.min(600, Math.round(timeEstimateMin))) : null;
    const lessonsIn = Array.isArray(u.lessons) ? u.lessons : [];
    const lessons = [];
    for (const l of lessonsIn.slice(0, LESSONS_SCANNED)) {
      if (!l || typeof l !== "object") continue;
      const lessonTitle = clean(l.title, 200);
      if (!lessonTitle) continue;
      const lo = clean(l.objective || l.summary || "", 500);
      const plannedKind = typeof l.plannedKind === "string" ? l.plannedKind.trim().slice(0, 40) : (typeof l.kind === "string" ? l.kind.trim().slice(0, 40) : "");
      const lt = Number(l.timeEstimateMin != null ? l.timeEstimateMin : l.timeEstimate);
      const entry = { title: lessonTitle };
      if (lo) entry.objective = lo;
      if (plannedKind) entry.plannedKind = plannedKind;
      if (Number.isFinite(lt)) entry.timeEstimateMin = Math.max(5, Math.min(240, Math.round(lt)));
      lessons.push(entry);
    }
    if (!lessons.length) continue;
    const sliced = lessons.slice(0, MAX_LESSONS);
    const finalLessons = reqLessons != null ? sliced.slice(0, reqLessons) : sliced;
    const out = { title: unitTitle, lessons: finalLessons };
    if (objective) out.objective = objective;
    if (t != null) out.timeEstimateMin = t;
    units.push(out);
  }
  const sized = reqUnits != null ? units.slice(0, reqUnits) : units;
  if (!sized.length) return null;
  const out = { title, units: sized };
  const description = str(raw.description, 1000);
  if (description) out.description = description;
  return out;
}

async function persistOutlineAsSkeleton(outline, spec, userId, familyId) {
  const useTx = db.driver() !== "pglite";
  let client = null;
  const q = useTx ? null : db.query.bind(db);
  if (useTx) {
    client = await db.getPool().connect();
    await client.query("begin");
  }
  const run = useTx ? (sql, params) => client.query(sql, params) : (sql, params) => db.query(sql, params);
  try {
    const c = await run(
      "insert into courses (family_id, learner_id, title, topic, lens, grade_level, description, sources, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
      [familyId, spec.learnerId || null, outline.title, spec.topic, spec.lens || null, spec.gradeLevel || null, outline.description || null, JSON.stringify(spec.sources || []), userId]
    );
    const courseId = c.rows[0].id;
    let unitPos = 0;
    for (const u of outline.units) {
      const un = await run("insert into units (course_id, title, position) values ($1,$2,$3) returning id", [courseId, u.title, unitPos++]);
      let lessonPos = 0;
      for (const l of u.lessons) {
        await run("insert into lessons (unit_id, title, summary, position) values ($1,$2,$3,$4) returning id", [un.rows[0].id, l.title, l.objective || null, lessonPos++]);
      }
    }
    if (useTx) await client.query("commit");
    const rows = await db.query("select l.id, l.title, l.unit_id, un.title as unit_title from lessons l join units un on un.id = l.unit_id where un.course_id = $1 order by un.position, l.position", [courseId]);
    const lessonIds = rows.rows.map((r) => ({ lessonId: Number(r.id), title: r.title, unitId: Number(r.unit_id) }));
    return { courseId, outline, lessonIds };
  } catch (err) { if (useTx) await client.query("rollback").catch(() => {}); throw err; } finally { if (client) client.release(); }
}

async function generateOutline(spec, familyId) {
  const sourcesText = (spec.sources || []).map((s, i) => "--- SOURCE " + (i + 1) + ": " + (s.title || "untitled") + " ---\n" + String(s.text || "").slice(0, 6000)).join("\n\n");
  const size = spec.size || null;
  const out = await ai.chatJson("course-gen", [{ role: "system", content: OUTLINE_SYSTEM }, { role: "user", content: buildOutlinePrompt(spec, sourcesText, size) }], { maxTokens: 6000, temperature: 0.7, usage: { familyId, note: "outline: " + spec.topic }, publicContent: spec.openPublish === true });
  const outline = normalizeOutline(out.json, size);
  if (!outline) throw new Error("ai_outline_unparseable: model output failed outline normalization");
  return { outline, specTopic: spec.topic };
}

async function generateLesson(opts) {
  const courseId = opts.courseId; const lessonId = opts.lessonId; const spec = opts.spec; const lessonPlan = opts.lessonPlan; const outlineContext = opts.outlineContext; const familyId = opts.familyId;
  const courseRow = await db.query("select id from courses where id = $1 and family_id = $2", [courseId, familyId]);
  if (!courseRow.rows[0]) throw new Error("course_not_found");
  const lessonRow = await db.query("select id, unit_id, title from lessons where id = $1", [lessonId]);
  if (!lessonRow.rows[0]) throw new Error("lesson_not_found");
  const sourcesText = (spec.sources || []).map((s, i) => "--- SOURCE " + (i + 1) + ": " + (s.title || "untitled") + " ---\n" + String(s.text || "").slice(0, 6000)).join("\n\n");
  const kindMenu = buildKindMenu(spec.language || null);
  const cg = require("./coursegen");
  const out = await ai.chatJson("lesson-content", [{ role: "system", content: LESSON_SYSTEM }, { role: "user", content: buildLessonPrompt(spec, lessonPlan, kindMenu, sourcesText, outlineContext) }], { maxTokens: 6000, temperature: 0.7, usage: { familyId, note: "lesson: " + (lessonPlan && lessonPlan.title ? lessonPlan.title : String(lessonId)) }, publicContent: spec.openPublish === true });
  const raw = out.json;
  const title = clean(raw.title, 200) || (lessonPlan && lessonPlan.title) || "Lesson";
  const summary = str(raw.summary, 500) || null;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map(cg.normalizeItem).filter(Boolean).slice(0, cg.MAX_ITEMS);
  if (!items.length) throw new Error("ai_lesson_unparseable: no usable items");
  const lessonCourse = { units: [{ lessons: [{ title, items }] }] };
  const pruneDeadVideos = require("./video").pruneDeadVideos;
  await pruneDeadVideos(lessonCourse).catch(() => {});
  const finalItems = (lessonCourse.units[0].lessons[0].items || items);
  await db.query("update lessons set title = $2, summary = $3 where id = $1", [lessonId, title, summary]);
  await db.query("delete from lesson_items where lesson_id = $1", [lessonId]);
  let pos = 0;
  for (const it of finalItems) {
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)", [lessonId, it.type, pos++, JSON.stringify(it.content)]);
  }
  return { lessonId, title, items: finalItems.length };
}

async function verifyCourse(courseId, familyId) {
  const c = await db.query("select id, learner_id from courses where id = $1 and family_id = $2", [courseId, familyId]);
  if (!c.rows[0]) throw new Error("course_not_found");
  const units = await db.query("select id from units where course_id = $1", [courseId]);
  if (!units.rows.length) return { checked: 0, flags: [] };
  const lessons = await db.query("select id from lessons where unit_id = any($1::bigint[])", [units.rows.map((u) => u.id)]);
  if (!lessons.rows.length) return { checked: 0, flags: [] };
  const items = await db.query("select id, lesson_id, type, content from lesson_items where lesson_id = any($1::bigint[])", [lessons.rows.map((l) => l.id)]);
  const gradable = [];
  for (const it of items.rows) {
    if (it.type === "exercise") {
      const cc = it.content || {};
      if (!cc.prompt) continue;
      gradable.push({ id: Number(it.id), lessonId: Number(it.lesson_id), type: "exercise", prompt: cc.prompt, kind: cc.kind, choices: cc.choices || null, key: cc.answer });
    } else if (it.type === "video" && it.content && Array.isArray(it.content.questions)) {
      const qs = it.content.questions || [];
      qs.forEach((q, idx) => gradable.push({ id: Number(it.id), qIdx: idx, lessonId: Number(it.lesson_id), type: "video", prompt: q.prompt, choices: q.choices, key: q.answer }));
    }
  }
  if (!gradable.length) return { checked: 0, flags: [] };
  const payload = gradable.map((g) => {
    const base = { id: g.qIdx != null ? g.id + ":" + g.qIdx : String(g.id), prompt: String(g.prompt).slice(0, 800), kind: g.kind || "mcq" };
    if (g.choices) base.choices = g.choices.map((co) => ({ id: co.id, text: String(co.text).slice(0, 200) }));
    return base;
  });
  const open = c.rows[0].learner_id == null;
  const out = await ai.chatJson("grading", [{ role: "system", content: VERIFY_SYSTEM }, { role: "user", content: JSON.stringify({ items: payload.slice(0, 30) }) }], { maxTokens: 3000, temperature: 0.2, usage: { familyId, note: "verify:" + courseId }, publicContent: open === true });
  const gotMap = new Map();
  const rawAnswers = out.json && Array.isArray(out.json.answers) ? out.json.answers : [];
  for (const a of rawAnswers) {
    const id = String(a.id != null ? a.id : a.itemId != null ? a.itemId : "");
    const ans = a.answer != null ? String(a.answer).trim() : "";
    if (id) gotMap.set(id, ans);
  }
  const flags = [];
  const gradeExercise = require("./grade").gradeExercise;
  for (const g of gradable) {
    const idStr = g.qIdx != null ? g.id + ":" + g.qIdx : String(g.id);
    const got = gotMap.get(idStr);
    if (got == null || got === "") continue;
    const itemLike = g.type === "video" ? { kind: "mcq", choices: g.choices, answer: g.key } : (g.kind === "mcq" ? { kind: "mcq", choices: g.choices, answer: g.key } : (g.kind === "numeric" ? { kind: "numeric", answer: g.key } : { kind: g.kind, answer: g.key }));
    let mismatch = false;
    try {
      const verdict = gradeExercise(itemLike, got);
      const isCorrect = verdict === true || (verdict && typeof verdict === "object" && verdict.correct === true);
      mismatch = !isCorrect;
      if (itemLike.kind === "text") mismatch = false;
    } catch { mismatch = String(g.key).toLowerCase() !== String(got).toLowerCase(); }
    if (mismatch) flags.push({ itemId: Number(g.id), qIdx: g.qIdx != null ? g.qIdx : null, expected: String(g.key), got, kind: g.kind || "mcq" });
  }
  for (const f of flags) {
    const row = await db.query("select id, content from lesson_items where id = $1", [f.itemId]);
    if (!row.rows[0]) continue;
    const cc = row.rows[0].content || {};
    const nxt = Object.assign({}, cc, { verification: { checkedAt: new Date().toISOString(), got: f.got, flag: "check_this_answer", dismissed: false } });
    await db.query("update lesson_items set content = $2 where id = $1", [f.itemId, JSON.stringify(nxt)]);
  }
  const flaggedIds = new Set(flags.map((f) => String(f.itemId)));
  for (const g of gradable) {
    if (flaggedIds.has(String(g.id))) continue;
    const row = await db.query("select content from lesson_items where id = $1", [g.id]);
    if (!row.rows[0] || !row.rows[0].content || !row.rows[0].content.verification) continue;
    if (row.rows[0].content.verification.flag === "check_this_answer" && !row.rows[0].content.verification.dismissed) {
      const cc = row.rows[0].content; const nxt = Object.assign({}, cc); delete nxt.verification;
      await db.query("update lesson_items set content = $2 where id = $1", [g.id, JSON.stringify(nxt)]);
    }
  }
  return { checked: gradable.length, flags };
}

async function runMediaPass(courseId, familyId) {
  const items = await db.query("select i.id, i.content from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id where un.course_id = $1 and i.type = 'figure'", [courseId]);
  let queued = 0;
  for (const row of items.rows) {
    const cc = row.content || {};
    if (!cc.prompt || cc.uploadId || cc.url) continue;
    const jobs = require("./jobs");
    const already = await db.query("select 1 from jobs where family_id = $1 and type = 'image' and payload->>'prompt' = $2 and status in ('queued','running') limit 1", [familyId, String(cc.prompt).slice(0, 1000)]);
    if (already.rows[0]) continue;
    await jobs.enqueue(familyId, "image", { prompt: String(cc.prompt).slice(0, 1000), size: "1024x1024", purpose: "figure", refType: "lesson_item", refId: Number(row.id) }, null).catch(() => {});
    queued++;
  }
  return { queued };
}

module.exports = { OUTLINE_SYSTEM, LESSON_SYSTEM, VERIFY_SYSTEM, buildKindMenu, buildOutlinePrompt, buildLessonPrompt, normalizeOutline, persistOutlineAsSkeleton, generateOutline, generateLesson, verifyCourse, runMediaPass, normalizeLanguage, normalizeCefr };
