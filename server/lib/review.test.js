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
