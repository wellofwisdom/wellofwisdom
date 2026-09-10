// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const qa = require("./videoqa");

const VTT = [
  "WEBVTT",
  "",
  "NOTE this file was generated",
  "",
  "1",
  "00:00:00.000 --> 00:00:04.000",
  "Water boils at one hundred degrees.",
  "",
  "2",
  "00:00:04.000 --> 00:00:09.500",
  "But only at sea level.",
  "",
  "3",
  "00:01:02.250 --> 00:01:07.000",
  "Higher up, it boils cooler.",
  "",
].join("\n");

test("parseVtt: cues come out with their timings, headers and notes do not", () => {
  const cues = qa.parseVtt(VTT);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[1].start, 4);
  assert.equal(cues[2].start, 62.25);
  assert.equal(cues[2].text, "Higher up, it boils cooler.");
});

test("parseVtt: a track with no timings yields nothing rather than junk", () => {
  assert.deepEqual(qa.parseVtt("WEBVTT\n\njust some prose\nwith no cues"), []);
  assert.deepEqual(qa.parseVtt(""), []);
  assert.deepEqual(qa.parseVtt(null), []);
});

test("parseVtt: CRLF, a byte order mark and inline tags are all survivable", () => {
  const cues = qa.parseVtt("﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n<v Ann>hello <b>there</b>\r\n");
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "hello there");
});

test("tsToSec: both stamp shapes, and a refusal for anything else", () => {
  assert.equal(qa.tsToSec("00:00:01.500"), 1.5);
  assert.equal(qa.tsToSec("02:03.000"), 123);
  assert.equal(qa.tsToSec("nonsense"), null);
  assert.equal(qa.tsToSec("00:99:00.000"), null);
});

test("secToClock: minutes and seconds, hours only when there are hours", () => {
  assert.equal(qa.secToClock(0), "0:00");
  assert.equal(qa.secToClock(62.9), "1:02");
  assert.equal(qa.secToClock(3661), "1:01:01");
});

test("transcriptFrom: cues are grouped, and every line keeps its stamp", () => {
  const text = qa.transcriptFrom(qa.parseVtt(VTT));
  assert.match(text, /^\[0:00\] Water boils/);
  assert.match(text, /\[1:02\] Higher up/);
  // The first two cues are within the grouping window, so they share a line.
  assert.equal(text.split("\n").length, 2);
});

test("transcriptFrom: a per-word track does not become thousands of lines", () => {
  const cues = Array.from({ length: 600 }, (_, i) => ({ start: i, end: i + 1, text: `word${i}` }));
  const lines = qa.transcriptFrom(cues).split("\n");
  assert.ok(lines.length <= 41, `expected grouping, got ${lines.length} lines`);
});

test("transcriptFrom: the transcript is capped, so a feature film cannot blow the prompt", () => {
  const cues = Array.from({ length: 5000 }, (_, i) => ({ start: i * 20, end: i * 20 + 5, text: "x".repeat(200) }));
  assert.ok(qa.transcriptFrom(cues).length <= 14000);
});

test("normalizeQuestions: the shape matches an ordinary video question", () => {
  const out = qa.normalizeQuestions(
    { questions: [{ prompt: "What boils?", choices: ["Water", "Sand", "Light"], answerIndex: 0, atSec: 3 }] },
    { endSec: 67 }
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].choices.map((c) => c.id), ["c1", "c2", "c3"]);
  assert.equal(out[0].answer, "c1");
  assert.equal(out[0].atSec, 3);
});

test("normalizeQuestions: an anchor past the end is clamped into the video, not dropped", () => {
  const out = qa.normalizeQuestions(
    { questions: [{ prompt: "P", choices: ["a", "b"], answerIndex: 1, atSec: 99999 }] },
    { endSec: 67 }
  );
  assert.equal(out[0].atSec, 67);
  assert.equal(out[0].answer, "c2");
});

test("normalizeQuestions: an out of range answer index lands on a real choice", () => {
  const out = qa.normalizeQuestions({ questions: [{ prompt: "P", choices: ["a", "b"], answerIndex: 9 }] }, {});
  assert.equal(out[0].answer, "c2");
  assert.ok(!("atSec" in out[0]), "no anchor given, none invented");
});

test("normalizeQuestions: a question with one choice or no prompt is dropped", () => {
  const out = qa.normalizeQuestions({ questions: [
    { prompt: "", choices: ["a", "b"] },
    { prompt: "P", choices: ["only one"] },
    { prompt: "Good", choices: ["a", "b"] },
  ] }, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].prompt, "Good");
});

test("normalizeQuestions: junk in gives an empty list, not a crash", () => {
  for (const junk of [null, undefined, "text", 7, {}]) {
    assert.deepEqual(qa.normalizeQuestions(junk, {}), []);
  }
});

test("normalizeQuestions: only the known fields survive", () => {
  const out = qa.normalizeQuestions(
    { questions: [{ prompt: "P", choices: ["a", "b"], answerIndex: 0, atSec: 5, explanation: "leak", answer: "c2" }] },
    { endSec: 10 }
  );
  assert.deepEqual(Object.keys(out[0]).sort(), ["answer", "atSec", "choices", "prompt"]);
  assert.equal(out[0].answer, "c1", "the answer comes from answerIndex, never from a field the model set");
});

test("rewindTo: lands before the answer, and never before the start", () => {
  assert.equal(qa.rewindTo(60), 60 - qa.REWIND_SEC);
  assert.equal(qa.rewindTo(3), 0);
  assert.equal(qa.rewindTo(null), 0);
});

test("draftQuestions: no usable transcript spends no AI call", async () => {
  const out = await qa.draftQuestions({ vtt: "WEBVTT\n\nnot a cue in sight", title: "T", familyId: 1 });
  assert.equal(out.note, "no_transcript");
  assert.deepEqual(out.questions, []);
});

test("the prompt pins questions to the video and forbids outside knowledge", () => {
  assert.match(qa.SYSTEM, /answerable FROM THE VIDEO/);
  assert.match(qa.SYSTEM, /never point past the end/);
});

// The anchor is only worth writing if it survives the trip: generation, the
// item normalizer, export and import all pass through normalizeItem.
const { normalizeItem } = require("./coursegen");

test("atSec survives the course normalizer, so an anchored question stays anchored", () => {
  const out = normalizeItem({
    type: "video",
    content: {
      youtubeId: "dQw4w9WgXcQ",
      title: "T",
      questions: [{ prompt: "P", choices: [{ id: "c1", text: "a" }, { id: "c2", text: "b" }], answer: "c2", atSec: 91.6 }],
    },
  });
  assert.equal(out.content.questions[0].atSec, 92);
  assert.equal(out.content.questions[0].answer, "c2");
});

test("a nonsense anchor is dropped or clamped rather than stored", () => {
  const mk = (atSec) => normalizeItem({
    type: "video",
    content: {
      youtubeId: "dQw4w9WgXcQ",
      title: "T",
      questions: [{ prompt: "P", choices: [{ id: "c1", text: "a" }, { id: "c2", text: "b" }], answer: "c1", atSec }],
    },
  }).content.questions[0];
  assert.ok(!("atSec" in mk("later")), "a non-number is not an anchor");
  assert.ok(!("atSec" in mk(-5)), "a negative anchor is not an anchor");
  assert.equal(mk(999999).atSec, 86400, "an absurd anchor is clamped to a day");
});
