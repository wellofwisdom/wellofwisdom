// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));
const MAX_CHOICES = 5;

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const raw = Array.isArray(content.choices) ? content.choices : [];
  const kept = raw.filter((c) => c && typeof c === "object" && clean(c.text, 500)).slice(0, MAX_CHOICES);
  if (kept.length < 2) return null;
  const choices = kept.map((c, i) => ({ id: `c${i + 1}`, text: clean(c.text, 500) }));
  if (!str(content.reveal, 4000)) return null;
  return { prompt, choices, reveal: str(content.reveal, 4000) };
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const raw = Array.isArray(content.choices) ? content.choices : [];
  const kept = raw.filter((c) => c && typeof c === "object" && clean(c.text, 500));
  if (kept.length < 2) return "choices_required";
  if (kept.length > MAX_CHOICES) return "too_many_choices";
  if (!str(content.reveal, 4000)) return "reveal_required";
  return null;
}

function strip(content) {
  return { prompt: content.prompt, choices: content.choices };
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade, MAX_CHOICES };
