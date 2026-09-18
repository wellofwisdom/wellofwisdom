// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

function vocabContent(over = {}) {
  return {
    prompt: "What does hola mean?",
    kind: "vocab_card",
    lemma: "hola",
    gloss: "hello",
    example: "Hola, me llamo Ana.",
    exampleGloss: "Hello, my name is Ana.",
    pos: "interjection",
    level: "A1",
    imagePrompt: "a friendly wave, soft watercolour, no text",
    audioText: "hola",
    alternatives: ["hi"],
    ...over,
  };
}

function listenChoiceContent(over = {}) {
  return {
    prompt: "What did you hear?",
    kind: "listen_choice",
    audioText: "El libro es rojo.",
    choices: [
      { id: "c1", text: "El libro es rojo." },
      { id: "c2", text: "La silla es azul." },
      { id: "c3", text: "La mesa es verde." },
    ],
    answer: "c1",
    ...over,
  };
}

function listenRepeatContent(over = {}) {
  return {
    prompt: "Listen and repeat: El libro es rojo.",
    kind: "listen_repeat",
    expected: "El libro es rojo.",
    audioText: "El libro es rojo.",
    alternatives: ["El libro es rojo"],
    hints: ["Say each word clearly: El - libro - es - rojo."],
    ...over,
  };
}

// ---- vocab_card ----

test("vocab_card normalize: valid content keeps gloss", () => {
  const n = exercise.normalize(vocabContent());
  assert.ok(n);
  assert.equal(n.kind, "vocab_card");
  assert.equal(n.lemma, "hola");
  assert.equal(n.gloss, "hello");
  assert.deepEqual(n.alternatives, ["hi"]);
  assert.equal(n.level, "A1");
});

test("vocab_card normalize: null when lemma or gloss missing", () => {
  assert.equal(exercise.normalize({ kind: "vocab_card", prompt: "p", lemma: "", gloss: "hello" }), null);
  assert.equal(exercise.normalize({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "" }), null);
  assert.equal(exercise.normalize({ kind: "vocab_card", prompt: "p", lemma: "hola" }), null);
});

test("vocab_card normalize: alternatives deduped and lowered", () => {
  const n = exercise.normalize(vocabContent({ alternatives: ["Hi", "HI", "hello", " Hello "] }));
  assert.ok(n);
  assert.ok(n.alternatives.includes("hi"), "hi present");
  assert.equal(new Set(n.alternatives).size, n.alternatives.length, "no dupes");
});

test("vocab_card normalize: imagePrompt capped at 500", () => {
  const long = "x".repeat(600);
  const n = exercise.normalize(vocabContent({ imagePrompt: long }));
  assert.ok(n);
  assert.ok(n.imagePrompt.length <= 500);
});

test("vocab_card normalize: level normalized to A1 A2 B1 B2", () => {
  const n = exercise.normalize(vocabContent({ level: "a1" }));
  assert.equal(n.level, "A1");
  const n2 = exercise.normalize(vocabContent({ level: "b2" }));
  assert.equal(n2.level, "B2");
});

test("vocab_card problem: lemma and gloss required", () => {
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "", gloss: "hello" }), "lemma_required");
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "" }), "gloss_required");
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "hello" }), null);
});

test("vocab_card problem: level invalid", () => {
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "hello", level: "C2" }), "level_invalid");
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "hello", level: "A1" }), null);
});

test("vocab_card problem: too many alternatives", () => {
  const many = Array.from({ length: 11 }, (_, i) => `alt${i}`);
  assert.equal(exercise.problem({ kind: "vocab_card", prompt: "p", lemma: "hola", gloss: "hello", alternatives: many }), "too_many_alternatives");
});

test("vocab_card strip: no key field survives learner projection", () => {
  const n = exercise.normalize(vocabContent());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  const json = JSON.stringify(pub);
  assert.ok(!("gloss" in pub.content), "gloss leaked");
  assert.ok(!("alternatives" in pub.content), "alternatives leaked");
  assert.doesNotMatch(json, /hello/);
  assert.equal(pub.content.lemma, "hola");
  assert.equal(pub.content.level, "A1");
  assert.equal(pub.content.pos, "interjection");
  assert.equal(pub.content.example, "Hola, me llamo Ana.");
  assert.equal(pub.content.audioText, "hola");
});

test("vocab_card grading: exact match after lowercasing and punctuation stripping", () => {
  const item = { kind: "vocab_card", lemma: "hola", gloss: "hello", alternatives: ["hi"] };
  assert.deepEqual(grade.gradeExercise(item, "hello"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "Hello"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "  hello. "), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "hi"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "HI"), { correct: true, score: 1 });
  assert.equal(grade.gradeExercise(item, "bye").correct, false);
  assert.equal(grade.gradeExercise(item, "hello").score, 1);
  assert.equal(grade.gradeExercise(item, "bye").score, 0);
});

test("vocab_card grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "vocab_card", lemma: "hola", gloss: "" }, "hello"), null);
  assert.equal(grade.gradeExercise({ kind: "vocab_card", lemma: "hola" }, "hello"), null);
});

test("vocab_card publish gating: missing gloss is counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "vocab_card", lemma: "hola" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: vocabContent() }]), 0);
});

// ---- listen_choice ----

test("listen_choice normalize: valid", () => {
  const n = exercise.normalize(listenChoiceContent());
  assert.ok(n);
  assert.equal(n.kind, "listen_choice");
  assert.equal(n.choices.length, 3);
  assert.equal(n.answer, "c1");
});

test("listen_choice normalize: needs audioText or audioUrl", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "listen_choice", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), null);
});

test("listen_choice normalize: audioUrl must be /media/...", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "listen_choice", audioUrl: "https://evil.com/audio.mp3", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), null);
  const n = exercise.normalize({ prompt: "p", kind: "listen_choice", audioUrl: "/media/123", choices: [{ text: "A" }, { text: "B" }], answer: "c1" });
  assert.ok(n);
  assert.equal(n.audioUrl, "/media/123");
});

test("listen_choice normalize: empty audioUrl rejected", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "listen_choice", audioText: "", audioUrl: "https://evil.com/x", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), null);
});

test("listen_choice problem: prompt choices answer checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), "audio_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioUrl: "https://evil.com/x", choices: [{ text: "A" }, { text: "B" }], answer: "c1" }), "audioUrl_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }], answer: "c1" }), "choices_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }], answer: "" }), "answer_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }], answer: "c9" }), "answer_invalid");
  assert.equal(exercise.problem(listenChoiceContent()), null);
});

test("listen_choice problem: caps", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ text: `opt ${i}` }));
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: many, answer: "c1" }), "too_many_choices");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ id: "x".repeat(41), text: "A" }, { text: "B" }], answer: "c1" }), "id_too_long");
});

test("listen_choice strip: answer does not leak", () => {
  const n = exercise.normalize(listenChoiceContent());
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("answer" in pub.content), "answer leaked");
  assert.ok(Array.isArray(pub.content.choices) && pub.content.choices.length === 3);
  assert.equal(pub.content.audioText, "El libro es rojo.");
  assert.doesNotMatch(JSON.stringify(pub), /"answer"/);
});

test("listen_choice grading: correct and wrong", () => {
  const item = { kind: "listen_choice", prompt: "p", audioText: "hi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: "c1" };
  assert.deepEqual(grade.gradeExercise(item, "c1"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "c2"), { correct: false, score: 0 });
  assert.equal(grade.gradeExercise(item, "c9").correct, false);
  assert.equal(grade.gradeExercise(item, "").correct, false);
});

test("listen_choice grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "listen_choice", prompt: "p", choices: [{ id: "c1", text: "A" }] }, "c1"), null);
});

test("listen_choice publish gating: missing answer counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: listenChoiceContent() }]), 0);
});

// ---- listen_repeat ----

test("listen_repeat normalize: valid", () => {
  const n = exercise.normalize(listenRepeatContent());
  assert.ok(n);
  assert.equal(n.kind, "listen_repeat");
  assert.equal(n.expected, "El libro es rojo.");
  assert.deepEqual(n.hints, ["Say each word clearly: El - libro - es - rojo."]);
});

test("listen_repeat normalize: needs expected", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "listen_repeat", audioText: "hi" }), null);
  assert.equal(exercise.normalize({ prompt: "", kind: "listen_repeat", expected: "hello" }), null);
});

test("listen_repeat normalize: audioUrl must be /media/...", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "listen_repeat", expected: "hi", audioUrl: "https://evil.com/x" }), null);
  const n = exercise.normalize({ prompt: "p", kind: "listen_repeat", expected: "hi", audioUrl: "/media/42" });
  assert.ok(n);
});

test("listen_repeat problem: expected required", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_repeat", audioText: "hi" }), "expected_required");
  assert.equal(exercise.problem({ prompt: "", kind: "listen_repeat", expected: "hi" }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "listen_repeat", expected: "hi", audioUrl: "https://evil.com/x" }), "audioUrl_invalid");
  assert.equal(exercise.problem(listenRepeatContent()), null);
});

test("listen_repeat strip: expected and alternatives do not leak", () => {
  const n = exercise.normalize({ prompt: "p", kind: "listen_repeat", expected: "El libro es rojo.", audioText: "Escucha y repite.", alternatives: ["El libro es rojo"] });
  assert.ok(n);
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("expected" in pub.content), "expected leaked");
  assert.ok(!("alternatives" in pub.content), "alternatives leaked");
  const keys = JSON.stringify(pub);
  assert.ok(!keys.includes('"expected"'), "expected key leaked");
  assert.ok(!keys.includes('"alternatives"'), "alternatives key leaked");
  assert.equal(pub.content.prompt, "p");
});

test("listen_repeat grading: correct is score 1", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." };
  assert.deepEqual(grade.gradeExercise(item, "El libro es rojo."), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "el libro es rojo"), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, "EL LIBRO ES ROJO."), { correct: true, score: 1 });
  assert.deepEqual(grade.gradeExercise(item, { transcript: "El libro es rojo.", confidence: 0.9 }), { correct: true, score: 1 });
});

test("listen_repeat grading: punctuation and accents ignored", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." };
  assert.equal(grade.gradeExercise(item, "El, libro es rojo!").correct, true);
  const withAccent = { kind: "listen_repeat", prompt: "p", expected: "manana es lunes" };
  assert.equal(grade.gradeExercise(withAccent, "mañana es lunes").correct, true);
  assert.equal(grade.gradeExercise(withAccent, "manana es lunes").correct, true);
});

test("listen_repeat grading: partials count prefix words in order", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." };
  const half = grade.gradeExercise(item, "El libro es azul");
  assert.equal(half.correct, false);
  assert.equal(half.score, 0.75);
  const one = grade.gradeExercise(item, "El libro verde azul");
  assert.equal(one.score, 0.5);
  const none = grade.gradeExercise(item, "Hola que tal");
  assert.equal(none.score, 0);
  assert.equal(none.correct, false);
});

test("listen_repeat grading: alternatives accepted", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo.", alternatives: ["El libro es rojo"] };
  assert.equal(grade.gradeExercise(item, "El libro es rojo").correct, true);
});

test("listen_repeat grading: confidence ignored, transcript used", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "Hola me llamo Ana." };
  assert.equal(grade.gradeExercise(item, { transcript: "Hola me llamo Ana", confidence: 0.1 }).correct, true);
  assert.equal(grade.gradeExercise(item, { transcript: "Hola me llamo Bob", confidence: 0.99 }).correct, false);
});

test("listen_repeat grading: null when no key", () => {
  assert.equal(grade.gradeExercise({ kind: "listen_repeat", prompt: "p" }, "hello"), null);
  assert.equal(grade.gradeExercise({ kind: "listen_repeat", prompt: "p", expected: "" }, "hello"), null);
});

test("listen_repeat grading: empty transcript is wrong not null", () => {
  const item = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." };
  assert.equal(grade.gradeExercise(item, "").correct, false);
  assert.equal(grade.gradeExercise(item, "").score, 0);
  assert.equal(grade.gradeExercise(item, null).correct, false);
});

test("listen_repeat publish gating: missing expected counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "listen_repeat", audioText: "hi" } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: listenRepeatContent() }]), 0);
});

test("courseText does not leak language keys", () => {
  const n1 = exercise.normalize(vocabContent());
  const n2 = exercise.normalize(listenChoiceContent());
  const n3 = exercise.normalize(listenRepeatContent());
  assert.ok(n1 && n2 && n3);
  const text = share.courseText({
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [
      { type: "exercise", position: 0, content: n1 },
      { type: "exercise", position: 1, content: n2 },
      { type: "exercise", position: 2, content: n3 },
    ] }] }],
  });
  assert.doesNotMatch(text, /"gloss"/);
  assert.doesNotMatch(text, /"expected"/);
  assert.doesNotMatch(text, /alternatives/);
});
test("review queue strip: vocab/listen language kinds answer keys never leak via share strip", () => {
  for (const content of [vocabContent(), listenChoiceContent(), listenRepeatContent()]) {
    const n = exercise.normalize(content);
    assert.ok(n, "normalize must succeed for review queue case");
    // Share review queue equivalent path: strip, then share projection
    const stripped = exercise.strip(n);
    const json = JSON.stringify(stripped);
    if (content.kind === "vocab_card") {
      assert.ok(!("gloss" in stripped), "gloss leaked via strip");
      assert.ok(!("alternatives" in stripped), "alternatives leaked via strip");
      assert.doesNotMatch(json, /hello/);
    } else if (content.kind === "listen_choice") {
      assert.ok(!("answer" in stripped), "answer leaked via strip");
      assert.doesNotMatch(json, /"answer"/);
    } else if (content.kind === "listen_repeat") {
      assert.ok(!("expected" in stripped), "expected leaked via strip");
      assert.ok(!("alternatives" in stripped), "alternatives leaked via strip");
      assert.doesNotMatch(json, /"expected"/);
    }
    const pub = share.publicItem({ type: "exercise", position: 0, content: n });
    const pubJson = JSON.stringify(pub.content);
    assert.doesNotMatch(pubJson, /"gloss"|"expected"/);
    assert.ok(!pubJson.includes('"alternatives"'), "alternatives leaked via publicItem");
  }
});

test("spaced review: language exercise kinds that grade to {correct, score} feed nextSchedule, text does not", () => {
  const kinds = [
    { item: { kind: "vocab_card", lemma: "hola", gloss: "hello", alternatives: ["hi"] }, answer: "hello", expectCorrect: true },
    { item: { kind: "vocab_card", lemma: "hola", gloss: "hello", alternatives: ["hi"] }, answer: "bye", expectCorrect: false },
    { item: { kind: "listen_choice", prompt: "p", audioText: "hi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: "c1" }, answer: "c1", expectCorrect: true },
    { item: { kind: "listen_choice", prompt: "p", audioText: "hi", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer: "c1" }, answer: "c2", expectCorrect: false },
    { item: { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." }, answer: "El libro es rojo.", expectCorrect: true },
    { item: { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." }, answer: "El libro es azul", expectCorrect: false },
  ];
  for (const k of kinds) {
    const out = grade.gradeExercise(k.item, k.answer);
    assert.ok(out && typeof out === "object" && "correct" in out, "language kind must grade to {correct,score}");
    assert.equal(out.correct, k.expectCorrect);
    assert.ok(typeof out.score === "number" && out.score >= 0 && out.score <= 1);
    // Would feed scheduler when correct !== null and kind !== text
    assert.equal(out !== null, true);
  }
  assert.equal(grade.gradeExercise({ kind: "text", prompt: "p", answer: "model" }, "whatever"), null);
});

test("flashcard per-card vs vocab scheduler: separate tables, separate keys", () => {
  const { nextSchedule } = require("./review");
  // Exercise lane (vocab via review_schedule)
  let vocab = null;
  vocab = nextSchedule(vocab, true);
  vocab = nextSchedule(vocab, true);
  assert.equal(vocab.interval_days, 3);
  // Flashcard lanes (per card)
  let c0 = null;
  let c1 = null;
  c0 = nextSchedule(c0, true);
  c1 = nextSchedule(c1, false);
  assert.equal(c0.interval_days, 1);
  assert.equal(c1.interval_days, 0);
  c0 = nextSchedule(c0, true);
  assert.equal(c0.interval_days, 3);
  // vocab still 3, c1 still 0
  assert.equal(vocab.interval_days, 3);
  assert.equal(c1.interval_days, 0);
});

test("share never emits answerText: courseText built from publicCourse is key-free", () => {
  const items = [vocabContent(), listenChoiceContent(), listenRepeatContent()].map((raw) => {
    const n = exercise.normalize(raw);
    return { type: "exercise", position: 0, content: n };
  });
  const tree = {
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    public_slug: "t", license: "CC-BY-4.0", author_name: null, published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items }] }],
  };
  const pub = share.publicCourse(tree);
  assert.doesNotMatch(JSON.stringify(pub), /"answerText"/);
  assert.doesNotMatch(share.courseText(tree), /answerText/);
  assert.doesNotMatch(JSON.stringify(pub), /"gloss"/);
  assert.doesNotMatch(JSON.stringify(pub), /"expected"/);
});

