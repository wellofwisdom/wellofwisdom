// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, normalizeHints } = require("./common");
const { stripTags } = require("../../text");

const MAX_ALTERNATIVES = 10;
const MAX_HINTS = 3;

function isLocalMediaUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  return /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(t);
}

function normalizeAlternatives(raw) {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const t = str(v, 2000).trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
    if (out.length >= MAX_ALTERNATIVES) break;
  }
  return out.length ? out : undefined;
}

function normalizeHintsLocal(content) {
  return normalizeHints(content);
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const expected = clean(content.expected, 2000);
  if (!expected) return null;
  const audioText = content.audioText != null ? clean(content.audioText, 2000) || undefined : undefined;
  let audioUrl;
  if (content.audioUrl != null && String(content.audioUrl).trim()) {
    const raw = String(content.audioUrl).trim().slice(0, 500);
    if (!isLocalMediaUrl(raw)) return null;
    audioUrl = raw;
  }
  const alternatives = normalizeAlternatives(content.alternatives);
  let hints;
  const h = normalizeHintsLocal(content);
  if (h) hints = h;
  const out = { prompt, kind: "listen_repeat", expected };
  if (audioText) out.audioText = audioText;
  if (audioUrl) out.audioUrl = audioUrl;
  if (alternatives) out.alternatives = alternatives;
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  if (!clean(content.expected, 2000)) return "expected_required";
  const audioUrl = content.audioUrl != null ? String(content.audioUrl).trim() : "";
  if (audioUrl && !isLocalMediaUrl(audioUrl)) return "audioUrl_invalid";
  if (Array.isArray(content.alternatives) && content.alternatives.length > MAX_ALTERNATIVES) return "too_many_alternatives";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > MAX_HINTS) return "too_many_hints";
  }
  if (Array.isArray(content.choices) && content.choices.length > 6) return "too_many_choices";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "listen_repeat" };
  if (content.audioText) out.audioText = content.audioText;
  if (content.audioUrl) out.audioUrl = content.audioUrl;
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_HINTS);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function foldAccents(s) {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokenize(s) {
  const folded = foldAccents(String(s).toLowerCase());
  const noPunct = folded.replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df\s]/g, " ");
  return noPunct.split(/\s+/).filter(Boolean);
}

function grade(item, learnerAnswer) {
  const expected = item.expected != null ? String(item.expected).trim() : "";
  if (!expected) return null;
  let transcript = "";
  if (learnerAnswer != null && typeof learnerAnswer === "object" && !Array.isArray(learnerAnswer)) {
    transcript = learnerAnswer.transcript != null ? String(learnerAnswer.transcript) : "";
  } else {
    transcript = learnerAnswer != null ? String(learnerAnswer) : "";
  }
  const expectedWords = tokenize(expected);
  if (!expectedWords.length) return null;
  const givenWords = tokenize(transcript);
  if (!givenWords.length) return { correct: false, score: 0 };

  const altWordsList = [];
  if (Array.isArray(item.alternatives)) {
    for (const alt of item.alternatives) {
      const w = tokenize(alt);
      if (w.length) altWordsList.push(w);
    }
  }

  function scoreAgainst(expWords) {
    let matched = 0;
    const len = Math.min(expWords.length, givenWords.length);
    // Count words that match in order from the start
    for (let i = 0; i < expWords.length; i++) {
      if (i < givenWords.length && expWords[i] === givenWords[i]) matched++;
      else break;
    }
    // If prefix match fails early, fall back to counting matching words in order
    // but only counting sequential matches from start (strict prefix)
    // This keeps A1 grading simple: word order matters.
    return matched / expWords.length;
  }

  let bestScore = scoreAgainst(expectedWords);
  for (const alt of altWordsList) {
    const s = scoreAgainst(alt);
    if (s > bestScore) bestScore = s;
  }
  const score = bestScore;
  const correct = score === 1;
  return { correct, score };
}

module.exports = { kind: "listen_repeat", normalize, problem, strip, grade, tokenize, foldAccents };
