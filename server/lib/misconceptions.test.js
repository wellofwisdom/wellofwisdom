// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const m = require("./misconceptions");

test("humanizeAttempt: an MCQ shows the chosen and correct answers as words, not ids", () => {
  const row = {
    prompt: "What is 1/2 + 1/4?",
    kind: "mcq",
    choices: [{ id: "c1", text: "3/4" }, { id: "c2", text: "2/6" }],
    correctAnswer: "c1",
    given: "c2",
    subject: "Fractions",
  };
  const out = m.humanizeAttempt(row);
  assert.equal(out.chose, "2/6", "the learner's choice id is resolved to its text");
  assert.equal(out.answer, "3/4", "the correct choice id is resolved to its text");
  assert.equal(out.prompt, "What is 1/2 + 1/4?");
  assert.equal(out.subject, "Fractions");
});

test("humanizeAttempt: numeric passes through, an unknown id falls back to itself", () => {
  assert.equal(m.humanizeAttempt({ prompt: "2+2?", kind: "numeric", given: 5, correctAnswer: 4 }).chose, "5");
  // a choice id we do not recognise is shown raw rather than dropped
  assert.equal(m.humanizeAttempt({ prompt: "q", kind: "mcq", choices: [], given: "cX", correctAnswer: "c1" }).chose, "cX");
});

test("normalizeAnalysis: coerces, clamps, caps and drops empty patterns", () => {
  const raw = {
    patterns: [
      { skill: "adding fractions", misconception: "adds numerators and denominators straight across", evidence: "chose 2/6 for 1/2 + 1/4", suggestion: "find a common denominator first" },
      { skill: "nothing", misconception: "" }, // no misconception, dropped
      { misconception: "x".repeat(999) }, // clamped
      { misconception: "a" }, { misconception: "b" }, { misconception: "c" }, { misconception: "d" }, // push past the cap
    ],
    overall: "  spacing   normalised  ",
  };
  const out = m.normalizeAnalysis(raw);
  assert.ok(out.patterns.length <= m.MAX_PATTERNS, "capped");
  assert.ok(out.patterns.every((p) => p.misconception), "no empty patterns survive");
  assert.ok(out.patterns[1].misconception.length <= 400, "long text clamped");
  assert.equal(out.overall, "spacing normalised");
});

test("normalizeAnalysis: junk in, safe shape out", () => {
  for (const junk of [null, undefined, 42, "nope", { patterns: "not-an-array" }]) {
    const out = m.normalizeAnalysis(junk);
    assert.deepEqual(out.patterns, []);
    assert.equal(typeof out.overall, "string");
  }
});

test("analyze: too few wrong answers means no AI call and a clear note", async () => {
  // Fewer than MIN_WRONG usable rows: this must return without touching the network.
  const out = await m.analyze({
    attempts: [
      { prompt: "q1", kind: "numeric", given: 1, correctAnswer: 2 },
      { prompt: "q2", kind: "numeric", given: 3, correctAnswer: 4 },
    ],
    familyId: 1,
  });
  assert.equal(out.note, "not_enough");
  assert.deepEqual(out.patterns, []);
  assert.equal(out.missed, 2);
});
