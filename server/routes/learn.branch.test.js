// SPDX-License-Identifier: AGPL-3.0-or-later
// Source checks for the branch (story fork) path in the learn route. The
// route's shape is what keeps the guarantee: branch bodies never reach a
// learner's browser before they pick, a pick is never wrong, and the pick
// stays out of the spaced-review queue.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const src = () => fs.readFileSync("server/routes/learn.js", "utf8");

describe("branch story forks in the learn route", () => {
  it("learnerItem carries fork labels but not what happens next", () => {
    const s = src();
    assert.match(s, /out\.branches = c\.branches\.map\(\(b\) => \(\{ id: b\.id, text: b\.text \}\)\)/);
    // The body must not cross in the lesson payload: only the attempt reveals it.
    assert.doesNotMatch(s, /out\.branches\.map\(\(b\) => \(\{[^}]*body/);
  });

  it("a branch pick is revealed from the server, never graded wrong", () => {
    const s = src();
    assert.match(s, /c\.kind === "branch"[\s\S]*?picked = \(c\.branches \|\| \[\]\)\.find/);
    assert.match(s, /body: picked \? picked\.body : null/);
    assert.ok(s.includes("c.kind !== \"branch\" && correct !== null"), "review scheduler skips branch picks");
  });

  it("grading agrees: every offered path is a real path", () => {
    const grade = fs.readFileSync("server/lib/grade.js", "utf8");
    assert.match(grade, /case "branch": [\s\S]*?return branches\.some\(\(b\) => b\.id === String\(learnerAnswer \?\? ""\)\) \? true : null/);
  });
});
