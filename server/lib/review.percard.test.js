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
