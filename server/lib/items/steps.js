// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

const MAX_STEPS = 12;

function normalize(content) {
  const title = clean(content.title, 300) || "Example";
  const problemText = clean(content.problem, 1000);
  if (!problemText) return null;
  const raw = Array.isArray(content.steps) ? content.steps : [];
  const kept = raw.filter((s) => s && typeof s === "object" && clean(s.text, 2000)).slice(0, MAX_STEPS);
  if (!kept.length) return null;
  const steps = kept.map((s) => ({ text: clean(s.text, 2000) }));
  const out = { title, problem: problemText, steps };
  if (content.fadeLast != null) {
    const n = Number(content.fadeLast);
    if (Number.isInteger(n) && n >= 1 && n <= steps.length) out.fadeLast = n;
  }
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.problem, 1000)) return "problem_required";
  const raw = Array.isArray(content.steps) ? content.steps : [];
  const kept = raw.filter((s) => s && typeof s === "object" && clean(s.text, 2000));
  if (!kept.length) return "steps_required";
  if (kept.length > MAX_STEPS) return "too_many_steps";
  if (content.fadeLast != null) {
    const n = Number(content.fadeLast);
    if (!Number.isInteger(n) || n < 1 || n > kept.slice(0, MAX_STEPS).length) return "fadeLast_invalid";
  }
  return null;
}

function strip(content) {
  const out = { title: content.title, problem: content.problem, steps: content.steps };
  if (content.fadeLast != null) out.fadeLast = content.fadeLast;
  return out;
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade, MAX_STEPS };
