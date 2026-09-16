// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, hasValue, parseNumeric } = require("./common");

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const out = { prompt, kind: "numeric" };
  if (hasValue(content.answer)) {
    const n = parseNumeric(content.answer);
    if (!Number.isFinite(n)) return null;
    out.answer = n;
  }
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const n = parseNumeric(content.answer);
  return String(content.answer ?? "").trim() && Number.isFinite(n) ? null : "answer_required";
}

function strip(content) {
  return { prompt: content.prompt, kind: "numeric" };
}

function grade(item, learnerAnswer) {
  const keyless = item.answer == null || String(item.answer).trim() === "";
  if (keyless) return null;
  const expected = parseNumeric(item.answer);
  const given = parseNumeric(learnerAnswer);
  if (!Number.isFinite(expected) || !Number.isFinite(given)) return false;
  const tol = Math.max(Math.abs(expected) * 0.005, 0.01);
  return Math.abs(expected - given) <= tol;
}

module.exports = { kind: "numeric", normalize, problem, strip, grade };
