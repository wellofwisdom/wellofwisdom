// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

function normalize(content) {
  const title = clean(content.title, 300);
  const description = str(content.description, 5000);
  if (!title || !description) return null;
  const p = { title, description };
  const rubric = str(content.rubric, 3000);
  if (rubric) p.rubric = rubric;
  return p;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.title, 300)) return "title_required";
  return str(content.description, 5000) ? null : "description_required";
}

function strip(content) { return content; }
function grade() { return null; }
module.exports = { normalize, problem, strip, grade };
