// SPDX-License-Identifier: AGPL-3.0-or-later
// AI media engine: images + videos. Providers configured in Settings → AI
// Media (server_settings) with env fallback. kie.ai speaks OpenAI-compatible
// image endpoints and wraps business errors in HTTP 200 + code != 200 —
// BOTH layers are checked (hard-won production lesson).
const db = require("./db");
const { fetchT } = require("./http");

const KIE_BASE = "https://api.kie.ai/v1";

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
      imageModel: "google/nano-banana", imageQuality: "high",
      videoProvider: "kie", videoModel: "bytedance/seedance-2",
      videoResolution: "720p", videoDuration: 5,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return { imageProvider: "openai", openaiKey: process.env.OPENAI_API_KEY, imageModel: "gpt-image-1", imageQuality: "high" };
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

async function status() {
  const cfg = await resolveConfig();
  const canImage = Boolean(cfg && ((cfg.imageProvider === "kie" && cfg.kieKey) || (cfg.imageProvider === "openai" && cfg.openaiKey)));
  const canVideo = Boolean(cfg && cfg.videoProvider === "kie" && cfg.kieKey);
  return {
    configured: canImage || canVideo,
    canImage,
    canVideo,
    imageProvider: cfg ? cfg.imageProvider : null,
    videoProvider: cfg ? cfg.videoProvider : null,
    source: cfg && cfg._fromDb ? "settings" : "env",
  };
}

function checkKieBusinessLayer(data) {
  // kie wraps failures in HTTP 200: {"code": <nonzero>, "msg": ...}
  if (data && typeof data === "object" && data.code && Number(data.code) !== 200) {
    throw new Error(`kie_${data.code}: ${String(data.msg || data.message || "business error").slice(0, 200)}`);
  }
  return data;
}

/** Generate an image. Returns {url}. Sizes: 1024x1024 | 1536x1024 | 1024x1536. */
async function generateImage({ prompt, size, refType, refId, purpose, familyId, userId }) {
  const cfg = await resolveConfig();
  if (!cfg) throw new Error("media_not_configured");
  const model = cfg.imageModel || "google/nano-banana";
  let url = null;

  if (cfg.imageProvider === "kie" && cfg.kieKey) {
    const res = await fetchT(`${KIE_BASE}/images`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.kieKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: String(prompt).slice(0, 2000), size: size || "1024x1024", n: 1 }),
    }, { timeoutMs: 120000, retries: 1 });
    if (!res.ok) throw new Error(`kie_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
    const data = checkKieBusinessLayer(await res.json());
    url = data && data.data && data.data[0] && (data.data[0].url || data.data[0].b64_json);
    if (url && url.length > 200 && url.startsWith("data:") === false && url.length > 100000) {
      // some providers return raw base64 without the data: prefix
      url = `data:image/png;base64,${url}`;
    }
  } else if (cfg.imageProvider === "openai" && cfg.openaiKey) {
    const res = await fetchT("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.openaiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: String(prompt).slice(0, 2000), size: size || "1024x1024", quality: cfg.imageQuality || "high", n: 1 }),
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

/** Start a kie.ai video task. Returns {taskId}. */
async function startVideo({ prompt, duration, resolution }) {
  const cfg = await resolveConfig();
  if (!cfg || !cfg.kieKey) throw new Error("video_not_configured");
  const model = cfg.videoModel || "bytedance/seedance-2";
  const res = await fetchT(`${KIE_BASE}/videos`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.kieKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: String(prompt).slice(0, 2000),
      duration: Math.min(15, Math.max(4, Number(duration) || 5)),
      resolution: resolution || cfg.videoResolution || "720p",
    }),
  }, { timeoutMs: 60000, retries: 1 });
  if (!res.ok) throw new Error(`kie_http_${res.status}: ${String(await res.text()).slice(0, 300)}`);
  const data = checkKieBusinessLayer(await res.json());
  const taskId = data && (data.id || data.taskId || (data.data && data.data.id));
  if (!taskId) throw new Error(`video_no_task: ${JSON.stringify(data).slice(0, 200)}`);
  return { taskId: String(taskId) };
}

/** Poll a video task. Returns {status, url?} (succeeded|failed|processing). */
async function pollVideo(taskId) {
  const cfg = await resolveConfig();
  if (!cfg || !cfg.kieKey) throw new Error("video_not_configured");
  const res = await fetchT(`${KIE_BASE}/videos/${taskId}`, {
    headers: { authorization: `Bearer ${cfg.kieKey}` },
  }, { timeoutMs: 30000, retries: 1 });
  if (!res.ok) throw new Error(`kie_http_${res.status}`);
  const raw = await res.json();
  const data = raw && raw.data ? raw.data : raw;
  const statusStr = String((data && (data.status || data.state)) || "").toLowerCase();
  const url = data && (data.videoUrl || data.url || (data.output && data.output.url));
  if (statusStr.includes("succ")) return { status: "succeeded", url };
  if (statusStr.includes("fail") || statusStr.includes("error")) {
    return { status: "failed", error: String((data && (data.error || data.failReason)) || "generation failed").slice(0, 300) };
  }
  return { status: "processing" };
}

/** Full video generation with polling (runs inside a job). */
async function generateVideo({ prompt, duration, resolution, refType, refId, purpose, familyId, userId }) {
  const cfg = await resolveConfig();
  const { taskId } = await startVideo({ prompt, duration, resolution });
  const deadline = Date.now() + 10 * 60 * 1000; // 10 min cap
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const r = await pollVideo(taskId);
    if (r.status === "succeeded" && r.url) {
      if (db.configured()) {
        await db.query(
          `insert into media_assets (family_id, kind, purpose, ref_type, ref_id, url, provider, model, prompt, meta, created_by)
           values ($1,'video',$2,$3,$4,$5,'kie',$6,$7,$8,$9)`,
          [familyId || null, purpose || "cutscene", refType || "misc", refId || null, r.url,
            cfg.videoModel, String(prompt).slice(0, 1000), JSON.stringify({ taskId }), userId || null]
        ).catch(() => {});
      }
      return { url: r.url };
    }
    if (r.status === "failed") throw new Error(`video_failed: ${r.error}`);
  }
  throw new Error("video_timeout");
}

module.exports = { generateImage, generateVideo, startVideo, pollVideo, status, resolveConfig, invalidateCache, IMAGE_MODELS, VIDEO_MODELS };
