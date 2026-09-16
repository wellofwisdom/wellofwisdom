// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

const multiContent = (over = {}) => ({
  prompt: "Pick all squares",
  kind: "multi",
  choices: [
    { text: "Square A" },
    { text: "Circle" },
    { text: "Square B" },
  ],
  answer: ["c1", "c3"],
  ...over,
});

test("multi normalize: maps answer ids through renumbering", () => {
  const normalized = exercise.normalize(multiContent({ choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }], answer: ["a", "c"] }));
  assert.ok(normalized);
  assert.equal(normalized.kind, "multi");
  assert.equal(normalized.choices.length, 3);
  assert.deepEqual(normalized.answer, ["c1", "c3"]);
});

test("multi normalize: by text when ids are absent on both sides", () => {
  const normalized = exercise.normalize({
    prompt: "Pick squares",
    kind: "multi",
    choices: [{ text: "Square" }, { text: "Circle" }],
    answer: ["Square"],
  });
  assert.ok(normalized);
  assert.deepEqual(normalized.answer, ["c1"]);
});

test("multi normalize: returns null when prompt missing", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: ["c1"] }), null);
});

test("multi normalize: drops without at least two choices", () => {
  assert.equal(exercise.normalize({ prompt: "Pick", kind: "multi", choices: [{ text: "A" }], answer: ["c1"] }), null);
});

test("multi normalize: empty answer leaves answer absent (publish will block it)", () => {
  const normalized = exercise.normalize({ prompt: "Pick", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: [] });
  assert.ok(normalized);
  assert.equal(normalized.answer, undefined);
});

test("multi normalize: filters duplicate ids in answer", () => {
  const normalized = exercise.normalize(multiContent({ answer: ["c1", "c1", "c3"] }));
  assert.ok(normalized);
  assert.deepEqual(normalized.answer, ["c1", "c3"]);
});

test("multi normalize: censures unknown answer id (drops it, so answer absent or partial)", () => {
  const normalized = exercise.normalize(multiContent({ answer: ["c1", "c99"] }));
  assert.ok(normalized);
  assert.equal(normalized.answer, undefined);
});

test("multi problem: blank and too-many checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: ["c1"] }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "multi", choices: [{ text: "A" }], answer: ["c1"] }), "choices_required");
  const six = [1, 2, 3, 4, 5, 6].map((n) => ({ text: `C${n}` }));
  assert.equal(exercise.problem({ prompt: "p", kind: "multi", choices: six, answer: ["c1"] }), "too_many_choices");
  assert.equal(exercise.problem({ prompt: "p", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: [] }), "answer_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: ["c9"] }), "answer_invalid");
  assert.equal(exercise.problem(multiContent()), null);
});

test("multi problem: hints capped at 3", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hints: ["a", "b", "c", "d"] }), "too_many_hints");
  assert.equal(exercise.problem({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hints: ["a", "b", "c"] }), null);
});

test("hint ladder: single hint becomes one-item hints", () => {
  const normalized = exercise.normalize({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hint: "one nudge" });
  assert.ok(normalized);
  assert.deepEqual(normalized.hints, ["one nudge"]);
  assert.equal(normalized.hint, undefined);
});

test("hint ladder: hints array kept, capped at 3", () => {
  const normalized = exercise.normalize({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hints: ["a", "b", "c", "d"] });
  assert.ok(normalized);
  assert.deepEqual(normalized.hints, ["a", "b", "c"]);
});

test("hint ladder: new ladder wins over legacy single hint", () => {
  const normalized = exercise.normalize({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hint: "legacy", hints: ["new"] });
  assert.ok(normalized);
  assert.deepEqual(normalized.hints, ["new"]);
});

test("strip: no key field survives the learner projection", () => {
  const cases = [
    { prompt: "p", kind: "mcq", choices: [{ id: "c1", text: "A", feedback: "bad" }, { id: "c2", text: "B" }], answer: "c1", explanation: "why", hints: ["h1", "h2"] },
    { prompt: "p", kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: ["c1", "c2"], explanation: "why", hints: ["h1"] },
    { prompt: "p", kind: "numeric", answer: 42, explanation: "why", hints: ["h1"] },
    { prompt: "p", kind: "text", answer: "model answer", explanation: "why" },
  ];
  for (const content of cases) {
    const normalized = exercise.normalize(content);
    assert.ok(normalized);
    const stored = { type: "exercise", position: 0, content: normalized };
    const pub = share.publicItem(stored);
    const json = JSON.stringify(pub);
    assert.ok(!("answer" in pub.content), `answer leaked for kind ${content.kind}: ${json}`);
    assert.ok(!("explanation" in pub.content), `explanation leaked for kind ${content.kind}: ${json}`);
    assert.doesNotMatch(json, /why/);
    if (content.kind === "mcq" || content.kind === "multi") {
      assert.ok(pub.content.choices, "choices must survive");
      const leaked = pub.content.choices.some((c) => String(c.text) === normalized.answer || (normalized.answer || []).includes?.(c.id));
      void leaked;
    }
    if (normalized.hints) {
      assert.ok(pub.content.hints, "hints must survive the projection");
      assert.ok(!("hint" in pub.content), "legacy single hint key must not appear");
    }
    // choice feedback is an answer-key signal: it stays stored but never survives strip
    if (content.choices && content.choices.some((c) => c.feedback)) {
      for (const ch of pub.content.choices) assert.ok(!("feedback" in ch), "choice feedback leaked to learner projection");
    }
  }
});

test("strip: hints from a legacy single hint still appear as a one-item ladder", () => {
  const normalized = exercise.normalize({ prompt: "p", kind: "mcq", choices: [{ text: "A" }, { text: "B" }], answer: "c1", hint: "legacy hint" });
  assert.ok(normalized);
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  assert.deepEqual(pub.content.hints, ["legacy hint"]);
  assert.ok(!("answer" in pub.content));
});

test("grading: multi correct when sets match exactly, false otherwise", () => {
  const item = { kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }, { id: "c3", text: "C" }], answer: ["c1", "c3"] };
  const exact = grade.gradeExercise(item, ["c1", "c3"]);
  assert.equal(exact.correct, true);
  assert.equal(exact.score, 1);
  const exactUnordered = grade.gradeExercise(item, ["c3", "c1"]);
  assert.equal(exactUnordered.correct, true);
  assert.equal(exactUnordered.score, 1);
  const oneMissing = grade.gradeExercise(item, ["c1"]);
  assert.equal(oneMissing.correct, false);
  assert.ok(oneMissing.score > 0 && oneMissing.score < 1);
  const oneWrong = grade.gradeExercise(item, ["c1", "c2"]);
  assert.equal(oneWrong.correct, false);
  assert.ok(oneWrong.score < 1);
  const none = grade.gradeExercise(item, []);
  assert.equal(none.correct, false);
  assert.ok(none.score < 1 && none.score > 0);
  const allWrong = grade.gradeExercise(item, ["c2"]);
  assert.equal(allWrong.correct, false);
});

test("grading: multi partial score is the share of correct decisions", () => {
  // 4 choices: answer c1,c2. Learner picks c1 only: decisions c1 correct, c2 missed, c3 correct (not picked), c4 correct (not picked) = 3 of 4.
  const item = { kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }, { id: "c3", text: "C" }, { id: "c4", text: "D" }], answer: ["c1", "c2"] };
  const r = grade.gradeExercise(item, ["c1"]);
  assert.equal(r.correct, false);
  assert.equal(r.score, 0.75);
  const noneRight = grade.gradeExercise(item, ["c3"]);
  assert.equal(noneRight.score, 0.25);
});

test("grading: multi with no usable key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "multi", choices: [{ id: "c1", text: "A" }], answer: [] }, ["c1"]), null);
  assert.equal(grade.gradeExercise({ kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }] }, ["c1"]), null);
});

test("grading: multi deduplicates and ignores invalid ids in the learner answer", () => {
  const item = { kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: ["c1"] };
  const r = grade.gradeExercise(item, ["c1", "c1", "c99"]);
  assert.equal(r.correct, true);
  assert.equal(r.score, 1);
});

test("choice feedback on mcq: stored but does not survive strip; reveal carries picked-only feedback", () => {
  const normalized = exercise.normalize({ prompt: "p", kind: "mcq", choices: [{ text: "A", feedback: "because A is wrong" }, { text: "B", feedback: "nice" }], answer: "c1" });
  assert.ok(normalized);
  assert.equal(normalized.choices[0].feedback, "because A is wrong");
  assert.equal(normalized.choices[1].feedback, "nice");
  const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
  for (const ch of pub.content.choices) assert.ok(!("feedback" in ch), "feedback leaked in public projection");
  assert.ok(!("answer" in pub.content));
  const js = JSON.stringify(pub);
  assert.doesNotMatch(js, /because A is wrong/);
  assert.doesNotMatch(js, /nice/);
  // the server still has it and will return only the picked choice's feedback in the attempt reveal;
  // a direct check here that the stored content still holds it
  assert.equal(normalized.choices[0].feedback, "because A is wrong");
});

test("video choice feedback: stored but does not survive strip or public text; reveal carries picked-only", () => {
  const video = require("./items/video");
  const normalized = video.normalize({ youtubeId: "dQw4w9WgXcQ", questions: [{ prompt: "q", choices: [{ text: "A", feedback: "try again" }, { text: "B", feedback: "great" }], answer: "c2" }] });
  assert.ok(normalized);
  assert.equal(normalized.questions[0].choices[0].feedback, "try again");
  assert.equal(normalized.questions[0].choices[1].feedback, "great");
  const pub = share.publicItem({ type: "video", position: 0, content: normalized });
  for (const ch of pub.content.questions[0].choices) assert.ok(!("feedback" in ch), "video choice feedback leaked");
  assert.ok(!("answer" in pub.content.questions[0]));
  assert.doesNotMatch(JSON.stringify(pub), /try again/);
  const text = share.courseText({
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [{ type: "video", position: 0, content: normalized }] }] }],
  });
  assert.doesNotMatch(text, /try again/);
  assert.doesNotMatch(text, /great/);
});

test("publish gating: multi empty answer is a missing key", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: [] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: ["c1"] } }]), 0);
  // exercise runner path: what a lesson_items row without an answer would look like
  const normalized = exercise.normalize({ prompt: "p", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: [] });
  assert.ok(normalized);
  assert.equal(exercise.problem({ prompt: "p", kind: "multi", choices: [{ text: "A" }, { text: "B" }], answer: [] }), "answer_required");
  assert.equal(grade.gradeExercise({ kind: "multi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: [] }, ["c1"]), null);
});

test("hint ladder compat: old single hint still works on old rows", () => {
  const oldRow = { prompt: "p", kind: "mcq", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: "c1", hint: "old one" };
  assert.equal(exercise.problem(oldRow), null);
  const pubOld = share.publicItem({ type: "exercise", position: 0, content: oldRow });
  assert.ok(Array.isArray(pubOld.content.hints) && pubOld.content.hints.length === 1);
  const newRow = { prompt: "p", kind: "mcq", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: "c1", hints: ["first", "second"] };
  assert.equal(exercise.problem(newRow), null);
  const pubNew = share.publicItem({ type: "exercise", position: 0, content: newRow });
  assert.deepEqual(pubNew.content.hints, ["first", "second"]);
});
