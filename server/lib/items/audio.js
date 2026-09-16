// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));

function isLocalMediaUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(t);
}

function normalize(content) {
  const title = clean(content.title, 300) || "Listen";
  const transcript = str(content.transcript, 8000) || clean(content.text, 8000) || str(content.body, 8000) || "";
  const uploadId = Number(content.uploadId);
  const hasUpload = Number.isInteger(uploadId) && uploadId > 0;
  const localUrl = isLocalMediaUrl(content.audioUrl) ? content.audioUrl.trim().slice(0, 500) : null;
  const altUrl = isLocalMediaUrl(content.url) ? content.url.trim().slice(0, 500) : null;
  const finalUrl = localUrl || altUrl || null;
  if (!hasUpload && !finalUrl && !transcript) return null;
  const out = { title, transcript: transcript.slice(0, 8000) };
  if (hasUpload) out.uploadId = uploadId;
  if (finalUrl) out.audioUrl = finalUrl;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  const rawAudioUrl = typeof content.audioUrl === "string" ? content.audioUrl.trim() : "";
  const rawUrl = typeof content.url === "string" ? content.url.trim() : "";
  if (rawAudioUrl && !isLocalMediaUrl(rawAudioUrl)) return "audio_source_required";
  if (rawUrl && !isLocalMediaUrl(rawUrl)) return "audio_source_required";
  const a = normalize(content);
  if (!a) return "audio_source_required";
  if (!a.transcript || !a.transcript.trim()) return "audio_transcript_required";
  return null;
}

function strip(content) {
  const out = { title: content.title, transcript: content.transcript };
  if (content.uploadId) out.uploadId = content.uploadId;
  if (content.audioUrl) out.audioUrl = content.audioUrl;
  return out;
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade, isLocalMediaUrl };
