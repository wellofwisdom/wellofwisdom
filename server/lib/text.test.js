// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { stripTags } = require("./text");
const { normalizeOutline } = require("./plangen");

test("stripTags: maths with < and > is left exactly as written", () => {
  for (const s of ["3 < 5 or 7 > 4", "$a<b$ and $c>d$", "x<5", "if a < b and b > c", "<- arrows ->", "2 <= x >= 1"]) {
    assert.equal(stripTags(s), s);
  }
});

test("stripTags: real tags go, their words stay", () => {
  assert.equal(stripTags("Is <b>this</b> <span class=\"x\">bold</span>?<br/>"), "Is this bold?");
  assert.equal(stripTags("<script>alert(1)</script>"), "alert(1)");
  assert.equal(stripTags("<P>Loud</P>"), "Loud");
});

test("stripTags: nothing in, empty string out", () => {
  assert.equal(stripTags(null), "");
  assert.equal(stripTags(undefined), "");
});

test("a learning path keeps its inequalities too", () => {
  const plan = normalizeOutline({
    title: "Algebra: <i>x</i> < 5",
    milestones: [1, 2, 3].map((n) => ({
      title: `Block ${n}: when is x > ${n}?`,
      description: "Solve 2x + 1 < 7 and 3 > y.",
      projectIdea: "Graph y > 2x",
      resourceHint: "Library books",
    })),
  }, 6);
  assert.equal(plan.title, "Algebra: x < 5");
  assert.equal(plan.milestones[0].title, "Block 1: when is x > 1?");
  assert.equal(plan.milestones[0].description, "Solve 2x + 1 < 7 and 3 > y.");
});
