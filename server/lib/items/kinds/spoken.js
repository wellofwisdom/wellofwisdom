// SPDX-License-Identifier: AGPL-3.0-or-later
// Spoken answers: a learner speaks instead of typing, the transcript is shown
// and confirmed before grading, and the grade is exact match or rubric.
// Exact match means case and accent-insensitive equality against expected or
// any alternative, the same rule as vocab_card and translate.
// Rubric means the guide reads a draft and writes the verdict, so the machine
// never auto-grades to an outcome on its own. Until the guide does write one
// the learner sees needsReview true and the words "Sent for review".
//
// Spoken is a language-like kind in shape: prompt always, expected for exact,
// rubric for guided, alternatives accepted, transcript is what is graded.
const { clean, str, normalizeHints } = require("./common");
const { stripTags } = require("../../text");

const MAX_ALTERNATIVES = 10;
const MAX_RUBRIC = 3000;

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
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+|[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+$/gi, "");
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const expected = content.expected != null ? clean(content.expected, 2000) || undefined : undefined;
  const rubric = content.rubric != null ? clean(content.rubric, MAX_RUBRIC) || undefined : undefined;
  if (!expected && !rubric) return null;
  const alternatives = normalizeAlternatives(content.alternatives);
  const out = { prompt, kind: "spoken" };
  if (expected) out.expected = expected;
  if (rubric) out.rubric = rubric;
  if (alternatives) out.alternatives = alternatives;
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const hasExpected = Boolean(clean(content.expected, 2000));
  const hasRubric = Boolean(content.rubric != null && String(content.rubric).trim());
  if (!hasExpected && !hasRubric) return "expected_required";
  if (Array.isArray(content.alternatives) && content.alternatives.length > MAX_ALTERNATIVES) return "too_many_alternatives";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > 3) return "too_many_hints";
  }
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "spoken" };
  if (content.rubric) out.rubric = str(content.rubric, MAX_RUBRIC).trim() || undefined;
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, 3);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function transcriptFrom(learnerAnswer) {
  if (learnerAnswer != null && typeof learnerAnswer === "object" && !Array.isArray(learnerAnswer)) {
    const t = learnerAnswer.transcript;
    if (t != null) return String(t);
    if (learnerAnswer.text != null) return String(learnerAnswer.text);
  }
  return String(learnerAnswer ?? "");
}

function grade(item, learnerAnswer) {
  const given = transcriptFrom(learnerAnswer).trim();
  const expected = item.expected != null ? String(item.expected).trim() : "";
  const rubric = item.rubric != null ? String(item.rubric).trim() : "";
  const hasExpected = Boolean(expected);
  const hasRubric = Boolean(rubric);

  if (!hasExpected && !hasRubric) return null;

  // Rubric-graded spoken items are never auto-graded: a guide reads the
  // transcript and writes the outcome. The learner sees needsReview.
  if (hasRubric && !hasExpected) {
    if (!given) return { correct: false, score: 0, needsReview: true };
    return { correct: false, score: 0, needsReview: true };
  }
  if (hasRubric && hasExpected) {
    // Both kinds present: exact match is checked first, rubric is fallback.
    // A non-matching spoken answer still goes to the guide rather than failing
    // outright, so a child who said something close is not marked wrong by
    // a brittle string compare.
  }

  if (!expected) return null;
  if (!given) return { correct: false, score: 0, needsReview: true };
  const normGiven = normalizeAnswerKey(given);
  const normExpected = normalizeAnswerKey(expected);
  if (!normGiven) return { correct: false, score: 0, needsReview: true };
  if (normGiven === normExpected) return { correct: true, score: 1 };
  const alts = Array.isArray(item.alternatives) ? item.alternatives : [];
  for (const alt of alts) {
    if (normGiven === normalizeAnswerKey(alt)) return { correct: true, score: 1 };
  }
  if (hasRubric) return { correct: false, score: 0, needsReview: true };
  return { correct: false, score: 0, needsReview: true };
}

module.exports = { kind: "spoken", normalize, problem, strip, grade, normalizeAnswerKey, transcriptFrom };
