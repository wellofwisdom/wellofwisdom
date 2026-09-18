// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, normalizeHints } = require("./common");
const { stripTags } = require("../../text");

const LEVELS = new Set(["A1", "A2", "B1", "B2"]);
const MAX_IMAGE_PROMPT = 500;
const MAX_ALTERNATIVES = 10;

function isLocalMediaUrl(s) {
  if (typeof s !== "string") return false;
  return /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(s.trim());
}

function normalizeAlternatives(raw) {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const t = stripTags(str(v, 200).trim()).toLowerCase();
    if (!t) continue;
    if (t.length > 200) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_ALTERNATIVES) break;
  }
  return out.length ? out : undefined;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  const lemmaRaw = clean(content.lemma, 200);
  const glossRaw = clean(content.gloss, 500);
  if (!lemmaRaw || !glossRaw) return null;
  const form = clean(content.form, 200) || undefined;
  const example = clean(content.example, 2000) || undefined;
  const exampleGloss = clean(content.exampleGloss, 2000) || undefined;
  const pos = clean(content.pos, 100) || undefined;
  const imagePrompt = content.imagePrompt != null ? clean(content.imagePrompt, MAX_IMAGE_PROMPT) || undefined : undefined;
  const audioText = content.audioText != null ? clean(content.audioText, 500) || undefined : undefined;
  let level;
  if (content.level != null && String(content.level).trim()) {
    const up = String(content.level).trim().toUpperCase();
    if (LEVELS.has(up)) level = up;
    else level = "A1";
  }
  const alternatives = normalizeAlternatives(content.alternatives);
  const out = { prompt: prompt || lemmaRaw, kind: "vocab_card", lemma: lemmaRaw, gloss: glossRaw };
  if (form) out.form = form;
  if (example) out.example = example;
  if (exampleGloss) out.exampleGloss = exampleGloss;
  if (pos) out.pos = pos;
  if (level) out.level = level;
  if (imagePrompt) out.imagePrompt = imagePrompt;
  if (audioText) out.audioText = audioText;
  if (alternatives) out.alternatives = alternatives;
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.lemma, 200)) return "lemma_required";
  if (!clean(content.gloss, 500)) return "gloss_required";
  if (content.level != null && String(content.level).trim()) {
    const up = String(content.level).trim().toUpperCase();
    if (!LEVELS.has(up)) return "level_invalid";
  }
  if (content.imagePrompt != null && String(content.imagePrompt).length > MAX_IMAGE_PROMPT) return "imagePrompt_too_long";
  if (Array.isArray(content.alternatives) && content.alternatives.length > MAX_ALTERNATIVES) return "too_many_alternatives";
  return null;
}

function strip(content) {
  const out = { kind: "vocab_card" };
  if (content.prompt) out.prompt = content.prompt;
  else if (content.lemma) out.prompt = content.lemma;
  if (content.lemma) out.lemma = content.lemma;
  if (content.form) out.form = content.form;
  if (content.example) out.example = content.example;
  if (content.exampleGloss) out.exampleGloss = content.exampleGloss;
  if (content.pos) out.pos = content.pos;
  if (content.level) out.level = content.level;
  if (content.imagePrompt) out.imagePrompt = content.imagePrompt;
  if (content.audioText) out.audioText = content.audioText;
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, 3);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function normalizeAnswer(s) {
  return String(s ?? "").trim().toLowerCase().replace(/^[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+|[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+$/gi, "");
}

function grade(item, learnerAnswer) {
  const gloss = item.gloss != null ? String(item.gloss).trim() : "";
  const alternatives = Array.isArray(item.alternatives) ? item.alternatives : [];
  if (!gloss) return null;
  const given = normalizeAnswer(learnerAnswer);
  if (!given) return { correct: false, score: 0 };
  const expected = normalizeAnswer(gloss);
  if (given === expected) return { correct: true, score: 1 };
  for (const alt of alternatives) {
    if (given === normalizeAnswer(alt)) return { correct: true, score: 1 };
  }
  return { correct: false, score: 0 };
}

module.exports = { kind: "vocab_card", normalize, problem, strip, grade };
