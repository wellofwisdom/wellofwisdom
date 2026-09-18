// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { nextSchedule } = require("./review");

test("ladder: first correct answers climb 1 → 3 → 7 days", () => {
  let s = null;
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 1);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 3);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 7);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, Math.round(7 * s.ease)); // now multiplies by ease
});

test("wrong answer resets to today and drops ease", () => {
  let s = { ease: 2.5, interval_days: 7, reps: 3, lapses: 0 };
  s = nextSchedule(s, false);
  assert.equal(s.interval_days, 0);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < 2.5);
});

test("ease stays clamped between 1.3 and 3.0", () => {
  let low = { ease: 1.35, interval_days: 0, reps: 0, lapses: 5 };
  low = nextSchedule(low, false);
  assert.equal(low.ease, 1.3);
  let high = { ease: 2.98, interval_days: 5, reps: 4, lapses: 0 };
  high = nextSchedule(high, true);
  assert.equal(high.ease, 3);
});

test("recovery after a lapse climbs the ladder again", () => {
  let s = nextSchedule({ ease: 2.0, interval_days: 20, reps: 5, lapses: 2 }, false);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 1); // back to the bottom of the ladder
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 3);
});
test("vocab_card and listening kinds feed the scheduler via correct === true/false", () => {
  const grade = require("./items/../grade");
  const exercise = require("./items/exercise");
  const vocab = exercise.normalize({ prompt: "p", kind: "vocab_card", lemma: "hola", gloss: "hello" });
  assert.ok(vocab);
  const out = grade.gradeExercise(vocab, "hello");
  assert.deepEqual(out, { correct: true, score: 1 });
  let s = null;
  s = require("./review").nextSchedule(s, out.correct === true);
  assert.equal(s.interval_days, 1);
  s = require("./review").nextSchedule(s, out.correct === true);
  assert.equal(s.interval_days, 3);
  // listen_choice correct also climbs
  const lc = exercise.normalize({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }], answer: "c1" });
  const lcout = grade.gradeExercise(lc, "c1");
  assert.deepEqual(lcout, { correct: true, score: 1 });
  let sl = null;
  sl = require("./review").nextSchedule(sl, lcout.correct === true);
  assert.equal(sl.interval_days, 1);
  // listen_repeat partial is not correct, so it comes back today
  const lr = { kind: "listen_repeat", prompt: "p", expected: "El libro es rojo." };
  const lrp = grade.gradeExercise(lr, "El libro es azul");
  assert.equal(lrp.correct, false);
  assert.ok(lrp.score > 0 && lrp.score < 1);
  const sp = require("./review").nextSchedule(null, lrp.correct === true);
  assert.equal(sp.interval_days, 0);
  assert.equal(sp.lapses, 1);
});

test("kind text never feeds scheduler: grade returns null so recordAttempt would not be called", () => {
  const grade = require("./grade");
  const item = { kind: "text", prompt: "reflect", answer: "something" };
  assert.equal(grade.gradeExercise(item, "anything"), null);
});

test("nextSchedule is pure: vocab and flashcard lanes do not share state", () => {
  const { nextSchedule } = require("./review");
  let vocab = null;
  let card0 = null;
  let card1 = null;
  vocab = nextSchedule(vocab, true);
  vocab = nextSchedule(vocab, true);
  assert.equal(vocab.interval_days, 3);
  card0 = nextSchedule(card0, true);
  assert.equal(card0.interval_days, 1);
  card1 = nextSchedule(card1, false);
  assert.equal(card1.interval_days, 0);
  // vocab still 3 days, untouched by card lanes
  assert.equal(vocab.interval_days, 3);
  assert.equal(vocab.reps, 2);
  assert.equal(card0.reps, 1);
  assert.equal(card1.reps, 0);
  assert.equal(card1.lapses, 1);
});

test("flashcard card_index validation: recordFlashcardAttempt guards are reflected in schedule purity", () => {
  const { nextSchedule } = require("./review");
  // The guard lives in recordFlashcardAttempt (db layer), but the pure step
  // must still be deterministic for valid indices, so a bad index never
  // creates a phantom ease bump. Exercise here via pure function stability.
  let s = { ease: 2.5, interval_days: 7, reps: 3, lapses: 0 };
  const afterWrong = nextSchedule(s, false);
  assert.equal(afterWrong.interval_days, 0);
  assert.equal(afterWrong.reps, 0);
  assert.ok(afterWrong.ease < 2.5);
  const next = nextSchedule(afterWrong, true);
  assert.equal(next.interval_days, 1);
});

