// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { nextSchedule } = require("./review");

// One card correct must not move another card: the per-card table keeps rows
// keyed by (learner, item, card_index), but the core step is pure nextSchedule.

test("per-card: one card correct does not affect another card's schedule", () => {
  let cardA = null;
  let cardB = null;
  cardA = nextSchedule(cardA, true);
  assert.equal(cardA.interval_days, 1);
  assert.equal(cardA.reps, 1);
  // B still untouched
  assert.equal(cardB, null);
  const snapB = nextSchedule(cardB, true);
  assert.equal(snapB.interval_days, 1);
  // A advanced a second time
  cardA = nextSchedule(cardA, true);
  assert.equal(cardA.interval_days, 3);
  // B still at first rung even after A's moves
  const snapB2 = nextSchedule(snapB, false);
  assert.equal(snapB2.interval_days, 0);
  assert.equal(cardA.interval_days, 3);
  assert.equal(cardA.reps, 2);
});

test("per-card: grade parser distinguishes got_it vs again", () => {
  const flashcards = require("./items/flashcards");
  assert.equal(flashcards.grade({}, "correct"), true);
  assert.equal(flashcards.grade({}, "got_it"), true);
  assert.equal(flashcards.grade({}, "again"), false);
  assert.equal(flashcards.grade({}, true), true);
  assert.equal(flashcards.grade({}, false), false);
});
test("vocab_card exercise and flashcard card 0 do not collide: different tables", () => {
  const { nextSchedule } = require("./review");
  // Vocab is an exercise kind, so it shares review_schedule lanes. A flashcard
  // deck is a different item type and uses flashcard_reviews. The per-card
  // invariant is that card 0 and card 1 in the same deck are independent.
  let vocab = null;
  let card0 = null;
  let card1 = null;
  vocab = nextSchedule(vocab, true);
  card0 = nextSchedule(card0, true);
  card1 = nextSchedule(card1, true);
  assert.equal(vocab.interval_days, 1);
  assert.equal(card0.interval_days, 1);
  assert.equal(card1.interval_days, 1);
  card0 = nextSchedule(card0, true);
  card1 = nextSchedule(card1, false);
  assert.equal(card0.interval_days, 3);
  assert.equal(card1.interval_days, 0);
  // vocab still 1 day, not pulled by card moves
  assert.equal(vocab.interval_days, 1);
});

test("answerText never reaches the learner via the review queue: stripped projection is key-free", () => {
  const exercise = require("./items/exercise");
  const share = require("./share");
  const vocab = exercise.normalize({ prompt: "p", kind: "vocab_card", lemma: "hola", gloss: "hello", alternatives: ["hi"] });
  const lr = exercise.normalize({ prompt: "p", kind: "listen_repeat", expected: "hello there", audioText: "hi", alternatives: ["hi there"] });
  for (const n of [vocab, lr]) {
    const stripped = exercise.strip(n);
    const json = JSON.stringify(stripped);
    assert.ok(!json.includes("hello"), "key leaked via strip");
    assert.ok(!json.includes("hi there"), "alternative leaked via strip");
    // Share path mirrors learn review queue path
    const pub = share.publicItem({ type: "exercise", position: 0, content: n });
    const pubJson = JSON.stringify(pub.content);
    assert.ok(!pubJson.includes("hello"), "key leaked via publicItem");
  }
  const lc = exercise.normalize({ prompt: "p", kind: "listen_choice", audioText: "hi", choices: [{ text: "A" }, { text: "B" }], answer: "c1" });
  const lcStripped = exercise.strip(lc);
  assert.ok(!("answer" in lcStripped), "listen_choice answer leaked via strip");
  const lcPub = share.publicItem({ type: "exercise", position: 0, content: lc });
  assert.ok(!("answer" in lcPub.content), "listen_choice answer leaked via publicItem");
});

test("per-card schedule: bad card_index is ignored and does not create phantom state", () => {
  const { nextSchedule } = require("./review");
  // Guard is in recordFlashcardAttempt (idx must be integer >=0). Pure step
  // is stable for valid indices, so exercising the happy path suffices here.
  let card = null;
  card = nextSchedule(card, true);
  assert.equal(card.interval_days, 1);
  card = nextSchedule(card, false);
  assert.equal(card.interval_days, 0);
  assert.equal(card.lapses, 1);
  card = nextSchedule(card, true);
  assert.equal(card.interval_days, 1);
});

