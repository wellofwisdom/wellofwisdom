// SPDX-License-Identifier: AGPL-3.0-or-later
// Google Cloud Text-to-Speech adapter. Same GCP auth posture as the rest of
// the immersive stack: either an API key (GOOGLE_TTS_API_KEY) or a service
// account via GOOGLE_APPLICATION_CREDENTIALS. No new table, no new upload
// kind: the audio file is cached in UPLOAD_DIR as uploads.storageKey and
// served from /media/:id/audio, just like a video. Degrades to browser TTS
// when not configured, never throws in the caller.

const { fetchT } = require("../http");

const TTS_BASE = "https://texttospeech.googleapis.com";

function ttsKey() {
  return String(process.env.GOOGLE_TTS_API_KEY || "").trim();
}

function ttsConfigured() {
  if (ttsKey()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && String(process.env.GOOGLE_APPLICATION_CREDENTIALS).trim()) return true;
  if (process.env.GOOGLE_CLOUD_PROJECT && String(process.env.GOOGLE_CLOUD_PROJECT).trim() && !ttsKey()) return false;
  return false;
}

function ttsStatus() {
  const key = ttsKey();
  return {
    configured: ttsConfigured(),
    via: key ? "api_key" : (process.env.GOOGLE_APPLICATION_CREDENTIALS ? "service_account" : null),
  };
}

// Minimal voice picker: narrator vs character. Voices are named in env so a
// family can swap them without a code change.
function voiceFor(role) {
  if (role === "narrator") return String(process.env.GOOGLE_TTS_VOICE_NARRATOR || "en-US-Chirp3-HD-Achernar").trim() || "en-US-Chirp3-HD-Achernar";
  return String(process.env.GOOGLE_TTS_VOICE_CHARACTER || "en-US-Chirp3-HD-Schedar").trim() || "en-US-Chirp3-HD-Schedar";
}

function ssmlEscape(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function toSsml(text, opts) {
  const lang = String(opts && opts.lang || "en-US");
  const body = ssmlEscape(String(text || "").slice(0, 4000));
  // Keep SSML simple: no prosody nesting, just the text. The audio is a
  // narration helper, not a dramatic performance.
  return `<speak xml:lang="${lang}">${body}</speak>`;
}

async function synthesize({ text, voice, lang, speakingRate, pitch }) {
  const key = ttsKey();
  if (!key) throw new Error("tts_not_configured");
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) throw new Error("tts_empty_text");
  const voiceName = voice || voiceFor("narrator");
  const body = {
    input: { ssml: toSsml(clean, { lang }) },
    voice: { languageCode: lang || "en-US", name: voiceName },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: speakingRate != null ? Number(speakingRate) : 1.0,
      pitch: pitch != null ? Number(pitch) : 0,
    },
  };
  const url = `${TTS_BASE}/v1/text:synthesize?key=${encodeURIComponent(key)}`;
  const res = await fetchT(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, { timeoutMs: 60000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 400);
    throw new Error(`tts_http_${res.status}: ${t}`);
  }
  const data = await res.json().catch(() => null);
  const b64 = data && data.audioContent;
  if (!b64) throw new Error("tts_no_audio");
  return Buffer.from(String(b64), "base64");
}

module.exports = { ttsConfigured, ttsStatus, ttsKey, synthesize, voiceFor, toSsml };
