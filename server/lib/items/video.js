// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const { youtubeId } = require("../grade");
const { fileVideoUrl, peerTubeHostId } = require("../video");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));
const MAX_CHOICES = 5;
const MAX_VIDEO_QUESTIONS = 4;
const hasValue = (v) => v != null && String(v).trim() !== "";

function mapChoices(rawChoices, rawAnswer) {
  const kept = (Array.isArray(rawChoices) ? rawChoices : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_CHOICES);
  const choices = kept.map((c, i) => ({ id: `c${i + 1}`, text: clean(c.text, 500) }));
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

function normalize(content) {
  const id = youtubeId(content.youtubeId || content.url || "");
  const uploadId = Number(content.uploadId);
  const hasUpload = Number.isInteger(uploadId) && uploadId > 0;
  const vimeoId = /^\d{5,12}$/.test(String(content.vimeoId || "")) ? String(content.vimeoId) : null;
  const fileUrl = fileVideoUrl(content.fileUrl || "");
  const pt = peerTubeHostId(content.peertubeHost, content.peertubeId);
  if (!id && !hasUpload && !vimeoId && !fileUrl && !pt) return null;
  const v = { title: clean(content.title, 300) || "Video", note: str(content.note, 1000) };
  if (id) v.youtubeId = id;
  if (hasUpload) v.uploadId = uploadId;
  if (vimeoId) v.vimeoId = vimeoId;
  if (fileUrl) v.fileUrl = fileUrl;
  if (pt) { v.peertubeHost = pt.host; v.peertubeId = pt.id; }
  const questions = [];
  if (Array.isArray(content.questions)) {
    for (const q of content.questions.slice(0, MAX_VIDEO_QUESTIONS)) {
      if (!q || typeof q !== "object") continue;
      const prompt = clean(q.prompt, 1000);
      const { choices, answer } = mapChoices(q.choices, q.answer);
      if (!prompt || choices.length < 2) continue;
      const out = { prompt, choices };
      if (answer) out.answer = answer;
      const at = Number(q.atSec);
      if (Number.isFinite(at) && at >= 0) out.atSec = Math.min(86400, Math.round(at));
      questions.push(out);
    }
  }
  if (questions.length) v.questions = questions;
  return v;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  const choiceTexts = (list) => (Array.isArray(list) ? list : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (!normalize({ ...content, questions: [] })) return "video_source_required";
  const qs = Array.isArray(content.questions) ? content.questions : [];
  if (qs.length > MAX_VIDEO_QUESTIONS) return "too_many_questions";
  for (const q of qs) {
    if (!q || typeof q !== "object" || !clean(q.prompt, 1000)) return "question_incomplete";
    const texts = choiceTexts(q.choices);
    if (texts.length < 2) return "question_incomplete";
    if (texts.length > MAX_CHOICES) return "too_many_choices";
    if (!hasValue(q.answer)) return "answer_required";
    if (!mapChoices(q.choices, q.answer).answer) return "answer_invalid";
  }
  return null;
}

function strip(content) {
  const out = {
    youtubeId: content.youtubeId, uploadId: content.uploadId, vimeoId: content.vimeoId,
    fileUrl: content.fileUrl, peertubeHost: content.peertubeHost, peertubeId: content.peertubeId,
    title: content.title, note: content.note,
  };
  // Remove undefined keys so the key check is honest.
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  if (content.questions) out.questions = content.questions.map((q) => ({ prompt: q.prompt, choices: q.choices, atSec: q.atSec }));
  if (out.questions) out.questions.forEach((q) => q.atSec === undefined && delete q.atSec);
  return out;
}

function grade(item, learnerAnswer, questionIndex) {
  const qIdx = Math.max(0, Math.min(9, Number(questionIndex) || 0));
  const q = Array.isArray(item.questions) ? item.questions[qIdx] : null;
  if (!q) return null;
  const keyless = q.answer == null || String(q.answer).trim() === "";
  if (keyless || !(q.choices || []).some((c) => c.id === q.answer)) return null;
  const id = String(learnerAnswer ?? "");
  const valid = (q.choices || []).some((c) => c.id === id);
  return valid && String(q.answer) === id;
}

module.exports = { normalize, problem, strip, grade, MAX_VIDEO_QUESTIONS, MAX_CHOICES };
