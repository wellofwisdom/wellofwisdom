// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const captions = require("./captions");

const CUE = "00:00:01.000 --> 00:00:03.000\nHello there.";

test("normalizeVtt: a real WebVTT file passes through", () => {
  const vtt = `WEBVTT\n\n${CUE}`;
  assert.equal(captions.normalizeVtt(vtt), vtt);
});

test("normalizeVtt: strips a BOM and CRLF line endings", () => {
  const vtt = `﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:03.000\r\nHi.`;
  const out = captions.normalizeVtt(vtt);
  assert.ok(out.startsWith("WEBVTT"));
  assert.ok(!out.includes("\r"));
  assert.ok(!out.startsWith("﻿"));
});

test("normalizeVtt: prepends the header when cues are present but header is missing", () => {
  const out = captions.normalizeVtt(CUE);
  assert.ok(out.startsWith("WEBVTT\n\n"));
  assert.ok(out.includes("Hello there."));
});

test("normalizeVtt: rejects text with no cue timings", () => {
  assert.equal(captions.normalizeVtt("Just a plain transcript with no timings."), null);
});

test("normalizeVtt: rejects empty, whitespace and nullish input", () => {
  assert.equal(captions.normalizeVtt(""), null);
  assert.equal(captions.normalizeVtt("   \n  "), null);
  assert.equal(captions.normalizeVtt(null), null);
  assert.equal(captions.normalizeVtt(undefined), null);
});

test("normalizeVtt: does not treat WEBVTTX as a header", () => {
  // A word starting with WEBVTT but with no cues is not a caption file.
  assert.equal(captions.normalizeVtt("WEBVTTX is a made up thing"), null);
});

test("normalizeVtt: caps runaway size", () => {
  const huge = `WEBVTT\n\n${CUE}\n` + "x".repeat(2000000);
  const out = captions.normalizeVtt(huge);
  assert.ok(out.length <= 1000000);
});

test("tooLargeForStt: uses the configured megabyte ceiling", () => {
  const under = (captions.CAPTION_MAX_MB * 1024 * 1024) - 1;
  const over = (captions.CAPTION_MAX_MB * 1024 * 1024) + 1;
  assert.equal(captions.tooLargeForStt(under), false);
  assert.equal(captions.tooLargeForStt(over), true);
});
