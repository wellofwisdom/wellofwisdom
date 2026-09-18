// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

function vocabFr(over = {}) {
  return {
    prompt: "What does bonjour mean?",
    kind: "vocab_card",
    lemma: "bonjour",
    gloss: "hello",
    example: "Bonjour, je m'appelle Lucie.",
    exampleGloss: "Hello, my name is Lucie.",
    pos: "interjection",
    level: "A1",
    audioText: "bonjour",
    alternatives: ["hi"],
    ...over,
  };
}

function translateFr(over = {}) {
  return {
    prompt: "Translate to French: I live with my family in the blue house.",
    kind: "translate",
    direction: "en_to_fr",
    expected: "J'habite avec ma famille dans la maison bleue.",
    alternatives: ["J habite avec ma famille dans la maison bleue"],
    rubric: "Includes J'habite avec ma famille, mentions la maison bleue.",
    ...over,
  };
}

function dialogueFr(over = {}) {
  return {
    prompt: "Greet your neighbour and answer where you live.",
    kind: "dialogue",
    scene: "You meet Sophie at the door. She says: Bonjour ! Comment tu t'appelles ?",
    turns: 3,
    goals: ["greet back", "give your name", "say where you live"],
    goodEndings: ["used polite form", "asked a question back"],
    ...over,
  };
}

test("translate fr normalize: accepts en_to_fr and fr_to_en", () => {
  const n1 = exercise.normalize(translateFr());
  assert.ok(n1);
  assert.equal(n1.direction, "en_to_fr");
  const n2 = exercise.normalize(translateFr({ direction: "fr_to_en", prompt: "Traduis en anglais : J'habite ici.", expected: "I live here." }));
  assert.ok(n2);
  assert.equal(n2.direction, "fr_to_en");
});

test("translate fr problem: direction_invalid for bad value", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "translate", expected: "bonjour", direction: "en_to_de" }), "direction_invalid");
  assert.equal(exercise.problem(translateFr()), null);
});

test("translate fr strip: no expected or alternatives leak", () => {
  const n = exercise.normalize(translateFr());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("expected" in pub.content));
  assert.ok(!("alternatives" in pub.content));
  assert.equal(pub.content.direction, "en_to_fr");
  assert.ok(pub.content.rubric);
});

test("translate fr grade: exact match is correct, else needsReview", () => {
  const item = { kind: "translate", prompt: "p", expected: "J'habite avec ma famille dans la maison bleue.", alternatives: ["J habite avec ma famille dans la maison bleue"] };
  assert.equal(grade.gradeExercise(item, "J'habite avec ma famille dans la maison bleue.").correct, true);
  assert.equal(grade.gradeExercise(item, "j'habite avec ma famille dans la maison bleue").correct, true);
  const r = grade.gradeExercise(item, "Bonjour");
  assert.equal(r.correct, false);
  assert.equal(r.needsReview, true);
});

test("vocab_card fr grading and strip no leak", () => {
  const n = exercise.normalize(vocabFr());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("gloss" in pub.content));
  assert.ok(!("alternatives" in pub.content));
  assert.equal(grade.gradeExercise({ kind: "vocab_card", lemma: "bonjour", gloss: "hello", alternatives: ["hi"] }, "hello").correct, true);
  assert.equal(grade.gradeExercise({ kind: "vocab_card", lemma: "bonjour", gloss: "hello" }, "hi").correct, false);
});

test("dialogue fr strip and grade", () => {
  const n = exercise.normalize(dialogueFr());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.equal(pub.content.scene, n.scene);
  assert.equal(pub.content.turns, 3);
  const item = { kind: "dialogue", prompt: "p", scene: "s", turns: 3 };
  assert.equal(grade.gradeExercise(item, { turns: ["Bonjour", "Je m'appelle Lucie", "J'habite ici"] }).correct, true);
  assert.equal(grade.gradeExercise(item, { turns: ["Bonjour"] }).correct, false);
});

test("french publish gating: missing expected and scene counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "translate" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: translateFr() }]), 0);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "dialogue", scene: "" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: dialogueFr() }]), 0);
});

test("courseText does not leak french translate keys", () => {
  const n1 = exercise.normalize(translateFr());
  const n2 = exercise.normalize(dialogueFr());
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

test("example course french-a1 passes coursecheck and missingAnswers is 0", () => {
  const j = require("../../docs/examples/french-a1/course.wow-course.json");
  const items = j.units.flatMap((u) => u.lessons.flatMap((l) => l.items.map((it) => ({ type: it.type, content: it.content }))));
  assert.equal(coursegen.missingAnswers(items), 0);
  assert.ok(coursegen.normalizeCourse(j));
  const { checkPackage } = require("./coursecheck");
  const r = checkPackage(j);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});
