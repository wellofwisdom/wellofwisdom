// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, parseNumeric } = require("./common");

function toNumber(v) {
  if (typeof v === "number") return v;
  const n = parseNumeric(v);
  return n;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const min = toNumber(content.min);
  const max = toNumber(content.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  const stepRaw = content.step != null ? toNumber(content.step) : null;
  const step = stepRaw != null && Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : null;
  if (stepRaw != null && (step == null || !Number.isFinite(stepRaw) || stepRaw <= 0)) return null;
  const answer = toNumber(content.answer);
  if (!Number.isFinite(answer)) return null;
  const toleranceRaw = content.tolerance;
  let tolerance = null;
  if (toleranceRaw != null) {
    const t = toNumber(toleranceRaw);
    if (!Number.isFinite(t) || t < 0) return null;
    tolerance = t;
  }
  if (tolerance == null) {
    tolerance = Math.max(Math.abs(answer) * 0.005, 0.01);
    if (step != null && step > 0) tolerance = Math.min(tolerance, step / 2);
  }
  const out = { prompt, kind: "numberline", min, max, answer, tolerance };
  if (step != null) out.step = step;
  if (Array.isArray(content.labels)) {
    const labels = content.labels
      .map((v) => clean(String(v ?? ""), 200))
      .filter(Boolean)
      .slice(0, 8);
    if (labels.length) out.labels = labels;
  } else if (typeof content.labels === "string" && clean(content.labels, 200)) {
    out.labels = [clean(content.labels, 200)];
  }
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const min = toNumber(content.min);
  const max = toNumber(content.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "range_required";
  if (min >= max) return "range_invalid";
  if (content.step != null) {
    const s = toNumber(content.step);
    if (!Number.isFinite(s) || s <= 0) return "step_invalid";
  }
  const answer = toNumber(content.answer);
  if (!Number.isFinite(answer)) return "answer_required";
  if (content.tolerance != null) {
    const t = toNumber(content.tolerance);
    if (!Number.isFinite(t) || t < 0) return "tolerance_invalid";
  }
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "numberline", min: content.min, max: content.max };
  if (content.step != null) out.step = content.step;
  if (Array.isArray(content.labels) && content.labels.length) out.labels = content.labels.slice(0, 8);
  return out;
}

function grade(item, learnerAnswer) {
  if (item.answer == null || String(item.answer).trim() === "" || !Number.isFinite(Number(item.answer))) {
    if (!Number.isFinite(parseNumeric(item.answer))) return null;
  }
  const expected = parseNumeric(item.answer);
  const given = parseNumeric(learnerAnswer);
  if (!Number.isFinite(expected)) return null;
  if (!Number.isFinite(given)) return { correct: false, score: 0 };
  const tol = item.tolerance != null && Number.isFinite(Number(item.tolerance)) ? Number(item.tolerance) : Math.max(Math.abs(expected) * 0.005, 0.01);
  const diff = Math.abs(expected - given);
  const correct = diff <= tol;
  return { correct, score: correct ? 1 : 0 };
}

module.exports = { kind: "numberline", normalize, problem, strip, grade };
