// SPDX-License-Identifier: AGPL-3.0-or-later
// AI vault: one place for every API setting this app touches.
// Stored in server_settings rows (key = ai) with env fallback, same shape as
// mail.js and media.js: the DB wins when present, env wins on a raw clone.
// Keys: aiProvider (ai/provider), vision, voice, music, limits, pricing.
// Never store raw secrets bare in GET: return them masked (last 4).
const db = require("./db");

const SECRET_FIELDS = ["aiApiKey", "kieKey", "openaiKey", "anthropicKey", "googleKey"];

let cache = { at: 0, config: null };

function mask(cfg) {
  if (!cfg) return null;
  const out = { ...cfg };
  for (const f of SECRET_FIELDS) if (out[f]) out[f] = "•••••" + String(out[f]).slice(-4);
  return out;
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
  cache = { at: Date.now(), config: cfg };
  return cfg;
}

function invalidateCache() {
  cache = { at: 0, config: null };
}

async function status() {
  const cfg = await resolveConfig();
  const hasAi = Boolean(cfg && (cfg.aiBaseUrl || cfg.aiApiKey || cfg.aiModelPro || cfg.aiModelFlash));
  const hasVision = Boolean(cfg && cfg.aiVisionModel);
  const hasKie = Boolean(cfg && (cfg.kieKey || String(process.env.KIE_API_KEY || "").trim()));
  const hasVoice = Boolean(cfg && cfg.googleTtsOnKie);
  const hasMusic = Boolean(cfg && cfg.sunoMusicOnKie);
  return {
    configured: hasAi || hasKie,
    hasAi,
    hasVision,
    hasKie,
    hasVoice,
    hasMusic,
    source: cfg && cfg._fromDb ? "settings" : hasAi || hasKie ? "env" : null,
    provider: cfg && cfg.aiProvider ? cfg.aiProvider : null,
  };
}

module.exports = { resolveConfig, invalidateCache, status, mask, SECRET_FIELDS };
