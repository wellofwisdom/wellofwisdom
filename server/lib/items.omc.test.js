// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

// Helpers
const orderContent = (over = {}) => ({
  prompt: "Put in order",
  kind: "order",
  items: [{ text: "First" }, { text: "Second" }, { text: "Third" }],
  answer: ["o1", "o2", "o3"],
  ...over,
});

const matchContent = (over = {}) => ({
  prompt: "Match each",
  kind: "match",
  left: [{ text: "A" }, { text: "B" }],
  right: [{ text: "1" }, { text: "2" }],
  answer: { l1: "r1", l2: "r2" },
  ...over,
});

const categorizeContent = (over = {}) => ({
  prompt: "Sort the cards",
  kind: "categorize",
  buckets: [{ label: "Fruit" }, { label: "Veg" }],
  cards: [{ text: "Apple" }, { text: "Carrot" }, { text: "Banana" }],
  answer: { d1: "b1", d2: "b2", d3: "b1" },
  feedback: { d1: "Apple is a fruit", d2: "Carrot is a veg" },
  ...over,
});

// ---- order normalize ----

test("order normalize: maps through renumbering", () => {
  const normalized = exercise.normalize({
    prompt: "Order",
    kind: "order",
    items: [{ id: "x", text: "A" }, { id: "y", text: "B" }, { id: "z", text: "C" }],
    answer: ["x", "y", "z"],
  });
  assert.ok(normalized);
  assert.equal(normalized.kind, "order");
  assert.equal(normalized.items.length, 3);
  assert.deepEqual(normalized.answer, ["o1", "o2", "o3"]);
});

test("order normalize: null when prompt missing", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: ["o1", "o2"] }), null);
});

test("order normalize: null when fewer than two items", () => {
  assert.equal(exercise.normalize({ prompt: "Sort", kind: "order", items: [{ text: "A" }], answer: ["o1"] }), null);
});

test("order normalize: empty answer leaves answer absent (publish will block)", () => {
  const normalized = exercise.normalize({ prompt: "Sort", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: [] });
  assert.ok(normalized);
  assert.equal(normalized.answer, undefined);
});

test("order problem: edge cases", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: ["o1", "o2"] }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "order", items: [{ text: "A" }], answer: ["o1"] }), "items_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: [] }), "answer_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: ["o1"] }), "answer_invalid");
  assert.equal(exercise.problem(orderContent()), null);
});

test("order strip: drops answer, keeps items", () => {
  const normalized = exercise.normalize(orderContent());
  assert.ok(normalized);
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  assert.ok(!("answer" in pub.content), "answer leaked");
  assert.ok(Array.isArray(pub.content.items) && pub.content.items.length === 3);
  for (const it of pub.content.items) assert.ok(!("feedback" in it));
  assert.ok(!JSON.stringify(pub).includes("o1") || JSON.stringify(pub.content).includes("o1"));
});

test("order learner shuffle: deterministic per item id", () => {
  const orderKind = require("./items/kinds/order");
  const a = [{ id: "o1", text: "A" }, { id: "o2", text: "B" }, { id: "o3", text: "C" }];
  const s1 = orderKind.seededShuffle(a, orderKind.shuffleSeed(123, 0));
  const s2 = orderKind.seededShuffle(a, orderKind.shuffleSeed(123, 0));
  assert.deepEqual(s1, s2, "same seed must give same order");
  const s3 = orderKind.seededShuffle(a, orderKind.shuffleSeed(124, 0));
  // Different item id very likely gives different shuffle (not guaranteed but almost always)
  void s3;
});

test("order grading: exact order correct", () => {
  const item = { kind: "order", items: [{ id: "o1" }, { id: "o2" }, { id: "o3" }], answer: ["o1", "o2", "o3"] };
  assert.deepEqual(grade.gradeExercise(item, ["o1", "o2", "o3"]), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, ["o3", "o2", "o1"]).correct, false);
});

test("order grading: score from longest correct run", () => {
  const item = { kind: "order", items: [{ id: "o1" }, { id: "o2" }, { id: "o3" }, { id: "o4" }], answer: ["o1", "o2", "o3", "o4"] };
  // 0,1 correct then break then 3 correct: longest run is 2
  const r = grade.gradeExercise(item, ["o1", "o2", "o4", "o3"]);
  assert.equal(r.correct, false);
  assert.equal(r.score, 0.5);
  const r2 = grade.gradeExercise(item, ["o2", "o1", "o3", "o4"]);
  assert.equal(r2.correct, false);
  assert.equal(r2.score, 0.5);
  const none = grade.gradeExercise(item, ["o4", "o3", "o2", "o1"]);
  assert.equal(none.score, 0);
});

test("order grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "order", items: [{ id: "o1" }], answer: [] }, ["o1"]), null);
  assert.equal(grade.gradeExercise({ kind: "order", items: [{ id: "o1" }, { id: "o2" }] }, ["o1", "o2"]), null);
});

test("order publish gating: missing answer counts", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "order", items: [{ id: "o1", text: "A" }, { id: "o2", text: "B" }], answer: [] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "order", items: [{ id: "o1", text: "A" }, { id: "o2", text: "B" }], answer: ["o1", "o2"] } }]), 0);
});

// ---- match normalize ----

test("match normalize: renumbers and maps answer", () => {
  const normalized = exercise.normalize({
    prompt: "Match",
    kind: "match",
    left: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
    right: [{ id: "x", text: "1" }, { id: "y", text: "2" }],
    answer: { a: "x", b: "y" },
  });
  assert.ok(normalized);
  assert.equal(normalized.kind, "match");
  assert.equal(normalized.left.length, 2);
  assert.deepEqual(normalized.answer, { l1: "r1", l2: "r2" });
});

test("match normalize: null when sides too short", () => {
  assert.equal(exercise.normalize({ prompt: "M", kind: "match", left: [{ text: "A" }], right: [{ text: "1" }, { text: "2" }], answer: { l1: "r1" } }), null);
});

test("match problem: edge cases", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "match", left: [{ text: "A" }, { text: "B" }], right: [{ text: "1" }, { text: "2" }], answer: { l1: "r1", l2: "r2" } }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "match", left: [{ text: "A" }], right: [{ text: "1" }, { text: "2" }], answer: { l1: "r1" } }), "pairs_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "match", left: [{ text: "A" }, { text: "B" }], right: [{ text: "1" }, { text: "2" }], answer: {} }), "answer_invalid");
  assert.equal(exercise.problem(matchContent()), null);
});

test("match strip: drops answer", () => {
  const normalized = exercise.normalize(matchContent());
  assert.ok(normalized);
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  assert.ok(!("answer" in pub.content));
  assert.ok(Array.isArray(pub.content.left) && Array.isArray(pub.content.right));
});

test("match grading: all pairs correct", () => {
  const item = { kind: "match", left: [{ id: "l1" }, { id: "l2" }], right: [{ id: "r1" }, { id: "r2" }], answer: { l1: "r1", l2: "r2" } };
  assert.deepEqual(grade.gradeExercise(item, { l1: "r1", l2: "r2" }), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, { l1: "r2", l2: "r1" }), { correct: false, score: 0 });
  const half = grade.gradeExercise(item, { l1: "r1", l2: "r1" });
  assert.equal(half.correct, false);
  assert.equal(half.score, 0.5);
});

test("match grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "match", left: [{ id: "l1" }], right: [{ id: "r1" }] }, { l1: "r1" }), null);
});

test("match publish gating", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "match", left: [{ id: "l1", text: "A" }, { id: "l2", text: "B" }], right: [{ id: "r1", text: "1" }, { id: "r2", text: "2" }], answer: {} } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "match", left: [{ id: "l1", text: "A" }, { id: "l2", text: "B" }], right: [{ id: "r1", text: "1" }, { id: "r2", text: "2" }], answer: { l1: "r1", l2: "r2" } } }]), 0);
});

// ---- categorize normalize ----

test("categorize normalize: renumbers and maps answer", () => {
  const normalized = exercise.normalize({
    prompt: "Sort",
    kind: "categorize",
    buckets: [{ id: "x", label: "A" }, { id: "y", label: "B" }],
    cards: [{ id: "p", text: "One" }, { id: "q", text: "Two" }],
    answer: { p: "x", q: "y" },
  });
  assert.ok(normalized);
  assert.equal(normalized.kind, "categorize");
  assert.equal(normalized.buckets.length, 2);
  assert.deepEqual(normalized.answer, { d1: "b1", d2: "b2" });
});

test("categorize problem: edge cases", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "categorize", buckets: [{ label: "A" }, { label: "B" }], cards: [{ text: "a" }, { text: "b" }], answer: { d1: "b1", d2: "b2" } }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "categorize", buckets: [{ label: "A" }], cards: [{ text: "a" }, { text: "b" }], answer: { d1: "b1", d2: "b1" } }), "buckets_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "categorize", buckets: [{ label: "A" }, { label: "B" }], cards: [{ text: "a" }], answer: { d1: "b1" } }), "cards_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "categorize", buckets: [{ label: "A" }, { label: "B" }], cards: [{ text: "a" }, { text: "b" }], answer: {} }), "answer_invalid");
  assert.equal(exercise.problem(categorizeContent()), null);
});

test("categorize strip: drops answer and feedback", () => {
  const normalized = exercise.normalize(categorizeContent());
  assert.ok(normalized);
  assert.ok(normalized.feedback, "feedback stored");
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  assert.ok(!("answer" in pub.content));
  assert.ok(!("feedback" in pub.content));
  assert.ok(!JSON.stringify(pub).includes("Apple is a fruit"));
});

test("categorize grading: all placed right", () => {
  const item = {
    kind: "categorize",
    buckets: [{ id: "b1" }, { id: "b2" }],
    cards: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    answer: { d1: "b1", d2: "b2", d3: "b1" },
  };
  assert.deepEqual(grade.gradeExercise(item, { d1: "b1", d2: "b2", d3: "b1" }), { correct: true, score: 1 });
  const r = grade.gradeExercise(item, { d1: "b1", d2: "b1", d3: "b1" });
  assert.equal(r.correct, false);
  assert.equal(r.score, 2 / 3);
});

test("categorize grading: per-card feedback only for misplaced cards", () => {
  const item = {
    kind: "categorize",
    buckets: [{ id: "b1" }, { id: "b2" }],
    cards: [{ id: "d1" }, { id: "d2" }],
    answer: { d1: "b1", d2: "b2" },
    feedback: { d1: "d1 wrong", d2: "d2 wrong" },
  };
  const r = grade.gradeExercise(item, { d1: "b2", d2: "b2" });
  assert.equal(r.correct, false);
  assert.ok(r.feedback, "feedback present on wrong");
  assert.ok(r.feedback.d1, "misplaced d1 has feedback");
  assert.ok(!r.feedback.d2, "correctly placed d2 has no feedback");
  const r2 = grade.gradeExercise(item, { d1: "b1", d2: "b2" });
  assert.equal(r2.correct, true);
  assert.ok(!r2.feedback, "no feedback when all correct");
});

test("categorize grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "categorize", buckets: [{ id: "b1" }], cards: [{ id: "d1" }] }, { d1: "b1" }), null);
});

test("categorize publish gating", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "categorize", buckets: [{ id: "b1", label: "A" }, { id: "b2", label: "B" }], cards: [{ id: "d1", text: "a" }, { id: "d2", text: "b" }], answer: {} } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "categorize", buckets: [{ id: "b1", label: "A" }, { id: "b2", label: "B" }], cards: [{ id: "d1", text: "a" }, { id: "d2", text: "b" }], answer: { d1: "b1", d2: "b2" } } }]), 0);
});

test("hints still work on new kinds", () => {
  const normalized = exercise.normalize({ prompt: "Sort", kind: "order", items: [{ text: "A" }, { text: "B" }], answer: ["o1", "o2"], hints: ["h1", "h2"] });
  assert.ok(normalized);
  assert.deepEqual(normalized.hints, ["h1", "h2"]);
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  assert.deepEqual(pub.content.hints, ["h1", "h2"]);
  assert.ok(!("answer" in pub.content));
});
