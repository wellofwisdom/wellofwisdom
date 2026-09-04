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

// Speech-to-text config for auto-captions. Any OpenAI-compatible
// /audio/transcriptions endpoint works (OpenAI Whisper, Groq, a local server).
// It lives in the same media settings and falls back to env, so auto-captions
// stay inert until a key is set: nothing here spends money by surprise.
function sttFrom(cfg) {
  const key = (cfg && cfg.sttKey) || process.env.STT_API_KEY || process.env.OPENAI_API_KEY || null;
  if (!key) return null;
  return {
    key,
    baseUrl: (cfg && cfg.sttBaseUrl) || process.env.STT_BASE_URL || "https://api.openai.com/v1",
    model: (cfg && cfg.sttModel) || process.env.STT_MODEL || "whisper-1",
  };
}

async function status() {
  const cfg = await resolveConfig();
  const canImage = Boolean(cfg && ((cfg.imageProvider === "kie" && cfg.kieKey) || (cfg.imageProvider === "openai" && cfg.openaiKey)));
  const canVideo = Boolean(cfg && cfg.videoProvider === "kie" && cfg.kieKey);
  const canCaption = Boolean(sttFrom(cfg));
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

async function kiePollTask(key, taskId, timeoutMs) {
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
    if (state.includes("succ")) {
      return { ok: true, urls: resultUrls(d) };
    }
    if (state.includes("fail") || state.includes("error")) {
      throw new Error(`kie_job_failed: ${String(d.failMsg || d.error || "generation failed").slice(0, 200)}`);
    }
  }
  throw new Error("kie_timeout");
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

// Transcribe an audio or video buffer to WebVTT. Sends the file straight to an
// OpenAI-compatible /audio/transcriptions endpoint with response_format=vtt, so
// the provider does the cue timing and we store what comes back. The 25 MB-ish
// ceiling on most providers is enforced by the caller before we get here.
async function transcribe({ buffer, filename, mime, language }) {
  const cfg = await resolveConfig();
  const stt = sttFrom(cfg);
  if (!stt) throw new Error("stt_not_configured");
  if (!buffer || !buffer.length) throw new Error("stt_empty_file");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime || "application/octet-stream" }), filename || "audio");
  form.append("model", stt.model);
  form.append("response_format", "vtt");
  if (language) form.append("language", String(language).slice(0, 12));

  const res = await fetchT(`${String(stt.baseUrl).replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${stt.key}` },
    body: form,
  }, { timeoutMs: 5 * 60 * 1000, retries: 1 });
  if (!res.ok) throw new Error(`stt_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
  return await res.text();
}

module.exports = { generateImage, generateVideo, transcribe, status, resolveConfig, invalidateCache, resultUrls, IMAGE_MODELS, VIDEO_MODELS };
