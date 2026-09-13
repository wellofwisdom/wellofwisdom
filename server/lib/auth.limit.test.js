// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("./auth");
const { trustProxySetting } = require("../index");

test("the limiter evicts the oldest address instead of forgetting everyone", () => {
  const opts = { max: 3, windowMs: 60_000, maxEntries: 3 };
  // Burn the attacker's budget.
  auth.loginLimit("evict-attacker", opts);
  auth.loginLimit("evict-attacker", opts);
  auth.loginLimit("evict-attacker", opts);
  assert.equal(auth.loginLimit("evict-attacker", opts).ok, false);
  // A flood of fresh addresses used to clear the whole map and unlock them.
  for (let i = 0; i < 50; i++) auth.loginLimit(`evict-fresh-${i}`, opts);
  // The attacker was the oldest entry and is legitimately gone by now, but a
  // recent address keeps its count: the last fresh one has 1 attempt, so a
  // second and third are fine and a fourth is blocked, as before the flood.
  assert.equal(auth.loginLimit("evict-fresh-49", opts).ok, true);
  assert.equal(auth.loginLimit("evict-fresh-49", opts).ok, true);
  assert.equal(auth.loginLimit("evict-fresh-49", opts).ok, false);
});

test("an address under attack is not unlocked by a smaller flood", () => {
  const opts = { max: 2, windowMs: 60_000, maxEntries: 5 };
  auth.loginLimit("hold-attacker", opts);
  auth.loginLimit("hold-attacker", opts);
  assert.equal(auth.loginLimit("hold-attacker", opts).ok, false);
  for (let i = 0; i < 3; i++) auth.loginLimit(`hold-fresh-${i}`, opts);
  assert.equal(auth.loginLimit("hold-attacker", opts).ok, false, "still blocked while it fits in the map");
});

test("TRUST_PROXY parses to what Express expects and defaults to one hop", () => {
  assert.equal(trustProxySetting(undefined), 1);
  assert.equal(trustProxySetting(""), 1);
  assert.equal(trustProxySetting("2"), 2);
  assert.equal(trustProxySetting("false"), false);
  assert.equal(trustProxySetting("0"), false);
  assert.equal(trustProxySetting("true"), true);
  assert.equal(trustProxySetting("loopback, 10.0.0.0/8"), "loopback, 10.0.0.0/8");
});
