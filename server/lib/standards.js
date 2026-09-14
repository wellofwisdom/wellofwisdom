// SPDX-License-Identifier: AGPL-3.0-or-later
// Standards tags: normalize codes, cap counts, and label frameworks.

const MAX_PER_LESSON = 12;
const MAX_CODE_LEN = 40;

function frameworkOf(code) {
  const c = String(code || "").trim();
  const upper = c.toUpperCase();
  if (upper.startsWith("CCSS.MATH")) return "CCSS Math";
  if (upper.startsWith("CCSS.ELA")) return "CCSS ELA";
  if (upper.startsWith("CCSS")) return "CCSS";
  if (upper.startsWith("NGSS")) return "NGSS";
  return "State";
}

function normalizeCode(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  s = s.slice(0, MAX_CODE_LEN).trim();
  const upper = s.toUpperCase();
  if (upper.startsWith("CCSS") || upper.startsWith("NGSS")) return upper.slice(0, MAX_CODE_LEN);
  return s;
}

function normalizeStandards(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const code = normalizeCode(raw);
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.length >= MAX_PER_LESSON) break;
    out.push(code);
  }
  return out;
}

function labelFor(code) {
  return frameworkOf(code);
}

module.exports = { MAX_PER_LESSON, MAX_CODE_LEN, frameworkOf, normalizeCode, normalizeStandards, labelFor };
