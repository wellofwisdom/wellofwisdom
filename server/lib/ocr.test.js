// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

describe("ocr photo-to-worksheet shape", () => {
  it("lib/ocr.js exists and exports hasVision and extractTextFromImage", () => {
    const ocr = require("./ocr");
    assert.equal(typeof ocr.hasVision, "function");
    assert.equal(typeof ocr.extractTextFromImage, "function");
    assert.equal(typeof ocr.imageDataUrl, "function");
  });

  it("imageDataUrl builds a data URL that a vision provider can read", () => {
    const { imageDataUrl } = require("./ocr");
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const url = imageDataUrl(buf, "image/png");
    assert.ok(url.startsWith("data:image/png;base64,"));
    assert.ok(url.length > 20);
  });

  it("hasVision is false without AI_VISION_MODEL, even when AI_BASE_URL is set", () => {
    const orig = process.env.AI_VISION_MODEL;
    process.env.AI_VISION_MODEL = "";
    delete require.cache[require.resolve("./ocr")];
    const fresh = require("./ocr");
    assert.equal(fresh.hasVision(), false);
    if (orig === undefined) delete process.env.AI_VISION_MODEL;
    else process.env.AI_VISION_MODEL = orig;
    delete require.cache[require.resolve("./ocr")];
  });

  it("routes/jobs.js does not need a new queue type: photo OCR lands as worksheet text", () => {
    const src = fs.readFileSync("server/lib/jobs.js", "utf8");
    // No new job handler: the photo is read to text before it ever becomes a job.
    assert.ok(!src.includes("ocr") && !src.includes("photo"), "jobs.js should not grow a new handler for OCR");
  });

  it("the OCR text crosses the SAME worksheet trust boundary, not a new one", () => {
    const wk = fs.readFileSync("server/lib/worksheet.js", "utf8");
    assert.ok(wk.includes("normalizeItem"), "worksheet.js must still run through normalizeItem");
  });
});
