// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, MAX_CHOICES, normalizeChoices, mapMultiAnswer } = require("./common");

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const { kept, choices } = normalizeChoices(content.choices);
  if (choices.length < 2) return null;
  const mapped = mapMultiAnswer(content.answer, kept, choices);
  const out = { prompt, kind: "multi", choices };
  if (mapped && mapped.length) out.answer = mapped;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const hasValue = (v) => v != null && String(v).trim() !== "";
  const texts = (Array.isArray(content.choices) ? content.choices : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (texts.length < 2) return "choices_required";
  if (texts.length > MAX_CHOICES) return "too_many_choices";
  if (!Array.isArray(content.answer) || content.answer.length === 0) {
    if (hasValue(content.answer)) {
      const { kept, choices } = normalizeChoices(content.choices);
      const mapped = mapMultiAnswer(content.answer, kept, choices);
      if (!mapped || !mapped.length) return "answer_invalid";
      return null;
    }
    return "answer_required";
  }
  const { kept, choices } = normalizeChoices(content.choices);
  const mapped = mapMultiAnswer(content.answer, kept, choices);
  if (!mapped) return "answer_invalid";
  if (!mapped.length) return "answer_required";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "multi" };
  if (Array.isArray(content.choices)) out.choices = content.choices.map((c) => ({ id: c.id, text: c.text }));
  return out;
}

function grade(item, learnerAnswer) {
  if (!Array.isArray(item.answer) || item.answer.length === 0) return null;
  const choiceIds = new Set((item.choices || []).map((c) => String(c.id)));
  const answerSet = new Set(item.answer.map((v) => String(v)));
  for (const id of answerSet) if (!choiceIds.has(id)) return null;
  if (!choiceIds.size) return null;
  const givenRaw = Array.isArray(learnerAnswer) ? learnerAnswer.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
  const givenSet = new Set([...new Set(givenRaw)].filter((id) => choiceIds.has(id)));
  const correct = answerSet.size === givenSet.size && [...answerSet].every((id) => givenSet.has(id));
  let correctDecisions = 0;
  for (const cid of choiceIds) {
    const inAnswer = answerSet.has(cid);
    const inGiven = givenSet.has(cid);
    if (inAnswer === inGiven) correctDecisions++;
  }
  const score = correctDecisions / choiceIds.size;
  return { correct, score };
}

module.exports = { kind: "multi", normalize, problem, strip, grade };
