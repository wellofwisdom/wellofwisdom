// SPDX-License-Identifier: AGPL-3.0-or-later
// Speech input: transcribe a short recorded answer through any OpenAI
// compatible /v1/audio/transcriptions endpoint. Groq, OpenAI, DeepInfra and a
// self-hosted faster-whisper all speak this shape, so one adapter covers the
// cloud and the box in the corner, and the family picks with STT_BASE_URL.
//
// The provider is deliberately separate from the captions path in media.js:
// captions read a whole video on kie, this reads a child's answer and has to
// be cheap, fast and switchable on its own.
//
// No audio is written anywhere here. The route decides whether to keep a
// recording, and only when the family asked for it.
const { fetchT } = require("../http");
const aiConfig = require("../aiConfig");

// OpenAI's own name. Groq wants whisper-large-v3(-turbo), DeepInfra wants
// openai/whisper-large-v3. Set STT_MODEL or the vault's model for yours.
const DEFAULT_MODEL = "whisper-1";

function originOf(url) {
  try {
    return new URL(String(url || "")).origin;
  } catch {
    return "";
  }
}

/**
 * Where speech input is configured, vault first then env. A base URL is what
 * turns it on: without one there is no endpoint to post to, and the UI hides
 * the microphone rather than failing on the first press.
 */
async function resolve() {
  let cfg = null;
  try {
    cfg = await aiConfig.resolveConfig();
  } catch {
    cfg = null;
  }
  const baseUrl = String((cfg && cfg.sttBaseUrl) || process.env.STT_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const model = String((cfg && cfg.sttModel) || process.env.STT_MODEL || "").trim() || (baseUrl ? DEFAULT_MODEL : "");
  let apiKey = String((cfg && cfg.sttApiKey) || process.env.STT_API_KEY || "").trim();
  // Same host as the main AI endpoint: one key covers both, no second entry.
  // A different host never reuses the key, so an Anthropic or DeepSeek key
  // cannot be handed to somebody else's endpoint.
  if (!apiKey && baseUrl) {
    const aiBase = String((cfg && cfg.aiBaseUrl) || process.env.AI_BASE_URL || "").trim();
    if (aiBase && originOf(aiBase) === originOf(baseUrl)) {
      apiKey = String((cfg && cfg.aiApiKey) || process.env.AI_API_KEY || "").trim();
    }
  }
  return { baseUrl, model, apiKey, provider: "openai" };
}

/** Cheap env-only check, for callers that cannot await. */
function configured() {
  return Boolean(String(process.env.STT_BASE_URL || "").trim());
}

async function status() {
  const cfg = await resolve();
  return { configured: Boolean(cfg.baseUrl), provider: "openai", model: cfg.model || null };
}

function buildForm({ buffer, mime, filename, model, language, verbose }) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "audio/webm" }), filename || "answer.webm");
  form.append("model", model);
  if (language) form.append("language", String(language).slice(0, 12));
  form.append("response_format", verbose ? "verbose_json" : "json");
  return form;
}

function post(baseUrl, apiKey, form) {
  return fetchT(
    `${baseUrl}/audio/transcriptions`,
    {
      method: "POST",
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      body: form,
    },
    { timeoutMs: 120000, retries: 1 }
  );
}

/**
 * A confidence in 0..1, or null. Whisper does not report one, so it is read
 * from the segment log-probabilities when the endpoint returns them
 * (exp of the mean log-prob per token). An endpoint that reports nothing gets
 * null rather than a made up number.
 */
function confidenceFrom(data) {
  if (!data) return null;
  const direct = Number(data.confidence);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(1, direct));
  const segs = Array.isArray(data.segments) ? data.segments : [];
  const probs = segs.map((s) => Number(s && s.avg_logprob)).filter((n) => Number.isFinite(n));
  if (!probs.length) return null;
  const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
  return Number(Math.max(0, Math.min(1, Math.exp(mean))).toFixed(3));
}

/**
 * Transcribe a recorded answer. Returns { text, language, confidence, model,
 * durationSec }. Throws stt_not_configured, stt_no_speech or stt_http_<status>
 * so the route can answer with a code the client understands.
 */
async function transcribe({ buffer, mime, filename, language }) {
  const cfg = await resolve();
  if (!cfg.baseUrl) throw new Error("stt_not_configured: set STT_BASE_URL or the speech card in the AI vault");
  if (!buffer || !buffer.length) throw new Error("stt_empty_audio");

  let res = await post(cfg.baseUrl, cfg.apiKey, buildForm({ buffer, mime, filename, model: cfg.model, language, verbose: true }));
  // Not every OpenAI-compatible endpoint implements verbose_json. A 400 or
  // 422 there is about the response format, not the audio, so ask again for
  // the plain shape instead of failing a child's answer.
  if (res.status === 400 || res.status === 422) {
    res = await post(cfg.baseUrl, cfg.apiKey, buildForm({ buffer, mime, filename, model: cfg.model, language, verbose: false }));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`stt_http_${res.status}: ${String(body).slice(0, 300)}`);
  }
  const data = await res.json().catch(() => null);
  const text = String((data && (data.text || data.transcript)) || "").trim();
  if (!text) throw new Error("stt_no_speech: nothing was recognised in the recording");
  return {
    text,
    language: (data && data.language) || language || null,
    confidence: confidenceFrom(data),
    model: cfg.model,
    durationSec: Number((data && data.duration) || 0) || null,
  };
}

module.exports = { transcribe, status, configured, resolve, confidenceFrom, DEFAULT_MODEL };
