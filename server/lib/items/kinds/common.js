// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared helpers for exercise sub-kinds. One place, no divergence.
const { stripTags } = require("../../text");

const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));
const hasValue = (v) => v != null && String(v).trim() !== "";

const MAX_CHOICES = 5;
const MAX_HINTS = 3;

function normalizeHints(content) {
  if (Array.isArray(content.hints)) {
    const arr = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_HINTS);
    if (arr.length) return arr;
  }
  const single = str(content.hint, 500).trim();
  if (single) return [single];
  return undefined;
}

function parseNumeric(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  const mixed = s.match(/^(-?\d+)\+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const mixedSpace = String(v ?? "").trim().match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedSpace) return Number(mixedSpace[1]) + Number(mixedSpace[2]) / Number(mixedSpace[3]);
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? NaN : Number(frac[1]) / denom;
  }
  return parseFloat(s);
}

function normalizeChoices(rawChoices) {
  const kept = (Array.isArray(rawChoices) ? rawChoices : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_CHOICES);
  const choices = kept.map((c, i) => {
    const out = { id: `c${i + 1}`, text: clean(c.text, 500) };
    const fb = str(c.feedback, 500).trim();
    if (fb) out.feedback = fb;
    return out;
  });
  return { kept, choices };
}

function mapChoices(rawChoices, rawAnswer) {
  const { kept, choices } = normalizeChoices(rawChoices);
  if (!hasValue(rawAnswer)) return { choices, answer: null };
  const raw = String(rawAnswer).trim();
  let at = kept.findIndex((c) => c.id != null && String(c.id) === raw);
  if (at < 0 && kept.every((c) => c.id == null)) {
    const m = /^c(\d+)$/.exec(raw);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
  }
  if (at < 0) at = choices.findIndex((c) => c.text === clean(raw, 500));
  return { choices, answer: at >= 0 ? choices[at].id : null };
}

function mapMultiAnswer(rawAnswer, kept, choices) {
  const rawArr = Array.isArray(rawAnswer)
    ? rawAnswer.map((v) => String(v ?? "").trim()).filter(Boolean)
    : hasValue(rawAnswer) ? [String(rawAnswer).trim()] : [];
  if (!rawArr.length) return [];
  const uniq = [...new Set(rawArr)];
  const mapped = [];
  for (const raw of uniq) {
    let at = kept.findIndex((c) => c.id != null && String(c.id) === raw);
    if (at < 0 && kept.every((c) => c.id == null)) {
      const m = /^c(\d+)$/.exec(raw);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
    }
    if (at < 0) at = choices.findIndex((c) => c.text === clean(raw, 500));
    if (at < 0) return null;
    mapped.push(choices[at].id);
  }
  return [...new Set(mapped)];
}

module.exports = {
  str,
  clean,
  hasValue,
  MAX_CHOICES,
  MAX_HINTS,
  normalizeHints,
  parseNumeric,
  normalizeChoices,
  mapChoices,
  mapMultiAnswer,
};
