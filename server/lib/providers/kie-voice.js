// SPDX-License-Identifier: AGPL-3.0-or-later
// Kie voice: Gemini 3.1 Flash TTS on kie.ai, same key as images and video.
// One bill, no GCP project. Kie prices (your discount): $0.70 per million
// input tokens, $14 per million output tokens. A chapter narration is a few
// thousand tokens, so voice stays sub cent. Loops cached in UPLOAD_DIR like
// kie images, fail soft per track, silent when not configured.
const { fetchT } = require("../http");

const KIE_BASE = "https://api.kie.ai";
const DEFAULT_VOICE_MODEL = "gemini-3.1-flash-tts";

function voiceModel() {
  return String(process.env.GOOGLE_TTS_ON_KIE || DEFAULT_VOICE_MODEL).trim() || DEFAULT_VOICE_MODEL;
}

function voiceNarratorName() {
  return String(process.env.GOOGLE_TTS_VOICE_NARRATOR || "en-US-Chirp3-HD-Achernar").trim() || "en-US-Chirp3-HD-Achernar";
}

function voiceCharacterName() {
  return String(process.env.GOOGLE_TTS_VOICE_CHARACTER || "en-US-Chirp3-HD-Schedar").trim() || "en-US-Chirp3-HD-Schedar";
}

function voiceFor(role) {
  if (role === "character") return voiceCharacterName();
  return voiceNarratorName();
}

function kieVoiceConfiguredSync() {
  const m = voiceModel();
  const key = String(process.env.KIE_API_KEY || "").trim();
  return Boolean(m && key);
}
function kieVoiceConfigured() { return kieVoiceConfiguredSync(); }

function kieVoiceStatus() {
  return {
    configured: kieVoiceConfigured(),
    model: voiceModel(),
    via: "kie",
  };
}

function checkKie(data) {
  if (data && typeof data === "object" && data.code && Number(data.code) !== 200) {
    throw new Error(`kie_${data.code}: ${String(data.msg || data.message || "business error").slice(0, 200)}`);
  }
  return data;
}

function resultUrls(d) {
  const r = (d && d.response) || {};
  for (const urls of [r.resultUrls, d && d.resultUrls]) {
    if (Array.isArray(urls) && urls.length) return urls;
  }
  for (const raw of [r.resultJson, d && d.resultJson]) {
    if (!raw) continue;
    try {
      const urls = JSON.parse(raw).resultUrls;
      if (Array.isArray(urls) && urls.length) return urls;
    } catch { /* ignore */ }
  }
  return [];
}

async function kieCreateTask(key, model, input) {
  const res = await fetchT(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input }),
  }, { timeoutMs: 60000, retries: 1 });
  if (!res.ok) throw new Error(`kie_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
  const data = checkKie(await res.json());
  const taskId = data && data.data && data.data.taskId;
  if (!taskId) throw new Error(`kie_no_task: ${JSON.stringify(data).slice(0, 200)}`);
  return String(taskId);
}

async function kiePollRaw(key, taskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetchT(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { authorization: `Bearer ${key}` },
    }, { timeoutMs: 30000, retries: 1 });
    if (!res.ok) continue;
    const info = checkKie(await res.json());
    const d = (info && info.data) || {};
    const state = String(d.state || d.status || "").toLowerCase();
    if (state.includes("succ")) return d;
    if (state.includes("fail") || state.includes("error")) {
      throw new Error(`kie_job_failed: ${String(d.failMsg || d.error || "generation failed").slice(0, 200)}`);
    }
  }
  throw new Error("kie_timeout");
}

// Generate speech on kie: input is plain text, output is an mp3 url.
// Voices are engine voices (narrator vs character); model is the kie voice model.
async function synthesizeOnKie({ text, voice }) {
  const key = String(process.env.KIE_API_KEY || "").trim();
  if (!key) throw new Error("kie_voice_not_configured");
  const model = voiceModel();
  if (!model) throw new Error("kie_voice_no_model");
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) throw new Error("kie_voice_empty_text");
  const v = String(voice || voiceNarratorName()).trim();
  // Kie Gemini TTS shape: model gemini-3.1-flash-tts, input { text, voice }.
  // If kie's schema uses different keys, the error surfaces with the 200+code
  // business check, so this stays debuggable without guessing the vendor.
  const input = { text: clean, voice: v };
  const taskId = await kieCreateTask(key, model, input);
  const d = await kiePollRaw(key, taskId, 3 * 60 * 1000);
  const urls = resultUrls(d);
  if (!urls[0]) throw new Error(`kie_voice_no_url: ${JSON.stringify(d).slice(0, 300)}`);
  const res = await fetchT(urls[0], {}, { timeoutMs: 30000, retries: 1 }).catch(() => null);
  if (!res || !res.ok) return { url: urls[0] };
  const buf = Buffer.from(await res.arrayBuffer());
  return { url: urls[0], buffer: buf };
}

async function fetchAudioBuffer(url) {
  const res = await fetchT(url, {}, { timeoutMs: 30000, retries: 1 });
  if (!res.ok) throw new Error(`kie_voice_fetch_${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  voiceModel,
  voiceFor,
  voiceNarratorName,
  voiceCharacterName,
  kieVoiceConfigured,
  kieVoiceStatus,
  synthesizeOnKie,
  fetchAudioBuffer,
};
