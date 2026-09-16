// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean } = require("./common");

const MAX_ITEMS = 8;
const MIN_ITEMS = 2;

function normalizeOrderItems(rawItems) {
  const kept = (Array.isArray(rawItems) ? rawItems : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_ITEMS);
  const items = kept.map((c, i) => ({ id: `o${i + 1}`, text: clean(c.text, 500) }));
  return { kept, items };
}

function mapOrderAnswer(rawAnswer, kept, items) {
  const rawArr = Array.isArray(rawAnswer)
    ? rawAnswer.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
  if (!rawArr.length) return null;
  const uniq = [...new Set(rawArr)];
  const mapped = [];
  for (const raw of uniq) {
    let at = kept.findIndex((c) => c.id != null && String(c.id) === raw);
    if (at < 0 && kept.every((c) => c.id == null)) {
      const m = /^o(\d+)$/.exec(raw);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
      if (at < 0) {
        const m2 = /^c(\d+)$/.exec(raw);
        if (m2 && Number(m2[1]) >= 1 && Number(m2[1]) <= kept.length) at = Number(m2[1]) - 1;
      }
    }
    if (at < 0) at = items.findIndex((x) => x.text === clean(raw, 500));
    if (at < 0) return null;
    mapped.push(items[at].id);
  }
  return [...new Set(mapped)];
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const out = [...arr];
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function shuffleSeed(itemId, attemptSeed) {
  const a = Number(itemId) >>> 0;
  const b = Number(attemptSeed) >>> 0;
  return ((a * 0x1f1f1f1f) ^ (b * 0x9e3779b9) ^ 0x85ebca6b) >>> 0;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const { kept, items } = normalizeOrderItems(content.items);
  if (items.length < MIN_ITEMS) return null;
  const mapped = mapOrderAnswer(content.answer, kept, items);
  const out = { prompt, kind: "order", items };
  if (mapped && mapped.length === items.length) out.answer = mapped;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const texts = (Array.isArray(content.items) ? content.items : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (texts.length < MIN_ITEMS) return "items_required";
  if (texts.length > MAX_ITEMS) return "too_many_items";
  if (!Array.isArray(content.answer) || content.answer.length === 0) return "answer_required";
  const { kept, items } = normalizeOrderItems(content.items);
  const mapped = mapOrderAnswer(content.answer, kept, items);
  if (!mapped) return "answer_invalid";
  if (mapped.length !== items.length) return "answer_invalid";
  const uniq = new Set(mapped);
  if (uniq.size !== items.length) return "answer_invalid";
  for (const id of mapped) if (!items.some((x) => x.id === id)) return "answer_invalid";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "order" };
  if (Array.isArray(content.items)) out.items = content.items.map((c) => ({ id: c.id, text: c.text }));
  return out;
}

function shuffledForAttempt(content, opts) {
  const base = strip(content);
  if (!base.items || !base.items.length) return base;
  const seed = opts && opts.seed != null ? Number(opts.seed) >>> 0 : shuffleSeed(opts && opts.itemId, opts && opts.attemptId);
  base.items = seededShuffle(base.items, seed);
  return base;
}

function grade(item, learnerAnswer) {
  if (!Array.isArray(item.answer) || item.answer.length === 0) return null;
  const ids = new Set((item.items || []).map((c) => String(c.id)));
  const answer = item.answer.map((v) => String(v));
  for (const id of answer) if (!ids.has(id)) return null;
  if (!ids.size || answer.length !== ids.size) return null;
  const givenRaw = Array.isArray(learnerAnswer) ? learnerAnswer.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
  const given = [...new Set(givenRaw)];
  for (const id of given) if (!ids.has(id)) return { correct: false, score: 0 };
  if (given.length !== answer.length) {
    let longest = 0;
    let run = 0;
    for (let i = 0; i < Math.min(given.length, answer.length); i++) {
      if (given[i] === answer[i]) { run++; if (run > longest) longest = run; }
      else run = 0;
    }
    const score = answer.length ? longest / answer.length : 0;
    return { correct: false, score };
  }
  const correct = given.every((id, i) => id === answer[i]);
  if (correct) return { correct: true, score: 1 };
  let longest = 0;
  let run = 0;
  for (let i = 0; i < answer.length; i++) {
    if (given[i] === answer[i]) { run++; if (run > longest) longest = run; }
    else run = 0;
  }
  const score = longest / answer.length;
  return { correct: false, score };
}

module.exports = { kind: "order", normalize, problem, strip, grade, seededShuffle, shuffledForAttempt, shuffleSeed, mulberry32 };
