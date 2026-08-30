// SPDX-License-Identifier: AGPL-3.0-or-later
// Task-routed AI layer. Point AI_BASE_URL at ANY OpenAI-compatible endpoint:
// Ollama, LM Studio, DeepSeek, OpenAI, ... All features degrade gracefully
// when no endpoint is configured — generated courses stay usable offline.
const { fetchT } = require("./http");

// Which model class each task uses. "pro" = quality (course generation),
// "flash" = speed (hints, grading, tutor turns). Override per-task via
// AI_ROUTES env JSON: {"tutor": {"model": "llama3.1"}} — no redeploy needed.
const DEFAULT_ROUTES = {
  "course-gen": "pro",
  "lesson-content": "pro",
  "exercise-gen": "pro",
  lens: "pro",
  tutor: "flash",
  hint: "flash",
  grading: "flash",
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

// Injected at boot to avoid a circular import (db ← aiusage → nothing ← ai).
// Signature: usageLogger({familyId, task, model, tokensIn, tokensOut, note})
let usageLogger = null;
function setUsageLogger(fn) {
  usageLogger = fn;
}

function configured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_BASE_URL.trim());
}

function health() {
  return {
    configured: configured(),
    baseUrl: configured() ? process.env.AI_BASE_URL : null,
    routeSample: resolveRoute("course-gen"),
  };
}

/**
 * Send a chat completion for a task.
 * @param {string} task - one of the keys in DEFAULT_ROUTES
 * @param {Array<{role:string,content:string}>} messages
 * @param {{json?:boolean, maxTokens?:number, temperature?:number}} [opts]
 * @returns {Promise<{content:string, usage:object|null, model:string|null}>}
 */
async function chat(task, messages, opts = {}) {
  if (!configured()) {
    const err = new Error("ai_not_configured: set AI_BASE_URL to any OpenAI-compatible endpoint (see .env.example)");
    err.code = "ai_not_configured";
    throw err;
  }
  const { model } = resolveRoute(task);
  if (!model) {
    const err = new Error(`ai_no_model: task "${task}" resolved to tier with no model — set AI_MODEL_PRO/AI_MODEL_FLASH`);
    err.code = "ai_no_model";
    throw err;
  }
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  // DeepSeek-style models can truncate (finish_reason=length) when reasoning
  // eats the budget — ladder the token cap until the reply actually finishes.
  let res = await post(body);
  let data = await readJson(res);
  let ladder = 0;
  while (data.choices && data.choices[0] && data.choices[0].finish_reason === "length" && ladder < 2) {
    ladder++;
    body.max_tokens = Math.min(body.max_tokens * 2, 32768);
    res = await post(body);
    data = await readJson(res);
  }
  const choice = data.choices && data.choices[0];
  if (usageLogger && data.usage) {
    try {
      usageLogger({
        familyId: opts.usage && opts.usage.familyId,
        task,
        model: data.model || model,
        tokensIn: data.usage.prompt_tokens,
        tokensOut: data.usage.completion_tokens,
        note: opts.usage && opts.usage.note,
      });
    } catch {
      /* accounting never breaks AI */
    }
  }
  return {
    content: choice ? choice.message.content : "",
    usage: data.usage || null,
    model: data.model || model,
    finish: choice ? choice.finish_reason : null,
  };

  async function post(b) {
    const r = await fetchT(`${process.env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
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
  // Model wrapped the JSON in prose — grab the outermost object.
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

module.exports = { chat, chatJson, resolveRoute, configured, health, setUsageLogger };
