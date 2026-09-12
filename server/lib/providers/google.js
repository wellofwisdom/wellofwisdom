// SPDX-License-Identifier: AGPL-3.0-or-later
// Google Gemini provider adapter. Gemini's API is NOT OpenAI-compatible.
// Converts chat's { messages, model, opts } into POST /v1beta/models/<model>:generateContent
// and back into { content, usage, model }.

const { fetchT } = require("../http");

function toGeminiContents(messages) {
  const contents = [];
  for (const m of messages || []) {
    if (m.role === "system") {
      // Gemini uses systemInstruction at top level, but contents here are user/model.
      // Inline system as a user turn is acceptable and avoids extra field.
      contents.push({ role: "user", parts: [{ text: String(m.content || "") }] });
    } else if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: String(m.content || "") }] });
    } else {
      const c = m.content;
      if (Array.isArray(c)) {
        const parts = [];
        for (const p of c) {
          if (p.type === "text") parts.push({ text: String(p.text || "") });
          else if (p.type === "image_url" && p.image_url && p.image_url.url) {
            const url = String(p.image_url.url);
            const mm = /^data:([^;]+);base64,(.*)$/.exec(url);
            if (mm) parts.push({ inlineData: { mimeType: mm[1], data: mm[2] } });
            else parts.push({ text: `[image: ${url.slice(0, 120)}]` });
          }
        }
        contents.push({ role: "user", parts: parts.length ? parts : [{ text: "" }] });
      } else {
        contents.push({ role: "user", parts: [{ text: String(c || "") }] });
      }
    }
  }
  return contents;
}

async function chatGoogle({ baseUrl, apiKey, model, messages, opts }) {
  const base = String(baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const generationConfig = {};
  if (opts && Number.isFinite(opts.maxTokens)) generationConfig.maxOutputTokens = Math.min(opts.maxTokens, 8192);
  if (opts && opts.temperature != null) generationConfig.temperature = opts.temperature;
  if (opts && opts.json) generationConfig.responseMimeType = "application/json";

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: Object.keys(generationConfig).length ? generationConfig : undefined,
  };

  const res = await fetchT(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, { timeoutMs: 120000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 400);
    throw new Error(`ai_http_${res.status}: ${t}`);
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("ai_bad_response: provider returned non-JSON");
  const cand = (data.candidates || [])[0] || {};
  const parts = (cand.content && cand.content.parts) || [];
  const text = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("") || "";
  const usage = data.usageMetadata ? {
    prompt_tokens: data.usageMetadata.promptTokenCount || 0,
    completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
  } : null;
  const finish = cand.finishReason === "MAX_TOKENS" ? "length" : (cand.finishReason || null);
  return { content: text, usage, model: model, finish, raw: data };
}

module.exports = { chatGoogle, toGeminiContents };
