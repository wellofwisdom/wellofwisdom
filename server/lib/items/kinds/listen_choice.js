// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, hasValue, normalizeHints } = require("./common");
const { stripTags } = require("../../text");

const MAX_CHOICES = 6;
const MAX_ID_LEN = 40;

function isLocalMediaUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  return /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(t);
}

function normalizeChoices(rawChoices) {
  const kept = (Array.isArray(rawChoices) ? rawChoices : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_CHOICES);
  const choices = kept.map((c, i) => {
    let id = c.id != null ? String(c.id).trim().slice(0, MAX_ID_LEN) : `c${i + 1}`;
    if (!id) id = `c${i + 1}`;
    const out = { id, text: clean(c.text, 500) };
    const fb = str(c.feedback, 500).trim();
    if (fb) out.feedback = fb;
    return out;
  });
  return { kept, choices };
}

function mapAnswer(rawAnswer, kept, choices) {
  if (!hasValue(rawAnswer)) return null;
  const raw = String(rawAnswer).trim().slice(0, MAX_ID_LEN);
  let at = kept.findIndex((c) => c.id != null && String(c.id).trim().slice(0, MAX_ID_LEN) === raw);
  if (at < 0 && kept.every((c) => c.id == null)) {
    const m = /^c(\d+)$/.exec(raw);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= kept.length) at = Number(m[1]) - 1;
  }
  if (at < 0) at = choices.findIndex((c) => c.text === clean(raw, 500));
  return at >= 0 ? choices[at].id : null;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const audioText = content.audioText != null ? clean(content.audioText, 2000) || undefined : undefined;
  let audioUrl;
  if (content.audioUrl != null && String(content.audioUrl).trim()) {
    const raw = String(content.audioUrl).trim().slice(0, 500);
    if (!isLocalMediaUrl(raw)) return null;
    audioUrl = raw;
  }
  if (!audioText && !audioUrl) return null;
  const { kept, choices } = normalizeChoices(content.choices);
  if (choices.length < 2) return null;
  const answer = mapAnswer(content.answer, kept, choices);
  const out = { prompt, kind: "listen_choice", choices };
  if (audioText) out.audioText = audioText;
  if (audioUrl) out.audioUrl = audioUrl;
  if (answer) out.answer = answer;
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const audioText = content.audioText != null ? clean(content.audioText, 2000) : "";
  const audioUrl = content.audioUrl != null ? String(content.audioUrl).trim() : "";
  if (!audioText && !audioUrl) return "audio_required";
  if (audioUrl && !isLocalMediaUrl(audioUrl)) return "audioUrl_invalid";
  const texts = (Array.isArray(content.choices) ? content.choices : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (texts.length < 2) return "choices_required";
  if (texts.length > MAX_CHOICES) return "too_many_choices";
  for (const c of (Array.isArray(content.choices) ? content.choices : [])) {
    if (c && c.id != null && String(c.id).length > MAX_ID_LEN) return "id_too_long";
  }
  if (!hasValue(content.answer)) return "answer_required";
  const { kept, choices } = normalizeChoices(content.choices);
  const mapped = mapAnswer(content.answer, kept, choices);
  return mapped ? null : "answer_invalid";
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "listen_choice" };
  if (content.audioText) out.audioText = content.audioText;
  if (content.audioUrl) out.audioUrl = content.audioUrl;
  if (Array.isArray(content.choices)) out.choices = content.choices.map((c) => ({ id: c.id, text: c.text }));
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, 3);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function grade(item, learnerAnswer) {
  if (!item.answer || !String(item.answer).trim()) return null;
  const choiceIds = new Set((item.choices || []).map((c) => String(c.id)));
  if (!choiceIds.has(String(item.answer))) return null;
  const given = String(learnerAnswer ?? "").trim();
  if (!given) return { correct: false, score: 0 };
  if (!choiceIds.has(given)) return { correct: false, score: 0 };
  const correct = String(item.answer) === given;
  return { correct, score: correct ? 1 : 0 };
}

module.exports = { kind: "listen_choice", normalize, problem, strip, grade };
