// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean } = require("./common");

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const model = content.model === "circle" ? "circle" : content.model === "bar" ? "bar" : "bar";
  const parts = toInt(content.parts);
  if (parts == null || parts < 2 || parts > 24) return null;
  const answer = content.answer;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const num = toInt(answer.numerator);
  const den = toInt(answer.denominator);
  if (num == null || den == null) return null;
  if (den <= 0) return null;
  if (num < 0 || num > den) return null;
  const out = { prompt, kind: "fraction", model, parts, answer: { numerator: num, denominator: den } };
  if (content.exact === true) out.exact = true;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const parts = toInt(content.parts);
  if (parts == null) return "parts_required";
  if (parts < 2 || parts > 24) return "parts_invalid";
  if (!content.answer || typeof content.answer !== "object" || Array.isArray(content.answer)) return "answer_required";
  const num = toInt(content.answer.numerator);
  const den = toInt(content.answer.denominator);
  if (num == null || den == null) return "answer_invalid";
  if (den <= 0) return "answer_invalid";
  if (num < 0 || num > den) return "answer_invalid";
  if (content.model != null && content.model !== "bar" && content.model !== "circle") return "model_invalid";
  if (content.exact != null && typeof content.exact !== "boolean") return "exact_invalid";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "fraction", model: content.model || "bar", parts: content.parts };
  if (content.exact === true) out.exact = true;
  return out;
}

function grade(item, learnerAnswer) {
  if (!item.answer || typeof item.answer !== "object") return null;
  const num = Number(item.answer.numerator);
  const den = Number(item.answer.denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  if (item.parts == null || !Number.isFinite(Number(item.parts))) return null;
  const parts = Number(item.parts);
  let shaded = null;
  if (learnerAnswer && typeof learnerAnswer === "object" && !Array.isArray(learnerAnswer) && Array.isArray(learnerAnswer.shaded)) {
    shaded = learnerAnswer.shaded;
  } else if (Array.isArray(learnerAnswer)) {
    shaded = learnerAnswer;
  } else {
    return { correct: false, score: 0 };
  }
  const indices = shaded.map((v) => Number(v)).filter((n) => Number.isFinite(n) && Number.isInteger(n));
  if (indices.length !== shaded.length) return { correct: false, score: 0 };
  for (const idx of indices) {
    if (idx < 0 || idx >= parts) return { correct: false, score: 0 };
  }
  const unique = new Set(indices);
  if (unique.size !== indices.length) return { correct: false, score: 0 };
  const count = indices.length;
  if (item.exact === true) {
    const expected = num * parts / den;
    if (!Number.isInteger(expected)) return { correct: false, score: 0 };
    const correct = count === expected;
    return { correct, score: correct ? 1 : 0 };
  }
  const givenFrac = count / parts;
  const expectedFrac = num / den;
  const correct = Math.abs(givenFrac - expectedFrac) < 1e-9;
  return { correct, score: correct ? 1 : 0 };
}

module.exports = { kind: "fraction", normalize, problem, strip, grade };
