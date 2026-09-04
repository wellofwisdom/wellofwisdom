// SPDX-License-Identifier: AGPL-3.0-or-later
// AI media engine: images + videos via kie.ai's jobs API (createTask ->
// recordInfo polling). Also supports OpenAI images directly. Configured in
// Settings → AI Media (server_settings) with env fallback. kie wraps
// business errors in HTTP 200 + code != 200. BOTH layers checked.
const db = require("./db");
const { fetchT } = require("./http");

const KIE_BASE = "https://api.kie.ai";

const IMAGE_MODELS = [
  { id: "google/nano-banana", label: "Nano Banana (Google, via kie.ai)", provider: "kie" },
  { id: "gpt-image-1", label: "OpenAI GPT Image", provider: "openai" },
];
const VIDEO_MODELS = [
  { id: "bytedance/seedance-2-5", label: "Seedance 2.5 (kie.ai)" },
  { id: "bytedance/seedance-2", label: "Seedance 2 (kie.ai)" },
  { id: "veo-3-1", label: "Veo 3.1 (kie.ai)" },
];

let cache = { at: 0, config: null };

function fromEnv() {
  if (process.env.KIE_API_KEY) {
    return {
      imageProvider: "kie", kieKey: process.env.KIE_API_KEY,
      imageModel: "google/nano-banana",
      videoProvider: "kie", videoModel: "bytedance/seedance-2",
      videoResolution: "720p",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return { imageProvider: "openai", openaiKey: process.env.OPENAI_API_KEY, imageModel: "gpt-image-1" };
  }
  return null;
}

async function resolveConfig() {
  if (cache.config && Date.now() - cache.at < 60000) return cache.config;
  let cfg = fromEnv();
  if (db.configured()) {
    const row = await db.query("select value from server_settings where key = 'media'").catch(() => ({ rows: [] }));
    const stored = row.rows[0] && row.rows[0].value;
    if (stored && (stored.kieKey || stored.openaiKey)) cfg = { ...cfg, ...stored, _fromDb: true };
  }
  cache = { at: Date.now(), config: cfg };
  return cfg;
}

function invalidateCache() {
  cache = { at: 0, config: null };
}

// Speech-to-text for auto-captions runs on kie.ai, same key and credits as
// image and video generation. The model is ElevenLabs Scribe
// (elevenlabs/speech-to-text), which reads a video file directly and returns
// word-level timings we turn into WebVTT. Override the model with STT_MODEL if
// kie ever adds a better one.
const STT_MODEL = process.env.STT_MODEL || "elevenlabs/speech-to-text";

async function status() {
  const cfg = await resolveConfig();
  const canImage = Boolean(cfg && ((cfg.imageProvider === "kie" && cfg.kieKey) || (cfg.imageProvider === "openai" && cfg.openaiKey)));
  const canVideo = Boolean(cfg && cfg.videoProvider === "kie" && cfg.kieKey);
  const canCaption = Boolean(cfg && cfg.kieKey);
  return {
    configured: canImage || canVideo || canCaption,
    canImage,
    canVideo,
    canCaption,
    imageProvider: cfg ? cfg.imageProvider : null,
    videoProvider: cfg ? cfg.videoProvider : null,
    source: cfg && cfg._fromDb ? "settings" : "env",
  };
}

function checkKie(data) {
  if (data && typeof data === "object" && data.code && Number(data.code) !== 200) {
    throw new Error(`kie_${data.code}: ${String(data.msg || data.message || "business error").slice(0, 200)}`);
  }
  return data;
}

// ---------- kie.ai jobs API helpers ----------

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

// Pull result URLs out of a finished recordInfo payload. kie is inconsistent
// about where they land: some models nest them under `response`, others put
// `resultJson` (a JSON *string*) at the top level. Check every shape.
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
    } catch { /* not JSON. Try the next shape */ }
  }
  return [];
}

// Poll until a task finishes and return the raw recordInfo data object. The
// URL-returning callers wrap this; the transcription path needs the payload.
async function kiePollRaw(key, taskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetchT(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { authorization: `Bearer ${key}` },
    }, { timeoutMs: 30000, retries: 1 });
    if (!res.ok) continue; // transient poll error
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

async function kiePollTask(key, taskId, timeoutMs) {
  const d = await kiePollRaw(key, taskId, timeoutMs);
  return { ok: true, urls: resultUrls(d) };
}

// ---------- public API ----------

async function generateImage({ prompt, size, purpose, refType, refId, familyId, userId }) {
  const cfg = await resolveConfig();
  if (!cfg) throw new Error("media_not_configured");
  const model = cfg.imageModel || "google/nano-banana";
  let url = null;

  if (cfg.imageProvider === "kie" && cfg.kieKey) {
    const taskId = await kieCreateTask(cfg.kieKey, model, {
      prompt: String(prompt).slice(0, 2000),
      size: size || "1024x1024",
    });
    const r = await kiePollTask(cfg.kieKey, taskId, 3 * 60 * 1000);
    if (!r.urls || !r.urls[0]) throw new Error(`kie_no_result_urls: ${JSON.stringify(r).slice(0, 200)}`);
    url = r.urls[0];
  } else if (cfg.imageProvider === "openai" && cfg.openaiKey) {
    const res = await fetchT("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.openaiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: String(prompt).slice(0, 2000), size: size || "1024x1024", n: 1 }),
    }, { timeoutMs: 120000, retries: 1 });
    if (!res.ok) throw new Error(`openai_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const item = data && data.data && data.data[0];
    url = item && (item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null));
  } else {
    throw new Error("media_not_configured");
  }
  if (!url) throw new Error("media_no_url_returned");

  if (db.configured()) {
    await db.query(
      `insert into media_assets (family_id, kind, purpose, ref_type, ref_id, url, provider, model, prompt, created_by)
       values ($1,'image',$2,$3,$4,$5,$6,$7,$8,$9)`,
      [familyId || null, purpose || "general", refType || "misc", refId || null, url,
        cfg.imageProvider, model, String(prompt).slice(0, 1000), userId || null]
    ).catch(() => {});
  }
  return { url };
}

async function generateVideo({ prompt, duration, resolution, purpose, refType, refId, familyId, userId }) {
  const cfg = await resolveConfig();
  if (!cfg || !cfg.kieKey) throw new Error("video_not_configured");
  const model = cfg.videoModel || "bytedance/seedance-2";
  const taskId = await kieCreateTask(cfg.kieKey, model, {
    prompt: String(prompt).slice(0, 2000),
    duration: Math.min(15, Math.max(4, Number(duration) || 5)),
    resolution: resolution || cfg.videoResolution || "720p",
    ratio: "16:9",
  });
  const r = await kiePollTask(cfg.kieKey, taskId, 10 * 60 * 1000);
  if (!r.urls || !r.urls[0]) throw new Error(`video_no_url: ${JSON.stringify(r).slice(0, 200)}`);
  const url = r.urls[0];

  if (db.configured()) {
    await db.query(
      `insert into media_assets (family_id, kind, purpose, ref_type, ref_id, url, provider, model, prompt, created_by)
       values ($1,'video',$2,$3,$4,$5,'kie',$6,$7,$8,$9)`,
      [familyId || null, purpose || "cutscene", refType || "misc", refId || null, url,
        model, String(prompt).slice(0, 1000), userId || null]
    ).catch(() => {});
  }
  return { url };
}

// ---------- transcription (auto-captions) ----------

// Push a local file to kie's temporary store (auto-deleted after 3 days) and
// return a URL kie's own workers can fetch. Our uploads are private, so we
// cannot just hand kie a /media/:id link; this keeps the file off the public
// web while still letting the model read it.
async function kieUploadFile(key, buffer, filename, mime) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "application/octet-stream" }), filename || "upload");
  form.append("uploadPath", "wow-captions");
  const res = await fetchT(`${KIE_BASE}/api/file-stream-upload`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  }, { timeoutMs: 4 * 60 * 1000, retries: 1 });
  if (!res.ok) throw new Error(`kie_upload_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
  const data = checkKie(await res.json());
  const url = data && data.data && (data.data.downloadUrl || data.data.fileUrl);
  if (!url) throw new Error(`kie_upload_no_url: ${JSON.stringify(data).slice(0, 200)}`);
  return url;
}

// A finished Scribe job carries the ElevenLabs response (text + words) as an
// object, or as a resultJson string, or nested under response. Find the words.
function transcriptFrom(d) {
  const seen = [];
  const r = (d && d.response) || {};
  seen.push(r, d);
  for (const raw of [r.resultJson, d && d.resultJson]) {
    if (raw && typeof raw === "string") { try { seen.push(JSON.parse(raw)); } catch { /* not json */ } }
  }
  for (const c of seen) {
    if (c && Array.isArray(c.words) && c.words.length) return { words: c.words, text: c.text || "" };
  }
  for (const c of seen) {
    if (c && typeof c.text === "string" && c.text.trim()) return { words: null, text: c.text };
  }
  return null;
}

function secToTs(s) {
  const t = Math.max(0, Number(s) || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(m)}:${p2(sec)}.${String(ms).padStart(3, "0")}`;
}

// Turn ElevenLabs word timings into readable WebVTT cues. Words are grouped
// into a cue until it runs long, gets wide, or a sentence ends. "spacing"
// entries are the whitespace between words; "audio_event" entries (laughter and
// the like) are kept as text.
function wordsToVtt(words, maxDur = 6, maxChars = 84) {
  const cues = [];
  let cur = null;
  const flush = () => { if (cur && cur.text.trim()) cues.push(cur); cur = null; };
  for (const w of words || []) {
    const type = w.type || "word";
    const text = String(w.text == null ? "" : w.text);
    if (type === "spacing") { if (cur) cur.text += text; continue; }
    const start = Number(w.start);
    const end = Number(w.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) { if (cur) cur.text += text; continue; }
    if (!cur) cur = { start, end, text };
    else { cur.text += text; cur.end = end; }
    const endsSentence = /[.!?]["')\]]?\s*$/.test(cur.text);
    if (cur.end - cur.start >= maxDur || cur.text.length >= maxChars || endsSentence) flush();
  }
  flush();
  if (!cues.length) return null;
  let out = "WEBVTT\n\n";
  cues.forEach((c, i) => {
    out += `${i + 1}\n${secToTs(c.start)} --> ${secToTs(c.end)}\n${c.text.trim()}\n\n`;
  });
  return out.trimEnd();
}

// Transcribe an audio or video buffer to WebVTT via kie.ai (ElevenLabs Scribe).
// Upload the file, create the task, poll, then build cues from the word timings.
// The size ceiling is enforced by the caller before we get here.
async function transcribe({ buffer, filename, mime, language }) {
  const cfg = await resolveConfig();
  const key = cfg && cfg.kieKey;
  if (!key) throw new Error("stt_not_configured");
  if (!buffer || !buffer.length) throw new Error("stt_empty_file");

  const audioUrl = await kieUploadFile(key, buffer, filename, mime);
  const input = { audio_url: audioUrl };
  if (language) input.language_code = String(language).slice(0, 8);

  const taskId = await kieCreateTask(key, STT_MODEL, input);
  const d = await kiePollRaw(key, taskId, 8 * 60 * 1000);

  const tr = transcriptFrom(d);
  if (tr && tr.words) {
    const vtt = wordsToVtt(tr.words);
    if (vtt) return vtt;
  }
  if (tr && tr.text && tr.text.trim()) {
    // No usable timings: fall back to one caption spanning the whole clip.
    return `WEBVTT\n\n00:00:00.000 --> 00:59:59.000\n${tr.text.trim().slice(0, 4000)}`;
  }
  // Last resort: some models hand back a URL to a subtitle file.
  const urls = resultUrls(d);
  if (urls[0]) {
    const res = await fetchT(urls[0], {}, { timeoutMs: 30000, retries: 1 }).catch(() => null);
    if (res && res.ok) {
      const text = await res.text();
      if (text && text.includes("-->")) return text;
    }
  }
  throw new Error(`stt_no_transcript: ${JSON.stringify(d).slice(0, 200)}`);
}

module.exports = {
  generateImage, generateVideo, transcribe, status, resolveConfig, invalidateCache,
  resultUrls, wordsToVtt, secToTs, transcriptFrom, IMAGE_MODELS, VIDEO_MODELS,
};
