// SPDX-License-Identifier: AGPL-3.0-or-later
// Photo to worksheet: turn a photo of a worksheet into the same graded
// exercises as pasted text, without a separate OCR vendor.
//
// Vision is the OCR here. Most AI providers accept an image in the chat
// payload when AI_VISION_MODEL is set (OpenAI, DeepSeek-VL, Ollama with a
// vision model, etc.). No new key, no new provider, no per-page fee. When
// no vision model is configured the upload still lands, just without the
// auto-read: the guide sees the image and can still type or correct the
// extracted text before it becomes exercises.

const ai = require("./ai");

const VISION_MODEL = (process.env.AI_VISION_MODEL || "").trim();

function hasVision() {
  return Boolean(VISION_MODEL && ai.configured());
}

function describeVision() {
  return VISION_MODEL ? VISION_MODEL : null;
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
async function extractTextFromImage({ buffer, mime, familyId }) {
  if (!hasVision()) {
    const err = new Error("ocr_not_configured: set AI_VISION_MODEL to a vision-capable model on your provider (e.g. gpt-4o-mini, llava)");
    err.code = "ocr_not_configured";
    throw err;
  }
  if (!buffer || !buffer.length) {
    const err = new Error("ocr_empty_file");
    err.code = "ocr_empty_file";
    throw err;
  }
  // Cap the image inline size (OpenAI-ish providers reject >20MB in the body).
  if (buffer.length > 12 * 1024 * 1024) {
    const err = new Error("ocr_too_large");
    err.code = "ocr_too_large";
    throw err;
  }
  const dataUrl = imageDataUrl(buffer, mime || "image/jpeg");
  const route = ai.resolveRoute("exercise-gen");
  const model = VISION_MODEL || route.model;
  if (!model) {
    const err = new Error("ocr_no_model");
    err.code = "ocr_no_model";
    throw err;
  }
  // Build the provider-specific payload. For OpenAI-compatible endpoints the
  // image is an extra content part on the user message. For providers that
  // ignore image parts this still degrades to a text-only call.
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
  // Bypass ai.chat so we can pick the vision model even when the route says
  // flash vs pro. The low-level call is the same endpoint.
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
  // Reuse the tolerant JSON extraction from the normal AI path.
  let parsed;
  try {
    const s = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(s);
  } catch {
    const s = String(content);
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { parsed = JSON.parse(s.slice(a, b + 1)); } catch { parsed = null; }
    }
  }
  if (!parsed || typeof parsed.text !== "string") {
    const err = new Error("ocr_bad_json");
    err.code = "ocr_failed";
    throw err;
  }
  // Light accounting, without importing the circular aiusage logger.
  try {
    if (data && data.usage && familyId) {
      const log = require("./aiusage").logUsage;
      log({ familyId, task: "worksheet-ocr", model, tokensIn: data.usage.prompt_tokens, tokensOut: data.usage.completion_tokens, note: "ocr" });
    }
  } catch { /* accounting never breaks OCR */ }
  const text = parsed.text.trim().slice(0, 12000);
  return text;
}

module.exports = { hasVision, describeVision, extractTextFromImage, imageDataUrl, VISION_MODEL };
