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

  const res = await fetchT(`${process.env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ai_http_${res.status}: ${String(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  return {
    content: choice ? choice.message.content : "",
    usage: data.usage || null,
    model: data.model || model,
  };
}

/** chat() + parse the reply as JSON (strips ``` fences; retries once without json mode). */
async function chatJson(task, messages, opts = {}) {
  let out = await chat(task, messages, { ...opts, json: true });
  let parsed = tryParse(out.content);
  if (parsed !== undefined) return { ...out, json: parsed };
  out = await chat(task, messages, { ...opts, json: false, temperature: 0.3 });
  parsed = tryParse(out.content);
  if (parsed !== undefined) return { ...out, json: parsed };
  throw new Error("ai_bad_json: model did not return valid JSON");
}

function tryParse(text) {
  const s = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

module.exports = { chat, chatJson, resolveRoute, configured, health };
