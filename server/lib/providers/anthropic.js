// SPDX-License-Identifier: AGPL-3.0-or-later
// Anthropic Claude provider adapter. Chat API is NOT OpenAI-compatible,
// so this translates ai.chat's OpenAI-ish call into Anthropic's
// POST /v1/messages and back into the same { content, usage, model } shape.
//
// Wire-up: AI_PROVIDER=anthropic  (auto-detected when AI_BASE_URL contains
// "api.anthropic.com"), AI_API_KEY=sk-ant-..., AI_MODEL_PRO / FLASH = e.g.
// claude-sonnet-4-5, claude-haiku-4-5. Version header is anthropic-version.
// JSON mode: no response_format, so the prompt asks for JSON and we parse it.

const { fetchT } = require("../http");

const ANTHROPIC_VERSION = "2023-06-01";

// Anthropic counts a system message separately from the messages array.
function toAnthropicMessages(messages) {
  const systemParts = [];
  const msgs = [];
  for (const m of messages || []) {
    if (m.role === "system") {
      systemParts.push(String(m.content || ""));
    } else if (m.role === "assistant") {
      msgs.push({ role: "assistant", content: [{ type: "text", text: String(m.content || "") }] });
    } else {
      // user or unknown -> user. Vision content (array with image_url parts)
      // is handled at a higher level; here strings are the common case.
      const c = m.content;
      if (Array.isArray(c)) {
        msgs.push({ role: "user", content: toAnthropicContent(c) });
      } else {
        msgs.push({ role: "user", content: [{ type: "text", text: String(c || "") }] });
      }
    }
  }
  return {
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
    messages: msgs,
  };
}

function toAnthropicContent(parts) {
  const out = [];
  for (const p of parts || []) {
    if (p.type === "text") out.push({ type: "text", text: String(p.text || "") });
    else if (p.type === "image_url" && p.image_url && p.image_url.url) {
      const url = String(p.image_url.url);
      // data:<mime>;base64,<...>
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (m) {
        out.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
      } else {
        // Non-data URLs are not fetchable here, treat as text mention.
        out.push({ type: "text", text: `[image: ${url.slice(0, 120)}]` });
      }
    }
  }
  return out.length ? out : [{ type: "text", text: "" }];
}

function anthropicMaxTokens(opts, fallback) {
  if (opts && Number.isFinite(opts.maxTokens)) return Math.min(Math.max(1, opts.maxTokens), 8192);
  return fallback;
}

async function chatAnthropic({ baseUrl, apiKey, model, messages, opts }) {
  const { system, messages: anthMessages } = toAnthropicMessages(messages);
  const maxTokens = anthropicMaxTokens(opts, 4096);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: anthMessages,
  };
  if (system) body.system = system;
  if (opts && opts.temperature != null) body.temperature = opts.temperature;
  // Anthropic has no json_object mode. Asking for JSON in the prompt is enough;
  // tryParse at the ai.js level handles fences/wrapping.

  const url = `${String(baseUrl).replace(/\/$/, "")}/v1/messages`;
  const res = await fetchT(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": String(apiKey || ""),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  }, { timeoutMs: 120000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 400);
    throw new Error(`ai_http_${res.status}: ${t}`);
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("ai_bad_response: provider returned non-JSON");
  const blocks = data.content || [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
  const usage = data.usage ? {
    prompt_tokens: data.usage.input_tokens,
    completion_tokens: data.usage.output_tokens,
  } : null;
  const finish = data.stop_reason === "max_tokens" ? "length" : data.stop_reason || null;
  return { content: text, usage, model: data.model || model, finish, raw: data };
}

// Vision is already covered: Anthropic's data URL image source is handled
// above, so extractTextFromImage can route through chatAnthropic.

module.exports = { chatAnthropic, toAnthropicMessages, ANTHROPIC_VERSION };
