// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { parseScript, concatMp3, sourceFromRows, MAX_SEGMENTS, SEGMENT_MAX_CHARS } = require("./overview");

test("parseScript: keeps host tags, drops empty lines, collapses whitespace", () => {
  const out = parseScript({
    segments: [
      { host: "a", text: "  What is  a unit?\t" },
      { host: "b", text: "It is the chapter of a course." },
      { host: "a", text: "   " },
      { host: "weird", text: "Defaults to host a." },
    ],
  });
  assert.deepEqual(out, [
    { host: "a", text: "What is a unit?" },
    { host: "b", text: "It is the chapter of a course." },
    { host: "a", text: "Defaults to host a." },
  ]);
});

test("parseScript: caps the number of segments", () => {
  const segments = [];
  for (let i = 0; i < MAX_SEGMENTS + 10; i++) segments.push({ host: "a", text: `line ${i}` });
  assert.equal(parseScript({ segments }).length, MAX_SEGMENTS);
});

test("parseScript: caps each line and the total", () => {
  const long = "x".repeat(SEGMENT_MAX_CHARS * 3);
  const out = parseScript({ segments: [{ host: "a", text: long }, { host: "b", text: "y".repeat(5000) }] });
  assert.equal(out[0].text.length, SEGMENT_MAX_CHARS);
  const total = out.reduce((n, s) => n + s.text.length, 0);
  assert.ok(total <= 3600 + SEGMENT_MAX_CHARS, "total stays near the cap");
});

test("parseScript: tolerates null and shapeless replies", () => {
  assert.deepEqual(parseScript(null), []);
  assert.deepEqual(parseScript({}), []);
  assert.deepEqual(parseScript({ segments: "nope" }), []);
});

function mp3(tag) {
  // ID3v2 header (declaring a zero-length tag body), then frame-ish bytes.
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]), Buffer.from(`${tag}-audio-bytes`)]);
}

test("concatMp3: joins segments and strips tags from everything after the first", () => {
  const out = concatMp3([mp3("first"), mp3("second"), mp3("third")]);
  const s = out.toString();
  assert.ok(s.startsWith("ID3"), "first keeps its header");
  assert.ok(!s.slice(10).includes("ID3"), "later segments lose their ID3 header");
  assert.ok(s.includes("second-audio") && s.includes("third-audio"), "later audio survives, order kept");
});

test("concatMp3: drops a trailing ID3v1 footer on later segments", () => {
  const seg = Buffer.concat([Buffer.from("plain-audio"), Buffer.alloc(128, 0)]);
  seg.write("TAG", seg.length - 128, "latin1");
  const out = concatMp3([Buffer.from("head"), seg]);
  assert.ok(out.toString().startsWith("headplain-audio"), "footer removed, audio kept");
});

test("concatMp3: refuses to build a file from nothing", () => {
  assert.throws(() => concatMp3([]), /overview_no_audio/);
  assert.throws(() => concatMp3([null, Buffer.alloc(0)]), /overview_no_audio/);
});

test("sourceFromRows: one heading per lesson, items flattened in order", () => {
  const rows = [
    { lesson_title: "Maps", summary: "How to read one.", type: "article", content: { title: "Compass rose", body: "North is up." } },
    { lesson_title: "Maps", summary: "How to read one.", type: "exercise", content: { prompt: "Label the compass." } },
    { lesson_title: "Legends", summary: null, type: "project", content: { title: "Draw a map", description: "Of your street." } },
  ];
  const text = sourceFromRows(rows);
  assert.ok(text.includes("Lesson: Maps. How to read one."));
  assert.ok(text.includes("Compass rose: North is up."));
  assert.ok(text.includes("Practice: Label the compass."));
  assert.ok(text.includes("Project: Draw a map. Of your street."));
  assert.equal(text.indexOf("Lesson: Maps"), 0, "lesson heading opens its block");
  assert.ok(text.indexOf("Lesson: Maps. How to read one.") < text.indexOf("Legends"), "lesson order kept");
});

test("sourceFromRows: caps runaway units", () => {
  const rows = [{ lesson_title: "Big", summary: null, type: "article", content: { title: "T", body: "b".repeat(999999) } }];
  assert.ok(sourceFromRows(rows).length <= 8000);
});

test("sourceFromRows: empty input gives empty text", () => {
  assert.equal(sourceFromRows([]), "");
  assert.equal(sourceFromRows(null), "");
});
