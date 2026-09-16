// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, hasValue, MAX_CHOICES, mapChoices, normalizeChoices } = require("./common");

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const { choices, answer } = mapChoices(content.choices, content.answer);
  if (choices.length < 2) return null;
  const out = { prompt, kind: "mcq", choices };
  if (answer) out.answer = answer;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const texts = (Array.isArray(content.choices) ? content.choices : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (texts.length < 2) return "choices_required";
  if (texts.length > MAX_CHOICES) return "too_many_choices";
  if (!hasValue(content.answer)) return "answer_required";
  return mapChoices(content.choices, content.answer).answer ? null : "answer_invalid";
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "mcq" };
  if (Array.isArray(content.choices)) out.choices = content.choices.map((c) => ({ id: c.id, text: c.text }));
  return out;
}

function grade(item, learnerAnswer) {
  const keyless = item.answer == null || String(item.answer).trim() === "";
  if (keyless || !(item.choices || []).some((c) => c.id === item.answer)) return null;
  const id = String(learnerAnswer ?? "");
  const valid = (item.choices || []).some((c) => c.id === id);
  return valid && String(item.answer) === id;
}

module.exports = { kind: "mcq", normalize, problem, strip, grade };
