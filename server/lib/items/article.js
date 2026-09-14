// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

function normalize(content) {
  const body = str(content.body, 20000);
  if (!body) return null;
  return { title: clean(content.title, 300) || "Lesson", body };
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  return str(content.body, 20000) ? null : "body_required";
}

function strip(content) {
  return { title: content.title, body: content.body };
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade };
