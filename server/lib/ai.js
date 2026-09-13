// SPDX-License-Identifier: AGPL-3.0-or-later
// Task-routed AI layer. Point AI_BASE_URL at ANY provider:
// OpenAI-compatible (DeepSeek, OpenAI, Ollama, ...) OR Claude (Anthropic) OR Gemini (Google).
// All features degrade gracefully when no endpoint is configured.
const { fetchT } = require("./http");

// Which model class each task uses. "pro" = quality (course generation),
// "flash" = speed (hints, grading, tutor turns). Override per-task via
// AI_ROUTES env JSON: {"tutor": {"model": "llama3.1"}}. No redeploy needed.
const DEFAULT_ROUTES = {
  "course-gen": "pro",
  "lesson-content": "pro",
  "exercise-gen": "pro",
  lens: "pro",
  tutor: "flash",
  hint: "flash",
  grading: "flash",
  // Reading a whole piece of work against a rubric is a quality job, not a
  // quick one, so it sits on the pro tier. Override with AI_ROUTES if your
  // instance runs one model.
  rubric: "pro",
  translate: "flash",
};

function routes() {
  if (!process.env.AI_ROUTES) return DEFAULT_ROUTES;
  try {
    return { ...DEFAULT_ROUTES, ...JSON.parse(process.env.AI_ROUTES) };
  } catch {
    return DEFAULT_ROUTES;
  }
}

function resolveRoute(task) {
  const tier = routes()[task] || "flash";
  const model = tier === "pro" ? process.env.AI_MODEL_PRO : process.env.AI_MODEL_FLASH;
  return { task, tier, model: model || null };
}

// ---- provider detection ----
// AI_PROVIDER=anthropic|gemini|openai is explicit. Otherwise auto-detect from base URL.
function provider() {
  const explicit = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "claude") return "anthropic";
  if (explicit === "gemini" || explicit === "google") return "gemini";
  if (explicit === "openai" || explicit === "openai-compatible" || explicit === "openai_compatible") return "openai";
  const base = String(process.env.AI_BASE_URL || "").toLowerCase();
  if (base.includes("api.anthropic.com")) return "anthropic";
  if (base.includes("generativelanguage.googleapis.com") || base.includes("googleapis.com/generativelanguage")) return "gemini";
  return "openai";
}

let cachedAiConfig = null;
let cachedAt = 0;

async function aiConfigSnapshot() {
  try {
    const m = require("./aiConfig");
    const cfg = await m.resolveConfig();
    if (cfg && Date.now() - cachedAt < 15000) {
      if (cachedAiConfig) cfg._cached = true;
    }
    if (cfg) { cachedAiConfig = cfg; cachedAt = Date.now(); }
    return cfg;
  } catch { return null; }
}

function configured() {
  if (cachedAiConfig) {
    const c = cachedAiConfig;
    if (c.aiProvider === "anthropic" || c.aiProvider === "gemini") return Boolean((c.aiApiKey || "").trim());
    if (c.aiBaseUrl) return true;
    if (c.aiApiKey && (c.aiProvider === "openai" || !c.aiProvider)) return true;
  }
  const p = provider();
  if (p === "anthropic" || p === "gemini") {
    return Boolean(process.env.AI_API_KEY && String(process.env.AI_API_KEY).trim());
  }
  return Boolean(process.env.AI_BASE_URL && String(process.env.AI_BASE_URL).trim());
}

function configuredFromVault(cfg) {
  if (!cfg) return configured();
  const prov = String(cfg.aiProvider || "").trim().toLowerCase();
  if (prov === "anthropic" || prov === "gemini") return Boolean((cfg.aiApiKey || "").trim());
  const base = String(cfg.aiBaseUrl || "").trim();
  if (base) return true;
  if ((cfg.aiApiKey || "").trim()) return true;
  return false;
}

function health() {
  const p = provider();
  let baseUrl = process.env.AI_BASE_URL || null;
  if (p === "anthropic") baseUrl = "https://api.anthropic.com";
  if (p === "gemini") baseUrl = "https://generativelanguage.googleapis.com";
  const vault = cachedAiConfig;
  if (vault && vault.aiBaseUrl) baseUrl = vault.aiBaseUrl;
  if (vault && vault.aiProvider) {
    const vp = String(vault.aiProvider).toLowerCase();
    if (vp === "anthropic") baseUrl = "https://api.anthropic.com";
    else if (vp === "gemini") baseUrl = "https://generativelanguage.googleapis.com";
  }
  return {
    configured: cachedAiConfig ? configuredFromVault(cachedAiConfig) : configured(),
    provider: vault && vault.aiProvider ? vault.aiProvider : p,
    baseUrl,
    routeSample: resolveRoute("course-gen"),
  };
}

async function refreshVault() {
  await aiConfigSnapshot();
}

// Injected at boot to avoid a circular import (db <- aiusage -> nothing <- ai).
// Signature: usageLogger({familyId, task, model, tokensIn, tokensOut, note})
let usageLogger = null;
function setUsageLogger(fn) {
  usageLogger = fn;
}

function logUsageTokens({ familyId, task, model, tokensIn, tokensOut, note }) {
  if (!usageLogger) return;
  try {
    usageLogger({ familyId, task, model, tokensIn, tokensOut, note });
  } catch {
    /* accounting never breaks AI */
  }
}

/**
 * Send a chat completion for a task.
 * @param {string} task - one of the keys in DEFAULT_ROUTES
 * @param {Array<{role:string,content:string}>} messages
 * @param {{json?:boolean, maxTokens?:number, temperature?:number, usage?:{familyId:number,note:string}}} [opts]
 * @returns {Promise<{content:string, usage:object|null, model:string|null}>}
 */
async function effectiveConfig() {
  const vault = await aiConfigSnapshot();
  if (!vault) return { provider: provider(), baseUrl: process.env.AI_BASE_URL || "", apiKey: process.env.AI_API_KEY || "", modelPro: process.env.AI_MODEL_PRO || "", modelFlash: process.env.AI_MODEL_FLASH || "", vision: process.env.AI_VISION_MODEL || "" };
  return {
    provider: vault.aiProvider || provider(),
    baseUrl: vault.aiBaseUrl || process.env.AI_BASE_URL || "",
    apiKey: vault.aiApiKey || process.env.AI_API_KEY || "",
    modelPro: vault.aiModelPro || process.env.AI_MODEL_PRO || "",
    modelFlash: vault.aiModelFlash || process.env.AI_MODEL_FLASH || "",
    vision: vault.aiVisionModel || process.env.AI_VISION_MODEL || "",
  };
}

function vaultConfigured(cfg) {
  if (!cfg) return configured();
  const pr = String(cfg.provider || "").toLowerCase();
  if (pr === "anthropic" || pr === "gemini") return Boolean((cfg.apiKey || "").trim());
  return Boolean((cfg.baseUrl || "").trim() || (cfg.apiKey || "").trim());
}

async function chat(task, messages, opts = {}) {
  const cfg = await effectiveConfig();
  if (!vaultConfigured(cfg)) {
    const err = new Error("ai_not_configured: set AI settings in Settings  vault or AI_BASE_URL / AI_PROVIDER + AI_API_KEY. See .env.example");
    err.code = "ai_not_configured";
    throw err;
  }
  // Enforce spend limits before burning tokens
  if (opts.usage && opts.usage.familyId) {
    try {
      const lim = require("./aiLimits");
      const chk = await lim.checkFamily(opts.usage.familyId);
      if (!chk.ok) {
        const err = new Error(chk.reason === "monthly_limit" ? "ai_monthly_limit: monthly spend limit reached" : "ai_daily_limit: daily spend limit reached");
        err.code = chk.reason === "monthly_limit" ? "ai_monthly_limit" : "ai_daily_limit";
        throw err;
      }
    } catch (e) { if (e && (e.code === "ai_monthly_limit" || e.code === "ai_daily_limit")) throw e; }
  }
  const tm = resolveRoute(task);
  const wantPro = tm.tier === "pro";
  const vaultModel = wantPro ? (cfg.modelPro || "") : (cfg.modelFlash || "");
  const effModel = vaultModel || tm.model || null;
  if (!effModel) {
    const err = new Error(`ai_no_model: task "${task}" resolved to tier with no model. Set models in the AI vault or AI_MODEL_PRO/AI_MODEL_FLASH`);
    err.code = "ai_no_model";
    throw err;
  }
  const p = String(cfg.provider || provider()).toLowerCase();
  if (p === "anthropic" || p === "claude") return chatViaAnthropic(task, messages, opts, effModel, cfg);
  if (p === "gemini" || p === "google") return chatViaGemini(task, messages, opts, effModel, cfg);
  return chatViaOpenAI(task, messages, opts, effModel, cfg);
}

async function chatViaGemini(task, messages, opts, model, cfg) {
  const { chatGoogle } = require("./providers/google");
  const baseUrl = String((cfg && cfg.baseUrl) || process.env.AI_BASE_URL || "").trim() || "https://generativelanguage.googleapis.com";
  const key = (cfg && cfg.apiKey) || process.env.AI_API_KEY || "";
  let effMessages = messages;
  if (opts.json) {
    effMessages = [...messages];
    const last = effMessages[effMessages.length - 1];
    if (last && last.role === "user" && typeof last.content === "string") {
      effMessages[effMessages.length - 1] = { ...last, content: last.content + "\n\nReturn ONLY valid JSON, no fences, no commentary." };
    }
  }
  let out = await chatGoogle({ baseUrl, apiKey: key, model, messages: effMessages, opts });
  let ladder = 0;
  while (out.finish === "length" && ladder < 1 && opts.maxTokens) {
    ladder++;
    const bigger = Math.min((opts.maxTokens || 4096) * 2, 8192);
    out = await chatGoogle({ baseUrl, apiKey: key, model, messages: effMessages, opts: { ...opts, maxTokens: bigger } });
  }
  if (out.usage) {
    logUsageTokens({
      familyId: opts.usage && opts.usage.familyId,
      task,
      model: out.model || model,
      tokensIn: out.usage.prompt_tokens,
      tokensOut: out.usage.completion_tokens,
      note: opts.usage && opts.usage.note,
    });
  }
  return out;
}

async function chatViaAnthropic(task, messages, opts, model, cfg) {
  const { chatAnthropic } = require("./providers/anthropic");
  const baseUrl = String((cfg && cfg.baseUrl) || process.env.AI_BASE_URL || "").trim() || "https://api.anthropic.com";
  const key = (cfg && cfg.apiKey) || process.env.AI_API_KEY || "";
  let effMessages = messages;
  if (opts.json) {
    effMessages = [...messages];
    const last = effMessages[effMessages.length - 1];
    if (last && last.role === "user" && typeof last.content === "string") {
      effMessages[effMessages.length - 1] = { ...last, content: last.content + "\n\nReturn ONLY valid JSON, no fences, no commentary." };
    }
  }
  let out = await chatAnthropic({ baseUrl, apiKey: key, model, messages: effMessages, opts });
  let ladder = 0;
  while (out.finish === "length" && ladder < 1 && opts.maxTokens) {
    ladder++;
    const bigger = Math.min((opts.maxTokens || 4096) * 2, 8192);
    out = await chatAnthropic({ baseUrl, apiKey: key, model, messages: effMessages, opts: { ...opts, maxTokens: bigger } });
  }
  if (out.usage) {
    logUsageTokens({
      familyId: opts.usage && opts.usage.familyId,
      task,
      model: out.model || model,
      tokensIn: out.usage.prompt_tokens,
      tokensOut: out.usage.completion_tokens,
      note: opts.usage && opts.usage.note,
    });
  }
  return out;
}

async function chatViaOpenAI(task, messages, opts, model, cfg) {
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let res = await postOpenAI(body);
  let data = await readJson(res);
  let ladder = 0;
  while (data.choices && data.choices[0] && data.choices[0].finish_reason === "length" && ladder < 2) {
    ladder++;
    body.max_tokens = Math.min(body.max_tokens * 2, 32768);
    res = await postOpenAI(body);
    data = await readJson(res);
  }
  const choice = data.choices && data.choices[0];
  if (usageLogger && data.usage) {
    logUsageTokens({
      familyId: opts.usage && opts.usage.familyId,
      task,
      model: data.model || model,
      tokensIn: data.usage.prompt_tokens,
      tokensOut: data.usage.completion_tokens,
      note: opts.usage && opts.usage.note,
    });
  }
  return {
    content: choice ? choice.message.content : "",
    usage: data.usage || null,
    model: data.model || model,
    finish: choice ? choice.finish_reason : null,
  };

  async function postOpenAI(b) {
    const base = String((cfg && cfg.baseUrl) || process.env.AI_BASE_URL || "").replace(/\/$/, "");
    const r = await fetchT(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...((cfg && cfg.apiKey ? cfg.apiKey : process.env.AI_API_KEY) ? { authorization: `Bearer ${(cfg && cfg.apiKey) || process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(b),
    });
    if (!r.ok) throw new Error(`ai_http_${r.status}: ${String(await r.text()).slice(0, 300)}`);
    return r;
  }
  async function readJson(r) {
    try {
      return await r.json();
    } catch {
      throw new Error("ai_bad_response: provider returned non-JSON");
    }
  }
}

/** chat() + parse the reply as JSON. Tolerates fences, prose wrappers, and
 *  truncation (retries without json-mode at low temperature, laddered tokens). */
async function chatJson(task, messages, opts = {}) {
  const attempts = [
    { json: true, temperature: opts.temperature ?? 0.7 },
    { json: false, temperature: 0.3, maxTokens: (opts.maxTokens || 4096) * 2 },
  ];
  let lastContent = "";
  for (const a of attempts) {
    const out = await chat(task, messages, { ...opts, ...a });
    lastContent = out.content;
    const parsed = tryParse(out.content);
    if (parsed !== undefined) return { ...out, json: parsed };
  }
  throw new Error(`ai_bad_json: model did not return valid JSON (tail: ${String(lastContent).slice(-120)})`);
}

function tryParse(text) {
  let s = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(s);
  } catch {
    /* fall through to object extraction */
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

module.exports = { chat, chatJson, resolveRoute, configured, health, setUsageLogger, provider, refreshVault, configuredFromVault };
