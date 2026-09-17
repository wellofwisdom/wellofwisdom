// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

// Helpers
function clozeContent(over = {}) {
  return {
    text: "The capital of France is [[a]] and of Italy is [[b]]",
    kind: "cloze",
    blanks: [
      { id: "a", accept: ["Paris"] },
      { id: "b", accept: ["Rome"] },
    ],
    ...over,
  };
}

function numberlineContent(over = {}) {
  return {
    prompt: "Place 3 on the line",
    kind: "numberline",
    min: 0,
    max: 10,
    step: 1,
    answer: 3,
    tolerance: 0.5,
    ...over,
  };
}

function fractionContent(over = {}) {
  return {
    prompt: "Shade one half",
    kind: "fraction",
    model: "bar",
    parts: 4,
    answer: { numerator: 1, denominator: 2 },
    ...over,
  };
}

// ---- cloze ----

test("cloze normalize: valid content keeps key", () => {
  const n = exercise.normalize(clozeContent());
  assert.ok(n);
  assert.equal(n.kind, "cloze");
  assert.equal(n.blanks.length, 2);
  assert.deepEqual(n.blanks[0].accept, ["Paris"]);
});

test("cloze normalize: needs text with markers", () => {
  assert.equal(exercise.normalize({ kind: "cloze", text: "", blanks: [{ id: "a", accept: ["x"] }] }), null);
  assert.equal(exercise.normalize({ kind: "cloze", text: "no markers here", blanks: [{ id: "a", accept: ["x"] }] }), null);
});

test("cloze normalize: empty accept leaves key absent", () => {
  const n = exercise.normalize({ text: "hi [[a]]", kind: "cloze", blanks: [{ id: "a" }] });
  assert.ok(n);
  assert.equal(n.blanks[0].accept, undefined);
});

test("cloze normalize: numeric blank must have parsable accept", () => {
  assert.equal(exercise.normalize({ text: "num [[a]]", kind: "cloze", blanks: [{ id: "a", accept: ["banana"], numeric: true }] }), null);
  const n = exercise.normalize({ text: "num [[a]]", kind: "cloze", blanks: [{ id: "a", accept: ["1/2"], numeric: true }] });
  assert.ok(n);
});

test("cloze normalize: too many markers", () => {
  const text = Array.from({ length: 11 }, (_, i) => `[[b${i}]]`).join(" ");
  assert.equal(exercise.normalize({ text, kind: "cloze", blanks: [] }), null);
});

test("cloze problem: text markers and answer checks", () => {
  assert.equal(exercise.problem({ kind: "cloze", text: "", blanks: [] }), "text_required");
  assert.equal(exercise.problem({ kind: "cloze", text: "no markers", blanks: [{ id: "a", accept: ["x"] }] }), "blanks_required");
  assert.equal(exercise.problem({ kind: "cloze", text: "hi [[a]]", blanks: [] }), "answer_required");
  assert.equal(exercise.problem({ kind: "cloze", text: "hi [[a]]", blanks: [{ id: "a", accept: [] }] }), "answer_required");
  assert.equal(exercise.problem(clozeContent()), null);
});

test("cloze problem: numeric accept must be parsable", () => {
  assert.equal(exercise.problem({ text: "x [[a]]", kind: "cloze", blanks: [{ id: "a", accept: ["oops"], numeric: true }] }), "answer_invalid");
});

test("cloze problem: too many choices per blank", () => {
  const many = ["a", "b", "c", "d", "e", "f", "g"];
  assert.equal(exercise.problem({ text: "hi [[a]]", kind: "cloze", blanks: [{ id: "a", accept: ["x"], choices: many }] }), "too_many_choices");
});

test("cloze strip: no key field survives learner projection", () => {
  const n = exercise.normalize({ text: "Fill [[a]] and [[b]]", kind: "cloze", blanks: [{ id: "a", accept: ["0.5"], choices: ["0.5", "other"], numeric: true }, { id: "b", accept: ["another secret"] }] });
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  const json = JSON.stringify(pub);
  assert.ok(!("accept" in (pub.content.blanks[0] || {})), "accept leaked in first blank");
  assert.ok(!("accept" in (pub.content.blanks[1] || {})), "accept leaked in second blank");
  assert.doesNotMatch(json, /another secret/);
  assert.ok(Array.isArray(pub.content.blanks) && pub.content.blanks.length === 2, "blanks must survive");
  assert.ok(pub.content.blanks[0].choices, "choices must survive");
  assert.equal(pub.content.blanks[0].numeric, true, "numeric flag must survive");
});

test("cloze strip: answer key absent, text and blanks id survive", () => {
  const n = exercise.normalize(clozeContent());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.equal(pub.content.text, n.text);
  assert.ok(!JSON.stringify(pub).includes("Paris"));
});

test("cloze grading: case and space insensitive", () => {
  const item = { kind: "cloze", text: "a [[x]]", blanks: [{ id: "x", accept: ["Hello World", "hi"] }] };
  assert.deepEqual(grade.gradeExercise(item, { x: "hello   world" }), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, { x: "  HI " }), { correct: true, score: 1 });
  assert.equal(grade.gradeExercise(item, { x: "bye" }).correct, false);
});

test("cloze grading: numeric with tolerance and fraction parsing", () => {
  const item = { kind: "cloze", text: "val [[n]]", blanks: [{ id: "n", accept: ["1/2"], numeric: true }] };
  assert.equal(grade.gradeExercise(item, { n: "0.5" }).correct, true);
  assert.equal(grade.gradeExercise(item, { n: " 1 / 2 " }).correct, true);
  assert.equal(grade.gradeExercise(item, { n: "0.51" }).correct, false);
  // existing tolerance: 0.5 * 0.005 = 0.0025 -> clamp to 0.01, so 0.509 passes, 0.52 fails
  assert.equal(grade.gradeExercise(item, { n: "0.509" }).correct, true);
});

test("cloze grading: partial scores across multiple blanks", () => {
  const item = { kind: "cloze", text: "[[a]] and [[b]] and [[c]]", blanks: [{ id: "a", accept: ["one"] }, { id: "b", accept: ["two"] }, { id: "c", accept: ["three"] }] };
  const twoOfThree = grade.gradeExercise(item, { a: "one", b: "wrong", c: "three" });
  assert.equal(twoOfThree.correct, false);
  assert.equal(twoOfThree.score, 2 / 3);
  assert.deepEqual(grade.gradeExercise(item, { a: "one", b: "two", c: "three" }), { correct: true, score: 1 });
  const none = grade.gradeExercise(item, { a: "x", b: "y", c: "z" });
  assert.equal(none.correct, false);
  assert.equal(none.score, 0);
});

test("cloze grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "cloze", text: "hi [[a]]", blanks: [{ id: "a" }] }, { a: "x" }), null);
  assert.equal(grade.gradeExercise({ kind: "cloze", text: "hi [[a]]", blanks: [] }, { a: "x" }), null);
});

test("cloze grading: empty or wrong type learner answer is false not null", () => {
  const item = { kind: "cloze", text: "hi [[a]]", blanks: [{ id: "a", accept: ["yes"] }] };
  assert.equal(grade.gradeExercise(item, {}).correct, false);
  assert.equal(grade.gradeExercise(item, null).correct, false);
  assert.equal(grade.gradeExercise(item, []).correct, false);
});

test("cloze publish gating: missing accept is counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { text: "hi [[a]]", kind: "cloze", blanks: [{ id: "a" }] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: clozeContent() }]), 0);
});

// ---- numberline ----

test("numberline normalize: valid", () => {
  const n = exercise.normalize(numberlineContent());
  assert.ok(n);
  assert.equal(n.kind, "numberline");
  assert.equal(n.answer, 3);
  assert.equal(n.tolerance, 0.5);
  assert.equal(n.min, 0);
  assert.equal(n.max, 10);
});

test("numberline normalize: needs prompt", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "numberline", min: 0, max: 10, answer: 3 }), null);
});

test("numberline normalize: needs range and answer", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "numberline", min: 10, max: 0, answer: 3 }), null);
  assert.equal(exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10 }), null);
});

test("numberline normalize: default tolerance and labels", () => {
  const n = exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10, answer: 5 });
  assert.ok(n);
  assert.ok(Number.isFinite(n.tolerance));
  const withLabels = exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10, answer: 5, labels: ["0", "10"] });
  assert.ok(withLabels);
  assert.deepEqual(withLabels.labels, ["0", "10"]);
});

test("numberline normalize: step validation", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10, step: 0, answer: 5 }), null);
  assert.equal(exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10, step: -1, answer: 5 }), null);
});

test("numberline problem: prompt range and answer checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "numberline", min: 0, max: 10, answer: 3 }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "numberline", min: 10, max: 0, answer: 3 }), "range_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "numberline", min: 0, max: 10 }), "answer_required");
  assert.equal(exercise.problem(numberlineContent()), null);
});

test("numberline problem: tolerance and step invalid", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "numberline", min: 0, max: 10, answer: 3, tolerance: -1 }), "tolerance_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "numberline", min: 0, max: 10, step: 0, answer: 3 }), "step_invalid");
});

test("numberline strip: keys are stripped, rendered shape survives", () => {
  const n = exercise.normalize({ prompt: "p", kind: "numberline", min: 0, max: 10, step: 2, labels: ["a", "b"], answer: 4, tolerance: 0.3 });
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  const json = JSON.stringify(pub);
  assert.ok(!("answer" in pub.content), "answer leaked");
  assert.ok(!("tolerance" in pub.content), "tolerance leaked");
  assert.equal(pub.content.prompt, "p");
  assert.equal(pub.content.min, 0);
  assert.equal(pub.content.max, 10);
  assert.equal(pub.content.step, 2);
  assert.ok(Array.isArray(pub.content.labels), "labels must survive");
  assert.doesNotMatch(json, /"tolerance"/);
});

test("numberline strip: answer key fields are not in public text", () => {
  const n = exercise.normalize(numberlineContent());
  assert.ok(n);
  const text = share.courseText({
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [{ type: "exercise", position: 0, content: n }] }] }],
  });
  assert.doesNotMatch(text, /tolerance/);
});

test("numberline grading: within tolerance correct", () => {
  const item = { kind: "numberline", prompt: "p", min: 0, max: 10, step: 1, answer: 5, tolerance: 0.5 };
  assert.equal(grade.gradeExercise(item, 5.3).correct, true);
  assert.equal(grade.gradeExercise(item, 5.3).score, 1);
  assert.equal(grade.gradeExercise(item, 5.6).correct, false);
  assert.equal(grade.gradeExercise(item, 5.6).score, 0);
});

test("numberline grading: boundary is inside", () => {
  const item = { kind: "numberline", prompt: "p", min: 0, max: 10, answer: 5, tolerance: 0.5 };
  assert.equal(grade.gradeExercise(item, 5.5).correct, true);
  assert.equal(grade.gradeExercise(item, 4.5).correct, true);
});

test("numberline grading: fractional answer via string", () => {
  const item = { kind: "numberline", prompt: "p", min: 0, max: 1, answer: 0.5, tolerance: 0.05 };
  assert.equal(grade.gradeExercise(item, "1/2").correct, true);
  assert.equal(grade.gradeExercise(item, "3/4").correct, false);
});

test("numberline grading: no key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "numberline", prompt: "p", min: 0, max: 10, answer: undefined, tolerance: 0.5 }, 5), null);
});

test("numberline grading: non numeric learner answer is wrong", () => {
  const item = { kind: "numberline", prompt: "p", min: 0, max: 10, answer: 5, tolerance: 0.5 };
  assert.equal(grade.gradeExercise(item, "banana").correct, false);
  assert.equal(grade.gradeExercise(item, null).correct, false);
});

test("numberline publish gating: missing answer is counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "numberline", min: 0, max: 10 } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: numberlineContent() }]), 0);
});

// ---- fraction ----

test("fraction normalize: valid bar model", () => {
  const n = exercise.normalize(fractionContent());
  assert.ok(n);
  assert.equal(n.kind, "fraction");
  assert.equal(n.parts, 4);
  assert.deepEqual(n.answer, { numerator: 1, denominator: 2 });
});

test("fraction normalize: circle model and exact flag", () => {
  const n = exercise.normalize({ prompt: "p", kind: "fraction", model: "circle", parts: 8, answer: { numerator: 3, denominator: 4 }, exact: true });
  assert.ok(n);
  assert.equal(n.model, "circle");
  assert.equal(n.exact, true);
});

test("fraction normalize: needs prompt and valid parts", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "fraction", parts: 4, answer: { numerator: 1, denominator: 2 } }), null);
  assert.equal(exercise.normalize({ prompt: "p", kind: "fraction", parts: 1, answer: { numerator: 1, denominator: 2 } }), null);
  assert.equal(exercise.normalize({ prompt: "p", kind: "fraction", parts: 4 }), null);
});

test("fraction normalize: bad fraction", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "fraction", parts: 4, answer: { numerator: 5, denominator: 2 } }), null);
  assert.equal(exercise.normalize({ prompt: "p", kind: "fraction", parts: 4, answer: { numerator: 1, denominator: 0 } }), null);
});

test("fraction normalize: exact flag is boolean only", () => {
  const bad = exercise.normalize({ prompt: "p", kind: "fraction", parts: 4, answer: { numerator: 1, denominator: 2 }, exact: "yes" });
  assert.ok(!bad || bad.exact !== "yes");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", parts: 4, answer: { numerator: 1, denominator: 2 }, exact: "yes" }), "exact_invalid");
});

test("fraction problem: prompt parts answer model checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "fraction", parts: 4, answer: { numerator: 1, denominator: 2 } }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", answer: { numerator: 1, denominator: 2 } }), "parts_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", parts: 30, answer: { numerator: 1, denominator: 2 } }), "parts_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", parts: 4 }), "answer_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", parts: 4, answer: { numerator: 5, denominator: 2 } }), "answer_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "fraction", model: "hex", parts: 4, answer: { numerator: 1, denominator: 2 } }), "model_invalid");
  assert.equal(exercise.problem(fractionContent()), null);
});

test("fraction strip: answer does not leak, shape survives", () => {
  const n = exercise.normalize({ prompt: "Shade half", kind: "fraction", model: "bar", parts: 6, answer: { numerator: 1, denominator: 2 }, exact: true });
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  const json = JSON.stringify(pub);
  assert.ok(!("answer" in pub.content), "answer leaked");
  assert.ok(!json.includes("numerator"));
  assert.ok(!json.includes("denominator"));
  assert.equal(pub.content.prompt, "Shade half");
  assert.equal(pub.content.parts, 6);
  assert.equal(pub.content.model, "bar");
  assert.equal(pub.content.exact, true);
  const n2 = exercise.normalize(fractionContent());
  const pub2 = share.publicItem({ type: "exercise", position: 0, content: n2 });
  assert.ok(!("exact" in pub2.content) || pub2.content.exact !== true, "non exact should not leak exact flag as true");
});

test("fraction grading: equivalent fraction is correct", () => {
  const item = { kind: "fraction", prompt: "p", model: "bar", parts: 4, answer: { numerator: 1, denominator: 2 } };
  assert.equal(grade.gradeExercise(item, { shaded: [0, 1] }).correct, true);
  assert.equal(grade.gradeExercise(item, { shaded: [0, 1] }).score, 1);
  // 2/4 equals 1/2 on a 4 part bar, but also 3/6 would be shown as 2 shaded on 4.
  // Different denominator with same visual split is still correct because ratio matches
  const item6 = { kind: "fraction", prompt: "p", parts: 6, answer: { numerator: 1, denominator: 2 } };
  assert.equal(grade.gradeExercise(item6, { shaded: [0, 1, 2] }).correct, true);
  // wrong count
  assert.equal(grade.gradeExercise(item, { shaded: [0] }).correct, false);
  assert.equal(grade.gradeExercise(item, { shaded: [0] }).score, 0);
});

test("fraction grading: exact requires exact count", () => {
  const item = { kind: "fraction", prompt: "p", parts: 4, answer: { numerator: 1, denominator: 4 }, exact: true };
  assert.equal(grade.gradeExercise(item, { shaded: [0] }).correct, true);
  assert.equal(grade.gradeExercise(item, { shaded: [0, 1] }).correct, false);
  // when exact and denominator does not divide parts cleanly, no shaded set can be exact
  const odd = { kind: "fraction", prompt: "p", parts: 4, answer: { numerator: 1, denominator: 3 }, exact: true };
  assert.equal(grade.gradeExercise(odd, { shaded: [0, 1] }).correct, false);
});

test("fraction grading: invalid shaded is wrong", () => {
  const item = { kind: "fraction", prompt: "p", parts: 4, answer: { numerator: 1, denominator: 2 } };
  assert.equal(grade.gradeExercise(item, { shaded: [0, 10] }).correct, false);
  assert.equal(grade.gradeExercise(item, { shaded: [0, 0] }).correct, false);
  assert.equal(grade.gradeExercise(item, null).correct, false);
});

test("fraction grading: array and object answer shapes", () => {
  const item = { kind: "fraction", prompt: "p", parts: 8, answer: { numerator: 3, denominator: 4 } };
  assert.equal(grade.gradeExercise(item, [0, 1, 2, 3, 4, 5]).correct, true);
  assert.equal(grade.gradeExercise(item, { shaded: [0, 1, 2, 3, 4, 5] }).correct, true);
});

test("fraction grading: no key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "fraction", prompt: "p", parts: 4, answer: null }, { shaded: [0] }), null);
});

test("fraction publish gating: missing answer is counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "fraction", parts: 4 } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: fractionContent() }]), 0);
});

// ---- hints and cross checks ----

test("hints still work on cnf kinds", () => {
  const n = exercise.normalize({ text: "hi [[a]]", kind: "cloze", blanks: [{ id: "a", accept: ["x"] }], hints: ["h1", "h2"] });
  assert.ok(n);
  assert.deepEqual(n.hints, ["h1", "h2"]);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.deepEqual(pub.content.hints, ["h1", "h2"]);
  assert.ok(!("accept" in pub.content.blanks[0]));
});

test("fraction courseText does not leak answer", () => {
  const n = exercise.normalize(fractionContent());
  assert.ok(n);
  const text = share.courseText({
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [{ type: "exercise", position: 0, content: n }] }] }],
  });
  assert.doesNotMatch(text, /numerator/);
});
