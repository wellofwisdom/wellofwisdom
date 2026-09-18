// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const MAX_GLOSSES = 100;

function normalize(content) {
  const body = str(content.body, 20000);
  if (!body) return null;
  const lvlRaw = String(content.level || "").trim().toUpperCase().slice(0, 4);
  if (!LEVELS.has(lvlRaw)) return null;
  const level = lvlRaw;
  const title = clean(content.title, 300) || "Reader";
  let glosses;
  if (content.glosses != null && typeof content.glosses === "object" && !Array.isArray(content.glosses)) {
    const out = {};
    let count = 0;
    for (const [k, v] of Object.entries(content.glosses)) {
      if (count >= MAX_GLOSSES) break;
      const word = clean(String(k || ""), 100);
      const gloss = clean(String(v || ""), 500);
      if (!word || !gloss) continue;
      out[word] = gloss;
      count++;
    }
    if (Object.keys(out).length) glosses = out;
  }
  const out = { title, body, level };
  if (glosses) out.glosses = glosses;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!str(content.body, 20000)) return "body_required";
  const lvl = String(content.level || "").trim().toUpperCase().slice(0, 4);
  if (!LEVELS.has(lvl)) return "level_invalid";
  if (content.glosses != null && (typeof content.glosses !== "object" || Array.isArray(content.glosses))) return "glosses_invalid";
  if (content.glosses && typeof content.glosses === "object") {
    const keys = Object.keys(content.glosses);
    if (keys.length > MAX_GLOSSES) return "too_many_glosses";
    for (const [k, v] of Object.entries(content.glosses)) {
      if (typeof v !== "string" || !String(v).trim()) return "gloss_invalid";
      if (String(k).length > 100) return "gloss_too_long";
      if (String(v).length > 500) return "gloss_too_long";
    }
  }
  return null;
}

function strip(content) {
  const out = { title: content.title, body: content.body, level: content.level };
  if (content.glosses && typeof content.glosses === "object" && !Array.isArray(content.glosses)) out.glosses = content.glosses;
  return out;
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade };
