// SPDX-License-Identifier: AGPL-3.0-or-later
// Photo to worksheet: turn a photo of a worksheet into the same graded
// exercises as pasted text, without a separate OCR vendor.
//
// Vision is the OCR here. Most AI providers accept an image in the chat
// payload when AI_VISION_MODEL is set (OpenAI, Anthropic Claude, Ollama
// with a vision model, etc.). No new key, no new provider, no per-page fee.
// When no vision model is configured the upload still lands, just without the
// auto-read: the guide sees the image and can still type or correct the
// extracted text before it becomes exercises.

const ai = require("./ai");

function visionModel() {
  return (process.env.AI_VISION_MODEL || "").trim() || null;
}

function hasVision() {
  return Boolean(visionModel() && ai.configured());
}

function describeVision() {
  return visionModel();
}

// Data URL from a stored image upload (png/jpeg/webp/gif; the upload
// allowlist already guarantees the mime is one a browser can show).
function imageDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

const OCR_SYSTEM = `You read a photo of a printed worksheet and transcribe ONLY the questions.
Return ONE valid JSON object: { "text": "..." }
Rules:
- Preserve each question's wording and order. Include any visible choices (A/B/C/D or 1/2/3) verbatim.
- Skip page headers, footers, instructions that are not a question, and decorative text.
- Keep maths as plain text (e.g. 3/4, x^2, 3 < 5); do not add LaTeX or markup.
- If the image has no readable questions, return {"text":""}.
- Return ONLY the JSON, no fences, no commentary.`;

// Extract raw worksheet text from an image buffer via the vision model.
// Routes through ai.provider(): OpenAI-compatible vs Anthropic Claude.
async function extractTextFromImage({ buffer, mime, familyId }) {
  if (!hasVision()) {
    const err = new Error("ocr_not_configured: set AI_VISION_MODEL to a vision-capable model on your provider (e.g. gpt-4o-mini, claude-sonnet, llava)");
    err.code = "ocr_not_configured";
    throw err;
  }
  if (!buffer || !buffer.length) {
    const err = new Error("ocr_empty_file");
    err.code = "ocr_empty_file";
    throw err;
  }
  if (buffer.length > 12 * 1024 * 1024) {
    const err = new Error("ocr_too_large");
    err.code = "ocr_too_large";
    throw err;
  }
  const vm = visionModel();
  const route = ai.resolveRoute("exercise-gen");
  const model = vm || route.model;
  if (!model) {
    const err = new Error("ocr_no_model");
    err.code = "ocr_no_model";
    throw err;
  }

  // Claude/Anthropic path: use the Anthropic vision shape (content blocks
  // with base64 image source). Still goes via the AI key + provider logic.
  if (ai.provider() === "anthropic") {
    return extractViaAnthropic({ buffer, mime, model, familyId });
  }
  return extractViaOpenAI({ buffer, mime, model, familyId });
}

async function extractViaAnthropic({ buffer, mime, model, familyId }) {
  const { chatAnthropic } = require("./providers/anthropic");
  const baseUrl = String(process.env.AI_BASE_URL || "").trim() || "https://api.anthropic.com";
  const key = process.env.AI_API_KEY || "";
  const b64 = buffer.toString("base64");
  const mt = mime || "image/jpeg";
  const messages = [
    { role: "system", content: OCR_SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: "Transcribe the worksheet questions in this image. Return only the JSON." },
        { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
      ],
    },
  ];
  // chatAnthropic expects the raw prompt shape; call it low-level via its helper.
  // Reuse the shared Anthropic translation path but bypass toAnthropicContent's
  // data-URL parsing by passing native blocks directly.
  const { fetchT } = require("./http");
  const ANTHROPIC_VERSION = "2023-06-01";
  const body = {
    model,
    max_tokens: 4000,
    system: OCR_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the worksheet questions in this image. Return only the JSON object {\"text\": \"...\"} with no fences or commentary." },
          { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
        ],
      },
    ],
  };
  // Prefer the provider module's path when available, but keep this direct
  // so OCR does not depend on chat()'s JSON nudging.
  void chatAnthropic;
  const res = await fetchT(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": String(key || ""),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  }, { timeoutMs: 90000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 400);
    const err = new Error(`ocr_http_${res.status}: ${t}`);
    err.code = "ocr_failed";
    throw err;
  }
  const data = await res.json().catch(() => null);
  const content = data && data.content && data.content.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
  if (!content) {
    const err = new Error("ocr_empty_response");
    err.code = "ocr_failed";
    throw err;
  }
  const parsed = tolerantParse(content);
  if (!parsed || typeof parsed.text !== "string") {
    const err = new Error("ocr_bad_json");
    err.code = "ocr_failed";
    throw err;
  }
  try {
    if (data && data.usage && familyId) {
      const log = require("./aiusage").logUsage;
      log({ familyId, task: "worksheet-ocr", model, tokensIn: data.usage.input_tokens, tokensOut: data.usage.output_tokens, note: "ocr" });
    }
  } catch { /* accounting never breaks OCR */ }
  return parsed.text.trim().slice(0, 12000);
}

async function extractViaOpenAI({ buffer, mime, model, familyId }) {
  const dataUrl = imageDataUrl(buffer, mime || "image/jpeg");
  const messages = [
    { role: "system", content: OCR_SYSTEM },
    {
      role: "user",
      content: [
        { type: "text", text: "Transcribe the worksheet questions in this image. Return only the JSON." },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];
  const { fetchT } = require("./http");
  const base = String(process.env.AI_BASE_URL || "").replace(/\/$/, "");
  const body = {
    model,
    messages,
    max_tokens: 4000,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  const res = await fetchT(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  }, { timeoutMs: 90000, retries: 1 });
  if (!res.ok) {
    const t = String(await res.text()).slice(0, 300);
    const err = new Error(`ocr_http_${res.status}: ${t}`);
    err.code = "ocr_failed";
    throw err;
  }
  const data = await res.json().catch(() => null);
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    const err = new Error("ocr_empty_response");
    err.code = "ocr_failed";
    throw err;
  }
  const parsed = tolerantParse(content);
  if (!parsed || typeof parsed.text !== "string") {
    const err = new Error("ocr_bad_json");
    err.code = "ocr_failed";
    throw err;
  }
  try {
    if (data && data.usage && familyId) {
      const log = require("./aiusage").logUsage;
      log({ familyId, task: "worksheet-ocr", model, tokensIn: data.usage.prompt_tokens, tokensOut: data.usage.completion_tokens, note: "ocr" });
    }
  } catch { /* accounting never breaks OCR */ }
  return parsed.text.trim().slice(0, 12000);
}

function tolerantParse(content) {
  let parsed;
  try {
    const s = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(s);
    return parsed;
  } catch {
    const s = String(content);
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
    }
    return null;
  }
}

module.exports = { hasVision, describeVision, extractTextFromImage, imageDataUrl, visionModel };
