// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { gradeExercise, youtubeId, safeSourceUrl, htmlToText } = require("./grade");

test("grading: mcq right, wrong, and invalid answers", () => {
  const ex = { kind: "mcq", choices: [{ id: "c1", text: "1/2" }, { id: "c2", text: "1/4" }], answer: "c1" };
  assert.equal(gradeExercise(ex, "c1"), true);
  assert.equal(gradeExercise(ex, "c2"), false);
  assert.equal(gradeExercise(ex, "c99"), false); // not a real choice
  assert.equal(gradeExercise(ex, null), false);
});

test("grading: numeric with tolerance, currency, fractions, mixed numbers", () => {
  const ex = { kind: "numeric", answer: 3.5 };
  assert.equal(gradeExercise(ex, "3.5"), true);
  assert.equal(gradeExercise(ex, "$3.50"), true);
  assert.equal(gradeExercise(ex, "3.51"), true); // within 0.5%
  assert.equal(gradeExercise(ex, "4"), false);
  assert.equal(gradeExercise(ex, "banana"), false);
  assert.equal(gradeExercise(ex, ""), false);
  // fraction answers: kids type these constantly
  const frac = { kind: "numeric", answer: 0.625 };
  assert.equal(gradeExercise(frac, "5/8"), true);
  assert.equal(gradeExercise(frac, "10/16"), true);
  assert.equal(gradeExercise(frac, "5/9"), false);
  assert.equal(gradeExercise(frac, "1 5/8"), false); // 1.625, not 0.625
  const mixed = { kind: "numeric", answer: 1.75 };
  assert.equal(gradeExercise(mixed, "1 3/4"), true);
  assert.equal(gradeExercise(mixed, "7/4"), true);
  assert.equal(gradeExercise(frac, "5/0"), false); // no div-by-zero surprises
});

test("grading: text exercises are self-check (null)", () => {
  assert.equal(gradeExercise({ kind: "text", answer: "model" }, "anything"), null);
});

test("youtube ids: bare, watch, share, shorts, and garbage", () => {
  assert.equal(youtubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2s"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("not a url"), null);
});

test("safeSourceUrl: blocks private hosts and non-http schemes", () => {
  assert.ok(safeSourceUrl("https://example.com/page"));
  assert.equal(safeSourceUrl("http://localhost:3000/x"), null);
  assert.equal(safeSourceUrl("http://127.0.0.1/x"), null);
  assert.equal(safeSourceUrl("http://192.168.1.5/x"), null);
  assert.equal(safeSourceUrl("http://172.20.1.5/x"), null);
  assert.equal(safeSourceUrl("file:///etc/passwd"), null);
  assert.equal(safeSourceUrl("not a url"), null);
});

test("htmlToText strips scripts, styles, tags, entities", () => {
  const out = htmlToText('<style>.x{}</style><p>Hello <b>world</b></p><script>alert(1)</script>&amp; more');
  assert.match(out, /Hello world/);
  assert.doesNotMatch(out, /alert/);
  assert.match(out, /& more/);
});
