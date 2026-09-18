// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

function translateContent(over = {}) {
  return {
    prompt: "Translate to Spanish: My name is Ana.",
    kind: "translate",
    direction: "en_to_es",
    expected: "Me llamo Ana.",
    alternatives: ["Me llamo Ana", "Soy Ana"],
    rubric: "Names self with me llamo or soy, includes a name.",
    ...over,
  };
}

function dialogueContent(over = {}) {
  return {
    prompt: "Greet your neighbour and answer where you live.",
    kind: "dialogue",
    scene: "You meet Sofia at the door. She says: Hola! Como te llamas?",
    turns: 3,
    goals: ["greet back", "give your name", "say where you live"],
    goodEndings: ["used polite form", "asked a question back"],
    ...over,
  };
}

// ---- translate ----

test("translate normalize: valid keeps expected and alternatives", () => {
  const n = exercise.normalize(translateContent());
  assert.ok(n);
  assert.equal(n.kind, "translate");
  assert.equal(n.expected, "Me llamo Ana.");
  assert.deepEqual(n.alternatives, ["Me llamo Ana", "Soy Ana"]);
  assert.equal(n.direction, "en_to_es");
  assert.ok(n.rubric);
});

test("translate normalize: null when prompt or expected missing", () => {
  assert.equal(exercise.normalize({ kind: "translate", prompt: "", expected: "Me llamo Ana." }), null);
  assert.equal(exercise.normalize({ kind: "translate", prompt: "Translate", expected: "" }), null);
  assert.equal(exercise.normalize({ kind: "translate", prompt: "Translate" }), null);
});

test("translate normalize: direction_invalid when bad direction", () => {
  const n = exercise.normalize({ prompt: "p", kind: "translate", expected: "Me llamo Ana.", direction: "fr_to_de" });
  assert.equal(n, null);
});

test("translate problem: prompt_required and expected_required", () => {
  assert.equal(exercise.problem({ kind: "translate", prompt: "", expected: "Me llamo Ana." }), "prompt_required");
  assert.equal(exercise.problem({ kind: "translate", prompt: "Translate", expected: "" }), "expected_required");
  assert.equal(exercise.problem({ kind: "translate", prompt: "Translate", expected: "Me llamo Ana." }), null);
});

test("translate problem: direction_invalid", () => {
  assert.equal(exercise.problem({ kind: "translate", prompt: "p", expected: "hola", direction: "xx" }), "direction_invalid");
  assert.equal(exercise.problem({ kind: "translate", prompt: "p", expected: "hola", direction: "en_to_es" }), null);
  assert.equal(exercise.problem({ kind: "translate", prompt: "p", expected: "hola", direction: "es_to_en" }), null);
});

test("translate strip: expected and alternatives do not leak", () => {
  const n = exercise.normalize(translateContent());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("expected" in pub.content), "expected leaked");
  assert.ok(!("alternatives" in pub.content), "alternatives leaked");
  const json = JSON.stringify(pub);
  assert.ok(!json.includes('"expected"'));
  assert.ok(!json.includes('"alternatives"'));
  assert.equal(pub.content.prompt, "Translate to Spanish: My name is Ana.");
  assert.equal(pub.content.direction, "en_to_es");
  assert.ok(pub.content.rubric);
});

test("translate grading: exact case-insensitive match is correct", () => {
  const item = { kind: "translate", prompt: "p", expected: "Me llamo Ana.", alternatives: ["Soy Ana"] };
  assert.deepEqual(grade.gradeExercise(item, "Me llamo Ana."), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "me llamo ana"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "  Me llamo Ana.  "), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "ME LLAMO ANA"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "Soy Ana"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "soy ana"), { correct: true, score: 1 });
});

test("translate grading: non-matching returns needsReview true", () => {
  const item = { kind: "translate", prompt: "p", expected: "Me llamo Ana.", alternatives: ["Soy Ana"] };
  const r = grade.gradeExercise(item, "Hola Ana");
  assert.equal(r.correct, false);
  assert.equal(r.score, 0);
  assert.equal(r.needsReview, true);
  const r2 = grade.gradeExercise(item, "something else");
  assert.equal(r2.needsReview, true);
});

test("translate grading: empty answer is needsReview", () => {
  const item = { kind: "translate", prompt: "p", expected: "Me llamo Ana." };
  const r = grade.gradeExercise(item, "");
  assert.equal(r.correct, false);
  assert.equal(r.needsReview, true);
});

test("translate grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "translate", prompt: "p" }, "hello"), null);
  assert.equal(grade.gradeExercise({ kind: "translate", prompt: "p", expected: "" }, "hello"), null);
});

test("translate publish gating: missing expected counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "translate" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "translate", expected: "" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: translateContent() }]), 0);
});

// ---- dialogue ----

test("dialogue normalize: valid", () => {
  const n = exercise.normalize(dialogueContent());
  assert.ok(n);
  assert.equal(n.kind, "dialogue");
  assert.equal(n.prompt, dialogueContent().prompt);
  assert.equal(n.scene, dialogueContent().scene);
  assert.equal(n.turns, 3);
  assert.deepEqual(n.goals, ["greet back", "give your name", "say where you live"]);
});

test("dialogue normalize: null when prompt or scene missing", () => {
  assert.equal(exercise.normalize({ kind: "dialogue", prompt: "", scene: "A scene", turns: 3 }), null);
  assert.equal(exercise.normalize({ kind: "dialogue", prompt: "Greet", scene: "", turns: 3 }), null);
  assert.equal(exercise.normalize({ kind: "dialogue", prompt: "Greet" }), null);
});

test("dialogue normalize: turns clamped 1..6", () => {
  assert.equal(exercise.normalize({ kind: "dialogue", prompt: "p", scene: "s", turns: 0 }), null);
  assert.equal(exercise.normalize({ kind: "dialogue", prompt: "p", scene: "s", turns: 7 }), null);
  assert.ok(exercise.normalize({ kind: "dialogue", prompt: "p", scene: "s", turns: 6 }));
  assert.ok(exercise.normalize({ kind: "dialogue", prompt: "p", scene: "s", turns: 1 }));
});

test("dialogue problem: prompt_required and scene_required", () => {
  assert.equal(exercise.problem({ kind: "dialogue", prompt: "", scene: "A scene", turns: 3 }), "prompt_required");
  assert.equal(exercise.problem({ kind: "dialogue", prompt: "Greet", scene: "", turns: 3 }), "scene_required");
  assert.equal(exercise.problem(dialogueContent()), null);
});

test("dialogue problem: turns_invalid", () => {
  assert.equal(exercise.problem({ kind: "dialogue", prompt: "p", scene: "s", turns: 0 }), "turns_invalid");
  assert.equal(exercise.problem({ kind: "dialogue", prompt: "p", scene: "s", turns: 7 }), "turns_invalid");
  assert.equal(exercise.problem({ kind: "dialogue", prompt: "p", scene: "s", turns: 3 }), null);
});

test("dialogue strip: learner projection keeps prompt scene turns goals", () => {
  const n = exercise.normalize(dialogueContent());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.equal(pub.content.prompt, n.prompt);
  assert.equal(pub.content.scene, n.scene);
  assert.equal(pub.content.turns, 3);
  assert.deepEqual(pub.content.goals, n.goals);
  // No answer key to leak - strip should not invent one
  assert.ok(!("answer" in pub.content));
  assert.ok(!("expected" in pub.content));
});

test("dialogue grading: correct when at least turns non-empty replies", () => {
  const item = { kind: "dialogue", prompt: "p", scene: "s", turns: 3 };
  assert.deepEqual(grade.gradeExercise(item, { turns: ["Hola", "Me llamo Ana.", "Vivo en la casa azul."] }), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, { turns: ["Hola Ana", "Vivo aqui", "Hasta luego"] }), { correct: true, score: 1 });
});

test("dialogue grading: partial when fewer than turns replies", () => {
  const item = { kind: "dialogue", prompt: "p", scene: "s", turns: 3 };
  const r = grade.gradeExercise(item, { turns: ["Hola"] });
  assert.equal(r.correct, false);
  assert.equal(r.score, 1 / 3);
  const r2 = grade.gradeExercise(item, { turns: ["Hola", "Me llamo Ana."] });
  assert.equal(r2.score, 2 / 3);
});

test("dialogue grading: false when all turns empty", () => {
  const item = { kind: "dialogue", prompt: "p", scene: "s", turns: 3 };
  assert.equal(grade.gradeExercise(item, { turns: ["", "  ", ""] }).correct, false);
  assert.equal(grade.gradeExercise(item, { turns: [] }).correct, false);
  assert.equal(grade.gradeExercise(item, { turns: ["", ""] }).score, 0);
});

test("dialogue grading: array form also accepted", () => {
  const item = { kind: "dialogue", prompt: "p", scene: "s", turns: 2 };
  assert.equal(grade.gradeExercise(item, ["Hola", "Me llamo Ana"]).correct, true);
  assert.equal(grade.gradeExercise(item, ["Hola"]).correct, false);
});

test("dialogue publish gating: missing scene counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "dialogue", scene: "" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: dialogueContent() }]), 0);
});

// ---- combined no-leak + courseText + gating ----

test("courseText does not leak translate/dialogue keys", () => {
  const n1 = exercise.normalize(translateContent());
  const n2 = exercise.normalize(dialogueContent());
  assert.ok(n1 && n2);
  const text = share.courseText({
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [
      { type: "exercise", position: 0, content: n1 },
      { type: "exercise", position: 1, content: n2 },
    ] }] }],
  });
  assert.doesNotMatch(text, /"expected"/);
  assert.doesNotMatch(text, /"alternatives"/);
});

test("translate + dialogue gating counts correctly in a mixed course", () => {
  const ok = [
    { type: "exercise", content: translateContent() },
    { type: "exercise", content: dialogueContent() },
  ];
  assert.equal(coursegen.missingAnswers(ok), 0);
  const missing = [
    { type: "exercise", content: { prompt: "p", kind: "translate" } },
    { type: "exercise", content: { prompt: "p", kind: "dialogue", scene: "" } },
  ];
  assert.equal(coursegen.missingAnswers(missing), 2);
});
