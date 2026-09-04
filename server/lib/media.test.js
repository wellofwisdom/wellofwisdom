// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const media = require("./media");

const URL_A = "https://tempfile.aiquickdraw.com/h/abc_1.png";

test("resultUrls: top-level resultJson string (what nano-banana really returns)", () => {
  // Live recordInfo payload shape as of 2026-08: no `response` object at all.
  const d = {
    taskId: "abc", state: "success",
    resultJson: JSON.stringify({ resultUrls: [URL_A] }),
  };
  assert.deepEqual(media.resultUrls(d), [URL_A]);
});

test("resultUrls: nested response.resultUrls", () => {
  assert.deepEqual(media.resultUrls({ response: { resultUrls: [URL_A] } }), [URL_A]);
});

test("resultUrls: nested response.resultJson string", () => {
  const d = { response: { resultJson: JSON.stringify({ resultUrls: [URL_A] }) } };
  assert.deepEqual(media.resultUrls(d), [URL_A]);
});

test("resultUrls: top-level resultUrls array", () => {
  assert.deepEqual(media.resultUrls({ resultUrls: [URL_A] }), [URL_A]);
});

test("resultUrls: empty, malformed, and missing payloads yield []", () => {
  assert.deepEqual(media.resultUrls({}), []);
  assert.deepEqual(media.resultUrls(null), []);
  assert.deepEqual(media.resultUrls({ resultJson: "" }), []);
  assert.deepEqual(media.resultUrls({ resultJson: "not json" }), []);
  assert.deepEqual(media.resultUrls({ resultJson: JSON.stringify({ resultUrls: [] }) }), []);
});

// ---- transcription helpers (auto-captions) ----

test("secToTs: formats seconds as a WebVTT timestamp", () => {
  assert.equal(media.secToTs(0), "00:00:00.000");
  assert.equal(media.secToTs(1.5), "00:00:01.500");
  assert.equal(media.secToTs(61.25), "00:01:01.250");
  assert.equal(media.secToTs(3661), "01:01:01.000");
  assert.equal(media.secToTs(-5), "00:00:00.000"); // clamped
});

test("wordsToVtt: builds cues from ElevenLabs words and closes on a sentence end", () => {
  const words = [
    { type: "word", text: "Hello", start: 0, end: 0.5 },
    { type: "spacing", text: " " },
    { type: "word", text: "there.", start: 0.6, end: 1.0 },
    { type: "spacing", text: " " },
    { type: "word", text: "Next", start: 1.2, end: 1.6 },
    { type: "spacing", text: " " },
    { type: "word", text: "line.", start: 1.7, end: 2.1 },
  ];
  const vtt = media.wordsToVtt(words);
  assert.ok(vtt.startsWith("WEBVTT"));
  assert.ok(vtt.includes("00:00:00.000 --> 00:00:01.000"));
  assert.ok(vtt.includes("Hello there."));
  assert.ok(vtt.includes("Next line."));
  // two sentences -> two cues
  assert.equal((vtt.match(/-->/g) || []).length, 2);
});

test("wordsToVtt: a long run without punctuation is split by duration", () => {
  const words = [];
  for (let i = 0; i < 20; i++) {
    words.push({ type: "word", text: `w${i}`, start: i, end: i + 0.9 });
    words.push({ type: "spacing", text: " " });
  }
  const vtt = media.wordsToVtt(words, 6, 999);
  assert.ok((vtt.match(/-->/g) || []).length >= 3); // 20s of speech, 6s cap
});

test("wordsToVtt: no usable words yields null", () => {
  assert.equal(media.wordsToVtt([]), null);
  assert.equal(media.wordsToVtt(null), null);
  assert.equal(media.wordsToVtt([{ type: "spacing", text: " " }]), null);
});

test("transcriptFrom: finds words in a top-level object, resultJson string, or response", () => {
  const words = [{ type: "word", text: "hi", start: 0, end: 1 }];
  assert.deepEqual(media.transcriptFrom({ words, text: "hi" }).words, words);
  assert.deepEqual(media.transcriptFrom({ resultJson: JSON.stringify({ words, text: "hi" }) }).words, words);
  assert.deepEqual(media.transcriptFrom({ response: { words, text: "hi" } }).words, words);
});

test("transcriptFrom: falls back to plain text, and returns null when empty", () => {
  assert.deepEqual(media.transcriptFrom({ text: "just text" }), { words: null, text: "just text" });
  assert.equal(media.transcriptFrom({}), null);
  assert.equal(media.transcriptFrom(null), null);
});
