// SPDX-License-Identifier: AGPL-3.0-or-later
// Piper sidecar TTS: the offline voice tier. docker compose --profile
// offline-voice brings up Piper's HTTP server (piper-tts 1.8.0) next to the
// app, and TTS_BASE_URL points here, at it. Local, keyless, no audio leaves
// the box: the same posture the whisper sidecar gives speech input.
//
// Contract, verified against the pinned pip package (piper-tts 1.8.0,
// src/piper/http_server.py) and mirrored by the compose service definition:
//   POST /synthesize  {"text": "...", "voice": "..."}   -> 200, WAV file body
//   GET  /info        -> JSON about the loaded voice (compose healthcheck)
// The voice field is optional and unknown names are answered with the loaded
// default, so passing a cloud voice name through is safe, just ignored.
const { fetchT } = require("../http");

function baseUrl() {
  return String(process.env.TTS_BASE_URL || "").trim().replace(/\/+$/, "");
}

function configured() {
  return Boolean(baseUrl());
}

// A real WAV starts with "RIFF" and carries "WAVE" at bytes 8..12. Piper
// errors are HTML (Flask's 500 page) or JSON behind a 200 from a proxy, and
// neither plays; sniff the payload rather than trusting the status alone.
function looksLikeWav(buf) {
  return Boolean(buf) && buf.length >= 12
    && buf.toString("latin1", 0, 4) === "RIFF"
    && buf.toString("latin1", 8, 12) === "WAVE";
}

/**
 * Synthesize one line against the sidecar. Returns { buffer, mime } with the
 * raw WAV bytes; the caller decides storage. Throws piper_* errors so a
 * caller's ladder can fall through exactly like a cloud provider failure.
 */
async function synthesize({ text, voice }) {
  const base = baseUrl();
  if (!base) throw new Error("piper_not_configured");
  const clean = String(text || "").trim().slice(0, 4000);
  if (!clean) throw new Error("piper_empty_text");
  const body = { text: clean };
  const v = String(voice || "").trim();
  if (v) body.voice = v.slice(0, 120);
  const res = await fetchT(`${base}/synthesize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, { timeoutMs: 60000, retries: 1 });
  if (!res.ok) throw new Error(`piper_http_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!looksLikeWav(buf)) throw new Error("piper_bad_audio");
  return { buffer: buf, mime: "audio/wav" };
}

function status() {
  return { configured: configured(), via: "piper" };
}

module.exports = { baseUrl, configured, synthesize, status, looksLikeWav };
