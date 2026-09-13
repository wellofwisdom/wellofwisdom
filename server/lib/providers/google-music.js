// SPDX-License-Identifier: AGPL-3.0-or-later
// Vertex Lyria music adapter. Shares GCP auth with Cloud TTS: no new key,
// same project. Loops are cached as audio files in UPLOAD_DIR at /media/:id,
// same as TTS. The world stays silent when not configured, never throws in
// normal flows. Cost per second, per chapter, fail soft per track.

const { fetchT } = require("../http");

function musicConfigured() {
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const location = String(process.env.GOOGLE_CLOUD_LOCATION || "us-central1").trim();
  if (!project || !location) return false;
  // Auth is either GOOGLE_TTS_API_KEY or GOOGLE_APPLICATION_CREDENTIALS; reuse TTS check.
  try {
    const tts = require("./google-tts");
    return tts.ttsConfigured() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } catch {
    return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
}

function musicModel() {
  return String(process.env.VERTEX_MUSIC_MODEL || "lyria-002").trim() || "lyria-002";
}

function musicStatus() {
  return {
    configured: musicConfigured(),
    project: String(process.env.GOOGLE_CLOUD_PROJECT || "").trim() || null,
    location: String(process.env.GOOGLE_CLOUD_LOCATION || "us-central1").trim(),
    model: musicModel(),
  };
}

function moodPrompt(chapter, mood) {
  const title = String((chapter && chapter.title) || "adventure").slice(0, 80);
  const hook = String((chapter && chapter.hook) || "").slice(0, 160);
  const moods = {
    calm: "gentle, curious, warm acoustic loop",
    tension: "tense, rhythmic, low strings loop",
    boss: "epic, driving, percussive loop with choir hit",
    victory: "bright, triumphant, uplifting loop",
  };
  const moodLine = moods[mood] || moods.calm;
  return `Instrumental game music loop. ${moodLine}. For chapter "${title}"${hook ? `: ${hook}` : ""}. 12 seconds, seamless loop, no vocals, no drums dominating, classroom friendly, 90-110 bpm.`;
}

// Vertex Lyria endpoint shape (preview, subject to change). The app calls this
// via the standard Vertex AI predict path; the response is handled leniently so
// a model change does not crash the caller. Actual wiring is finished when GCP
// credentials are on the box; until then this returns a not-configured error and
// the UI stays silent, which is correct.
async function generateMusicLoop({ chapter, mood, durationSec }) {
  if (!musicConfigured()) throw new Error("music_not_configured");
  const prompt = moodPrompt(chapter, mood);
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || "").trim();
  const location = String(process.env.GOOGLE_CLOUD_LOCATION || "us-central1").trim();
  const model = musicModel();
  const dur = Math.max(4, Math.min(24, Number(durationSec) || 12));
  // When a service account is present, the host would normally mint an access
  // token. For now, if only an API key is present we cannot call Vertex (it
  // needs OAuth), so fail soft and let the UI stay silent.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("music_needs_service_account: set GOOGLE_APPLICATION_CREDENTIALS to a Vertex-authorized service account");
  }
  // Attempt Vertex predict. This is the documented shape for Lyria preview.
  const base = `https://${location}-aiplatform.googleapis.com`;
  const url = `${base}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predict`;
  const token = await gcpAccessToken();
  const res = await fetchT(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt, duration: dur }], parameters: {} }),
  }, { timeoutMs: 120000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 400);
    throw new Error(`music_http_${res.status}: ${t}`);
  }
  const data = await res.json().catch(() => null);
  // Lyria preview returns predictions[].bytesBase64Encoded or similar. Handle leniently.
  const pred = data && data.predictions && data.predictions[0];
  const b64 = pred && (pred.bytesBase64Encoded || pred.audioContent || pred.audio);
  if (!b64) throw new Error(`music_no_audio: ${JSON.stringify(data).slice(0, 300)}`);
  return Buffer.from(String(b64), "base64");
}

async function gcpAccessToken() {
  // Prefer the host's gcloud-credential helper when available, otherwise try
  // GOOGLE_APPLICATION_CREDENTIALS directly via google-auth-library if installed.
  // Fail with a clear message if neither is present: the UI degrades to silent.
  const keyPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!keyPath) throw new Error("music_no_credentials");
  try {
    const { GoogleAuth } = require("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const tok = await client.getAccessToken();
    if (tok && tok.token) return tok.token;
    throw new Error("no token");
  } catch (e) {
    throw new Error(`music_auth_failed: ${String(e.message || e).slice(0, 200)}`);
  }
}

module.exports = { musicConfigured, musicStatus, musicModel, moodPrompt, generateMusicLoop };
