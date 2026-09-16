// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

function normalize(content) {
  const alt = clean(content.alt, 500);
  if (!alt) return null;
  const caption = clean(content.caption, 1000);
  const out = { alt, caption: caption || "" };
  const prompt = str(content.prompt, 2000);
  if (prompt) out.prompt = prompt;
  const uploadId = Number(content.uploadId);
  if (Number.isInteger(uploadId) && uploadId > 0) out.uploadId = uploadId;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.alt, 500)) return "alt_required";
  return null;
}

function strip(content) {
  const out = { alt: content.alt, caption: content.caption || "" };
  if (content.uploadId) out.uploadId = content.uploadId;
  if (content.prompt) out.prompt = content.prompt;
  return out;
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade };
