// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));
const hasValue = (v) => v != null && String(v).trim() !== "";
const MAX_CHOICES = 5;
const MAX_HINTS = 3;

function normalizeHints(content) {
  if (Array.isArray(content.hints)) {
    const arr = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_HINTS);
    if (arr.length) return arr;
  }
  const single = str(content.hint, 500).trim();
  if (single) return [single];
  return undefined;
}

function normalizeChoices(rawChoices) {
  const kept = (Array.isArray(rawChoices) ? rawChoices : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_CHOICES);
  const choices = kept.map((c, i) => {
    const out = { id: `c${i + 1}`, text: clean(c.text, 500) };
    const fb = str(c.feedback, 500).trim();
    if (fb) out.feedback = fb;
    return out;
  });
  return { kept, choices };
}

function mapChoices(rawChoices, rawAnswer) {
  const { kept, choices } = normalizeChoices(rawChoices);
  if (!hasValue(rawAnswer)) return { choices, answer: null };
  const raw = String(rawAnswer).trim();
  let at = kept.findIndex((c) => c.id != null && String(c.id) === raw);
  if (at < 0 && kept.every((c) => c.id == null)) {
    const m = /^c(\d+)$/.exec(raw);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
  }
  if (at < 0) at = choices.findIndex((c) => c.text === clean(raw, 500));
  return { choices, answer: at >= 0 ? choices[at].id : null };
}

function mapMultiAnswer(rawAnswer, kept, choices) {
  const rawArr = Array.isArray(rawAnswer)
    ? rawAnswer.map((v) => String(v ?? "").trim()).filter(Boolean)
    : hasValue(rawAnswer) ? [String(rawAnswer).trim()] : [];
  if (!rawArr.length) return [];
  const uniq = [...new Set(rawArr)];
  const mapped = [];
  for (const raw of uniq) {
    let at = kept.findIndex((c) => c.id != null && String(c.id) === raw);
    if (at < 0 && kept.every((c) => c.id == null)) {
      const m = /^c(\d+)$/.exec(raw);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
    }
    if (at < 0) at = choices.findIndex((c) => c.text === clean(raw, 500));
    if (at < 0) return null;
    mapped.push(choices[at].id);
  }
  return [...new Set(mapped)];
}

function normalize(content) {
  const kind = ["mcq", "numeric", "text", "multi"].includes(content.kind) ? content.kind : "mcq";
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const ex = { prompt, kind };
  if (kind === "mcq") {
    const { choices, answer } = mapChoices(content.choices, content.answer);
    if (choices.length < 2) return null;
    ex.choices = choices;
    if (answer) ex.answer = answer;
  } else if (kind === "multi") {
    const { kept, choices } = normalizeChoices(content.choices);
    if (choices.length < 2) return null;
    ex.choices = choices;
    const mapped = mapMultiAnswer(content.answer, kept, choices);
    if (mapped && mapped.length) ex.answer = mapped;
  } else if (kind === "numeric") {
    if (hasValue(content.answer)) {
      const n = parseNumeric(content.answer);
      if (!Number.isFinite(n)) return null;
      ex.answer = n;
    }
  } else {
    const a = str(content.answer, 2000);
    if (a) ex.answer = a;
  }
  const explanation = str(content.explanation, 3000);
  if (explanation) ex.explanation = explanation;
  const hints = normalizeHints(content);
  if (hints) ex.hints = hints;
  return ex;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  const choiceTexts = (list) => (Array.isArray(list) ? list : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const kind = ["mcq", "numeric", "text", "multi"].includes(content.kind) ? content.kind : "mcq";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > MAX_HINTS) return "too_many_hints";
    for (const h of filtered) if (h.length > 500) return "hint_too_long";
  }
  if (kind === "mcq") {
    const texts = choiceTexts(content.choices);
    if (texts.length < 2) return "choices_required";
    if (texts.length > MAX_CHOICES) return "too_many_choices";
    if (!hasValue(content.answer)) return "answer_required";
    return mapChoices(content.choices, content.answer).answer ? null : "answer_invalid";
  }
  if (kind === "multi") {
    const texts = choiceTexts(content.choices);
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
  if (kind === "numeric") {
    const n = parseNumeric(content.answer);
    return String(content.answer ?? "").trim() && Number.isFinite(n) ? null : "answer_required";
  }
  return str(content.answer, 2000) ? null : "answer_required";
}

function strip(content) {
  const out = { prompt: content.prompt, kind: content.kind };
  if (Array.isArray(content.choices)) {
    out.choices = content.choices.map((c) => ({ id: c.id, text: c.text }));
  }
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_HINTS);
  } else if (content.hint) {
    const single = str(content.hint, 500).trim();
    if (single) out.hints = [single];
  } else if (Array.isArray(content.hints)) {
    out.hints = [];
  }
  // explanation stays server-side; shown only in learn.js reveal after an attempt.
  return out;
}

function grade(item, learnerAnswer) {
  const kind = item.kind;
  if (kind === "mcq") {
    const keyless = item.answer == null || String(item.answer).trim() === "";
    if (keyless || !(item.choices || []).some((c) => c.id === item.answer)) return null;
    const id = String(learnerAnswer ?? "");
    const valid = (item.choices || []).some((c) => c.id === id);
    return valid && String(item.answer) === id;
  }
  if (kind === "multi") {
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
  if (kind === "numeric") {
    const keyless = item.answer == null || String(item.answer).trim() === "";
    if (keyless) return null;
    const expected = parseNumeric(item.answer);
    const given = parseNumeric(learnerAnswer);
    if (!Number.isFinite(expected) || !Number.isFinite(given)) return false;
    const tol = Math.max(Math.abs(expected) * 0.005, 0.01);
    return Math.abs(expected - given) <= tol;
  }
  if (kind === "text") return null;
  return null;
}

function parseNumeric(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  const mixed = s.match(/^(-?\d+)\+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const mixedSpace = String(v ?? "").trim().match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedSpace) return Number(mixedSpace[1]) + Number(mixedSpace[2]) / Number(mixedSpace[3]);
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? NaN : Number(frac[1]) / denom;
  }
  return parseFloat(s);
}

module.exports = { normalize, problem, strip, grade, mapChoices, MAX_CHOICES, MAX_HINTS };
