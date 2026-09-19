// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, normalizeHints } = require("./common");
const { stripTags } = require("../../text");

const MAX_ALTERNATIVES = 10;
const DIRECTIONS = new Set(["en_to_es", "es_to_en"]);

function normalizeAlternatives(raw) {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const t = stripTags(str(v, 2000).trim());
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
    if (out.length >= MAX_ALTERNATIVES) break;
  }
  return out.length ? out : undefined;
}

function normalizeAnswerKey(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z0-9\u00c0-\u024f]+|[^a-z0-9\u00c0-\u024f]+$/gi, "");
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const expected = clean(content.expected, 2000);
  if (!expected) return null;
  const direction = content.direction != null ? String(content.direction).trim().toLowerCase() : "";
  let dir;
  if (direction) {
    if (!DIRECTIONS.has(direction)) return null;
    dir = direction;
  }
  const alternatives = normalizeAlternatives(content.alternatives);
  const rubric = content.rubric != null ? clean(content.rubric, 3000) || undefined : undefined;
  const out = { prompt, kind: "translate", expected };
  if (dir) out.direction = dir;
  if (alternatives) out.alternatives = alternatives;
  if (rubric) out.rubric = rubric;
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  if (!clean(content.expected, 2000)) return "expected_required";
  if (content.direction != null && String(content.direction).trim()) {
    const d = String(content.direction).trim().toLowerCase();
    if (!DIRECTIONS.has(d)) return "direction_invalid";
  }
  if (Array.isArray(content.alternatives) && content.alternatives.length > MAX_ALTERNATIVES) return "too_many_alternatives";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > 3) return "too_many_hints";
  }
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "translate" };
  if (content.direction) out.direction = content.direction;
  if (content.rubric) out.rubric = str(content.rubric, 3000).trim() || undefined;
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, 3);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function grade(item, learnerAnswer) {
  const expected = item.expected != null ? String(item.expected).trim() : "";
  if (!expected) return null;
  const given = String(learnerAnswer ?? "").trim();
  if (!given) return { correct: false, score: 0, needsReview: true };
  const normGiven = normalizeAnswerKey(given);
  const normExpected = normalizeAnswerKey(expected);
  if (!normGiven) return { correct: false, score: 0, needsReview: true };
  if (normGiven === normExpected) return { correct: true, score: 1 };
  const alts = Array.isArray(item.alternatives) ? item.alternatives : [];
  for (const alt of alts) {
    if (normGiven === normalizeAnswerKey(alt)) return { correct: true, score: 1 };
  }
  return { correct: false, score: 0, needsReview: true };
}

module.exports = { kind: "translate", normalize, problem, strip, grade, normalizeAnswerKey };
