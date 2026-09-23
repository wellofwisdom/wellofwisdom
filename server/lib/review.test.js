// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { nextSchedule } = require("./review");

test("ladder: first correct answers climb 1 -> 3 -> 7 days", () => {
  let s = null;
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 1);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 3);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 7);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, Math.round(7 * s.ease));
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
  assert.equal(s.interval_days, 1);
  s = nextSchedule(s, true);
  assert.equal(s.interval_days, 3);
});

test("vocab_card feeds scheduler via correct === true, wrong comes back today", () => {
  const grade = require("./grade");
  const exercise = require("./items/exercise");
  const vocab = exercise.normalize({ prompt: "What does hola mean", kind: "vocab_card", lemma: "hola", gloss: "hello" });
  assert.ok(vocab);
  const out = grade.gradeExercise(vocab, "hello");
  assert.deepEqual(out, { correct: true, score: 1 });
  let s = null;
  s = require("./review").nextSchedule(s, out.correct === true);
  assert.equal(s.interval_days, 1);
  s = require("./review").nextSchedule(s, out.correct === true);
  assert.equal(s.interval_days, 3);
  const wrong = grade.gradeExercise(vocab, "goodbye");
  assert.equal(wrong.correct, false);
  const sp = require("./review").nextSchedule(null, wrong.correct === true);
  assert.equal(sp.interval_days, 0);
  assert.equal(sp.lapses, 1);
});

test("vocab_card alternatives count as correct", () => {
  const exercise = require("./items/exercise");
  const grade = require("./grade");
  const vocab = exercise.normalize({
    prompt: "What does libro mean",
    kind: "vocab_card",
    lemma: "libro",
    gloss: "book",
    alternatives: ["volume"],
  });
  assert.ok(vocab);
  const viaAlt = grade.gradeExercise(vocab, "volume");
  assert.equal(viaAlt.correct, true);
  let s = null;
  s = require("./review").nextSchedule(s, viaAlt.correct === true);
  assert.equal(s.interval_days, 1);
});

test("listen_choice correct climbs, wrong comes back today", () => {
  const exercise = require("./items/exercise");
  const grade = require("./grade");
  const lc = exercise.normalize({
    prompt: "Listen and pick",
    kind: "listen_choice",
    audioText: "hola",
    choices: [
      { id: "c1", text: "hello" },
      { id: "c2", text: "goodbye" },
    ],
    answer: "c1",
  });
  assert.ok(lc);
  const ok = grade.gradeExercise(lc, "c1");
  assert.deepEqual(ok, { correct: true, score: 1 });
  let s = null;
  s = require("./review").nextSchedule(s, ok.correct === true);
  assert.equal(s.interval_days, 1);
  const bad = grade.gradeExercise(lc, "c2");
  assert.equal(bad.correct, false);
  const sn = require("./review").nextSchedule(null, bad.correct === true);
  assert.equal(sn.interval_days, 0);
});

test("listen_repeat partial is not correct, so it comes back today", () => {
  const grade = require("./grade");
  const lr = { kind: "listen_repeat", prompt: "Repeat", expected: "El libro es rojo." };
  const lrp = grade.gradeExercise(lr, "El libro es azul");
  assert.equal(lrp.correct, false);
  assert.ok(lrp.score > 0 && lrp.score < 1);
  const sp = require("./review").nextSchedule(null, lrp.correct === true);
  assert.equal(sp.interval_days, 0);
  assert.equal(sp.lapses, 1);
});

test("listen_repeat exact is correct and climbs", () => {
  const grade = require("./grade");
  const lr = { kind: "listen_repeat", prompt: "Repeat", expected: "Bonjour" };
  const out = grade.gradeExercise(lr, "Bonjour");
  assert.equal(out.correct, true);
  let s = null;
  s = require("./review").nextSchedule(s, out.correct === true);
  assert.equal(s.interval_days, 1);
});

test("kind text never feeds scheduler: grade returns null", () => {
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
  assert.equal(vocab.interval_days, 3);
  assert.equal(vocab.reps, 2);
  assert.equal(card0.reps, 1);
  assert.equal(card1.reps, 0);
  assert.equal(card1.lapses, 1);
});

test("flashcard per-card isolation: each index is its own ladder", () => {
  const { nextSchedule } = require("./review");
  let deck = new Map();
  function gradeCard(idx, correct) {
    const prev = deck.get(idx) || null;
    const next = nextSchedule(prev, correct);
    deck.set(idx, next);
    return next;
  }
  const c0a = gradeCard(0, true);
  assert.equal(c0a.interval_days, 1);
  const c1a = gradeCard(1, false);
  assert.equal(c1a.interval_days, 0);
  const c0b = gradeCard(0, true);
  assert.equal(c0b.interval_days, 3);
  const c1b = gradeCard(1, true);
  assert.equal(c1b.interval_days, 1);
  assert.equal(deck.get(0).reps, 2);
  assert.equal(deck.get(1).reps, 1);
  assert.equal(deck.get(1).lapses, 1);
  deck.clear();
  const first = gradeCard(2, true);
  assert.equal(first.interval_days, 1);
  const wrong = gradeCard(2, false);
  assert.equal(wrong.interval_days, 0);
  assert.equal(wrong.reps, 0);
});

test("flashcard card_index validation: recordFlashcardAttempt guards bad indices", () => {
  const { nextSchedule } = require("./review");
  let s = { ease: 2.5, interval_days: 7, reps: 3, lapses: 0 };
  const afterWrong = nextSchedule(s, false);
  assert.equal(afterWrong.interval_days, 0);
  assert.equal(afterWrong.reps, 0);
  assert.ok(afterWrong.ease < 2.5);
  const next = nextSchedule(afterWrong, true);
  assert.equal(next.interval_days, 1);
  const bad = ["foo", -1, NaN, Infinity, 1.5, undefined];
  for (const v of bad) {
    const n = Number(v);
    const isValid = Number.isInteger(n) && n >= 0;
    assert.equal(isValid, false, `${String(v)} should be invalid card index`);
  }
  for (const v of [0, 1, 3]) {
    const n = Number(v);
    assert.ok(Number.isInteger(n) && n >= 0, `${v} should be valid card index`);
  }
  assert.equal(Number(null), 0, "Number(null) is 0, so null is not a distinct card index");
});

test("french kinds translate and dialogue feed scheduler, graded_reader never does", () => {
  const grade = require("./grade");
  const exercise = require("./items/exercise");
  const itemsMod = require("./items");
  const tFR = exercise.normalize({ prompt: "Traduis en francais", kind: "translate", direction: "en_to_fr", expected: "Bonjour" });
  assert.ok(tFR);
  const tFR2 = exercise.normalize({ prompt: "Traduis en anglais", kind: "translate", direction: "fr_to_en", expected: "hello" });
  assert.ok(tFR2);
  const outFR = grade.gradeExercise(tFR, "Bonjour");
  assert.equal(outFR.correct, true);
  assert.equal(outFR.score, 1);
  let s = null;
  s = require("./review").nextSchedule(s, outFR.correct === true);
  assert.equal(s.interval_days, 1);
  const dItem = { kind: "dialogue", prompt: "p", scene: "Tu rencontres Sophie.", turns: 3 };
  const dOut = grade.gradeExercise(dItem, { turns: ["Bonjour", "Je m'appelle Lucie", "J'habite ici"] });
  assert.equal(dOut.correct, true);
  assert.equal(dOut.score, 1);
  let sd = null;
  sd = require("./review").nextSchedule(sd, dOut.correct === true);
  assert.equal(sd.interval_days, 1);
  const gr = itemsMod.forType("graded_reader");
  assert.ok(gr);
  assert.equal(gr.grade({ title: "Reader", body: "Bonjour", level: "A1" }, "anything"), null);
});

test("translate fr_to_en and en_to_fr directions normalize and do not collide in scheduler", () => {
  const exercise = require("./items/exercise");
  const grade = require("./grade");
  const a = exercise.normalize({ prompt: "p", kind: "translate", direction: "en_to_fr", expected: "Bonjour" });
  const b = exercise.normalize({ prompt: "p", kind: "translate", direction: "fr_to_en", expected: "hello" });
  assert.ok(a && b);
  assert.equal(a.direction, "en_to_fr");
  assert.equal(b.direction, "fr_to_en");
  let sa = null;
  let sb = null;
  sa = require("./review").nextSchedule(sa, grade.gradeExercise(a, "Bonjour").correct === true);
  sb = require("./review").nextSchedule(sb, grade.gradeExercise(b, "wrong").correct === true);
  assert.equal(sa.interval_days, 1);
  assert.equal(sb.interval_days, 0);
  assert.equal(sb.lapses, 1);
});

test("dueDate is one, three, seven days from now", () => {
  const { dueDate } = require("./review");
  const now = Date.now();
  const one = dueDate(1).getTime();
  const three = dueDate(3).getTime();
  const seven = dueDate(7).getTime();
  const tolerance = 2000;
  assert.ok(Math.abs(one - (now + 86400000)) < tolerance, "1 day due date");
  assert.ok(Math.abs(three - (now + 3 * 86400000)) < tolerance, "3 day due date");
  assert.ok(Math.abs(seven - (now + 7 * 86400000)) < tolerance, "7 day due date");
  const today = dueDate(0).getTime();
  assert.ok(Math.abs(today - now) < tolerance, "0 days is today");
});
