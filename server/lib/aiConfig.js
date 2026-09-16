// SPDX-License-Identifier: AGPL-3.0-or-later
// AI vault: one place for every API setting this app touches.
// Stored in server_settings rows (key = ai) with env fallback, same shape as
// mail.js and media.js: the DB wins when present, env wins on a raw clone.
// Keys: aiProvider (ai/provider), vision, voice, music, speech input (stt),
// limits, pricing, plus the provider vault ("aiProviders") and per-task
// routing ("aiRoutes"). Never store raw secrets bare in GET: return them masked.
const db = require("./db");

const SECRET_FIELDS = ["aiApiKey", "kieKey", "openaiKey", "anthropicKey", "googleKey", "sttApiKey"];

let cache = { at: 0, config: null };

function mask(cfg) {
  if (!cfg) return null;
  const out = { ...cfg };
  for (const f of SECRET_FIELDS) if (out[f]) out[f] = "•••••" + String(out[f]).slice(-4);
  if (Array.isArray(out.aiProviders)) {
    out.aiProviders = out.aiProviders.map((p) => {
      const q = { ...p };
      if (q.apiKey) q.apiKey = "•••••" + String(q.apiKey).slice(-4);
      return q;
    });
  }
  return out;
}

const TASK_KEYS = ["course-gen", "lesson-content", "exercise-gen", "lens", "tutor", "hint", "grading", "rubric", "translate", "stt"];
const PROVIDER_KINDS = new Set(["openai-compatible", "openai", "anthropic", "gemini"]);

function cloneProviders(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const id = String(p.id || p.name || "").trim().slice(0, 80);
    if (!id || seen.has(id)) continue;
    const name = String(p.name || id).trim().slice(0, 120);
    const kind = String(p.kind || p.provider || "openai-compatible").trim().toLowerCase();
    if (!PROVIDER_KINDS.has(kind)) continue;
    const baseUrl = String(p.baseUrl || p.base_url || p.url || "").trim().slice(0, 500);
    const apiKey = typeof p.apiKey === "string" ? p.apiKey.slice(0, 500) : "";
    const trainsOnData = Boolean(p.trainsOnData ?? p.trains_on_data);
    const models = Array.isArray(p.models) ? p.models.map((m) => String(m).trim().slice(0, 120)).filter(Boolean).slice(0, 20) : [];
    seen.add(id);
    out.push({ id, name, kind, baseUrl, apiKey, trainsOnData, models });
  }
  return out;
}

function cloneRoutes(raw, providers) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ids = new Set((providers || []).map((p) => p.id));
  const out = {};
  for (const k of TASK_KEYS) {
    const r = raw[k];
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const providerId = String(r.providerId || r.provider || "").trim().slice(0, 80);
    if (!providerId || !ids.has(providerId)) continue;
    const model = String(r.model || "").trim().slice(0, 120);
    out[k] = { providerId, model: model || null };
  }
  return Object.keys(out).length ? out : null;
}

function fromEnv() {
  const base = String(process.env.AI_BASE_URL || "").trim();
  const apiKey = String(process.env.AI_API_KEY || "").trim();
  const provider = String(process.env.AI_PROVIDER || "").trim();
  const pro = String(process.env.AI_MODEL_PRO || "").trim();
  const flash = String(process.env.AI_MODEL_FLASH || "").trim();
  const vision = String(process.env.AI_VISION_MODEL || "").trim();
  const prices = (() => {
    try { return process.env.AI_PRICES ? JSON.parse(process.env.AI_PRICES) : null; } catch { return null; }
  })();
  const kieKey = String(process.env.KIE_API_KEY || "").trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const voice = String(process.env.GOOGLE_TTS_ON_KIE || "").trim();
  const music = String(process.env.SUNO_MUSIC_ON_KIE || "").trim();
  const sttBase = String(process.env.STT_BASE_URL || "").trim();
  const sttKey = String(process.env.STT_API_KEY || "").trim();
  const sttModel = String(process.env.STT_MODEL || "").trim();
  const sttDailyCap = Number(process.env.STT_DAILY_CAP || 0) || 0;
  const sttKeep = /^(1|true|on|yes)$/i.test(String(process.env.STT_KEEP_RECORDINGS || "").trim());
  const monthlyCap = Number(process.env.AI_MONTHLY_CAP || 0) || 0;
  const dailyCap = Number(process.env.AI_DAILY_CAP || 0) || 0;
  const out = {};
  if (base) out.aiBaseUrl = base;
  if (apiKey) out.aiApiKey = apiKey;
  if (provider) out.aiProvider = provider;
  if (pro) out.aiModelPro = pro;
  if (flash) out.aiModelFlash = flash;
  if (vision) out.aiVisionModel = vision;
  if (prices) out.aiPrices = prices;
  if (kieKey) out.kieKey = kieKey;
  if (openaiKey) out.openaiKey = openaiKey;
  if (voice) out.googleTtsOnKie = voice;
  if (music) out.sunoMusicOnKie = music;
  if (sttBase) out.sttBaseUrl = sttBase;
  if (sttKey) out.sttApiKey = sttKey;
  if (sttModel) out.sttModel = sttModel;
  if (sttDailyCap) out.aiSttDailyCap = sttDailyCap;
  if (sttKeep) out.sttKeepRecordings = true;
  if (monthlyCap) out.aiMonthlyCap = monthlyCap;
  if (dailyCap) out.aiDailyCap = dailyCap;
  return Object.keys(out).length ? out : null;
}

async function resolveConfig() {
  if (cache.config && Date.now() - cache.at < 60000) return cache.config;
  let cfg = fromEnv();
  if (db.configured()) {
    const row = await db.query("select value from server_settings where key = 'ai'").catch(() => ({ rows: [] }));
    const stored = row.rows[0] && row.rows[0].value;
    if (stored) cfg = { ...(cfg || {}), ...stored, _fromDb: true };
  }
  if (cfg && Array.isArray(cfg.aiProviders)) cfg.aiProviders = cloneProviders(cfg.aiProviders);
  if (cfg && cfg.aiRoutes && typeof cfg.aiRoutes === "object") {
    const cleaned = cloneRoutes(cfg.aiRoutes, cfg.aiProviders || []);
    if (cleaned) cfg.aiRoutes = cleaned;
    else delete cfg.aiRoutes;
  }
  cache = { at: Date.now(), config: cfg };
  return cfg;
}

function invalidateCache() {
  cache = { at: 0, config: null };
}

async function status() {
  const cfg = await resolveConfig();
  const hasAi = Boolean(cfg && (cfg.aiBaseUrl || cfg.aiApiKey || cfg.aiModelPro || cfg.aiModelFlash || (Array.isArray(cfg.aiProviders) && cfg.aiProviders.length)));
  const hasVision = Boolean(cfg && cfg.aiVisionModel);
  const hasKie = Boolean(cfg && (cfg.kieKey || String(process.env.KIE_API_KEY || "").trim()));
  const hasVoice = Boolean(cfg && cfg.googleTtsOnKie);
  const hasMusic = Boolean(cfg && cfg.sunoMusicOnKie);
  // Speech input needs an endpoint to post to, not just a key: a key alone
  // would show a microphone that fails on the first press. The stt task in
  // the routing table does not count: stt.js reads the stt vault fields, not
  // aiRoutes, so a route alone cannot make the microphone work.
  const hasStt = Boolean(cfg && cfg.sttBaseUrl);
  return {
    configured: hasAi || hasKie,
    hasAi,
    hasVision,
    hasKie,
    hasVoice,
    hasMusic,
    hasStt,
    source: cfg && cfg._fromDb ? "settings" : hasAi || hasKie ? "env" : null,
    provider: cfg && cfg.aiProvider ? cfg.aiProvider : null,
  };
}

/**
 * Save speech-input settings into the same vault row the rest of the AI
 * settings live in, so a guide has one place for keys and no second save
 * button to hunt for. A masked secret (the bullet form a GET returns) means
 * "unchanged"; an empty string clears the field and falls back to env.
 */
async function saveStt(fields) {
  if (!db.configured()) return { ok: false, error: "db_required", code: 503 };
  const row = await db.query("select value from server_settings where key = 'ai'");
  const prev = (row.rows[0] && row.rows[0].value) || {};
  const next = { ...prev };
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null) continue;
    if (SECRET_FIELDS.includes(key) && /^•••••/.test(String(value))) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  await db.query(
    `insert into server_settings (key, value, updated_at) values ('ai', $1, now())
     on conflict (key) do update set value = $1, updated_at = now()`,
    [JSON.stringify(next)]
  );
  invalidateCache();
  return { ok: true };
}

module.exports = {
  resolveConfig, invalidateCache, status, mask, saveStt, SECRET_FIELDS,
  TASK_KEYS, PROVIDER_KINDS, cloneProviders, cloneRoutes, maskProviders: cloneProviders,
};
