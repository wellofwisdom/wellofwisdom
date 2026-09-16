// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str } = require("./common");

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const out = { prompt, kind: "text" };
  const a = str(content.answer, 2000);
  if (a) out.answer = a;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  return str(content.answer, 2000) ? null : "answer_required";
}

function strip(content) {
  return { prompt: content.prompt, kind: "text" };
}

function grade() {
  return null;
}

module.exports = { kind: "text", normalize, problem, strip, grade };
