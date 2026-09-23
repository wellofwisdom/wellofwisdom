// SPDX-License-Identifier: AGPL-3.0-or-later
// Standards tags: normalize codes, cap counts, label frameworks,
// plus CEFR and target_language for language courses so portfolio
// and reports can group by them.

const MAX_PER_LESSON = 12;
const MAX_CODE_LEN = 40;

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

const CEFR_DESCRIPTORS = {
  A1: "Can understand and use familiar everyday expressions and very basic phrases. Can introduce self and others and ask and answer questions about personal details. Can interact in a simple way when the other person talks slowly and clearly.",
  A2: "Can understand sentences and frequently used expressions related to areas of immediate relevance. Can communicate in simple and routine tasks requiring a simple and direct exchange of information. Can describe in simple terms aspects of background, surroundings and immediate needs.",
  B1: "Can understand the main points of clear standard input on familiar matters. Can deal with most situations while travelling. Can produce simple connected text on topics which are familiar or of personal interest.",
  B2: "Can understand the main ideas of complex text on both concrete and abstract topics. Can interact with a degree of fluency and spontaneity with native speakers. Can produce clear detailed text on a wide range of subjects.",
  C1: "Can understand a wide range of demanding longer texts and recognise implicit meaning. Can express ideas fluently and spontaneously without much obvious searching. Can use language flexibly and effectively for social, academic and professional purposes.",
  C2: "Can understand with ease virtually everything heard or read. Can summarise information from different spoken and written sources and reconstruct arguments coherently. Can express self spontaneously very fluently and precisely.",
};

function normalizeCefr(v) {
  const s = String(v || "").trim().toUpperCase().slice(0, 4);
  return CEFR_LEVELS.has(s) ? s : null;
}

function descriptorFor(level) {
  const n = normalizeCefr(level);
  return n ? CEFR_DESCRIPTORS[n] : null;
}

function normalizeLanguage(v) {
  const s = String(v || "").trim().toLowerCase().slice(0, 20);
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(s)) return null;
  return s;
}

function frameworkOf(code) {
  const c = String(code || "").trim();
  const upper = c.toUpperCase();
  if (/^CEFR\b/.test(upper) || CEFR_LEVELS.has(upper)) return "CEFR";
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
  if (CEFR_LEVELS.has(upper) || upper.startsWith("CEFR")) {
    const lvl = normalizeCefr(upper.replace(/^CEFR[\s.:-]*/i, "").trim()) || normalizeCefr(upper);
    if (lvl) return lvl;
  }
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
  const fw = frameworkOf(code);
  if (fw === "CEFR") {
    const lvl = normalizeCefr(String(code || "").replace(/^CEFR[\s.:-]*/i, "").trim()) || normalizeCefr(code);
    if (lvl && CEFR_DESCRIPTORS[lvl]) return "CEFR " + lvl + ": " + CEFR_DESCRIPTORS[lvl].slice(0, 80) + "...";
    return "CEFR";
  }
  return fw;
}

function groupByLanguage(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const lang = normalizeLanguage(r.target_language || r.targetLanguage || r.language) || "unknown";
    const cefr = normalizeCefr(r.cefr || r.cefr_level || r.cefrLevel) || "unlevelled";
    const key = lang + ":" + cefr;
    if (!map.has(key)) map.set(key, { target_language: lang, cefr, count: 0, rows: [] });
    const g = map.get(key);
    g.count++;
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.target_language !== b.target_language) return a.target_language.localeCompare(b.target_language);
    const ai = CEFR_ORDER.indexOf(a.cefr);
    const bi = CEFR_ORDER.indexOf(b.cefr);
    if (ai === -1 && bi === -1) return a.cefr.localeCompare(b.cefr);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function groupByCefr(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const cefr = normalizeCefr(r.cefr || r.cefr_level || r.cefrLevel) || "unlevelled";
    if (!map.has(cefr)) map.set(cefr, { cefr, count: 0, rows: [] });
    const g = map.get(cefr);
    g.count++;
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = CEFR_ORDER.indexOf(a.cefr);
    const bi = CEFR_ORDER.indexOf(b.cefr);
    if (ai === -1 && bi === -1) return a.cefr.localeCompare(b.cefr);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

module.exports = {
  MAX_PER_LESSON,
  MAX_CODE_LEN,
  CEFR_LEVELS,
  CEFR_ORDER,
  CEFR_DESCRIPTORS,
  normalizeCefr,
  descriptorFor,
  normalizeLanguage,
  frameworkOf,
  normalizeCode,
  normalizeStandards,
  labelFor,
  groupByLanguage,
  groupByCefr,
};
