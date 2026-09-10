// SPDX-License-Identifier: AGPL-3.0-or-later
// The gap between what a model drafts and what a child reads is the whole
// feature, so it is asserted from the source rather than trusted to review.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const learnSrc = fs.readFileSync(path.join(__dirname, "learn.js"), "utf8");
const workSrc = fs.readFileSync(path.join(__dirname, "work.js"), "utf8");
const indexSrc = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

// Comments talk about the rule; the code has to obey it. Strip them first, so
// a note explaining an invariant does not read as a breach of it.
const learnCode = learnSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

test("no learner route ever reads the AI's draft", () => {
  assert.ok(
    !/\bai_feedback\b/.test(learnCode),
    "learn.js must not touch ai_feedback: the draft is the guide's, and only what the guide wrote crosses back"
  );
});

test("the learner projection is a fixed allowlist, so a new column cannot leak", () => {
  const fn = learnCode.match(/function learnerSubmission\(row\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "learnerSubmission must exist as the one learner-facing projection");
  for (const banned of ["ai_feedback", "graded_by", "...row"]) {
    assert.ok(!fn[0].includes(banned), `learnerSubmission must not expose ${banned}`);
  }
});

test("a learner cannot edit work they have already handed in", () => {
  assert.match(learnCode, /already_submitted/);
});

test("only a project accepts a submission", () => {
  assert.match(learnCode, /not_a_project/);
});

test("grading is gated on the grade permission, not merely on being a parent", () => {
  const writes = workSrc.match(/router\.(post|patch|put|delete)\([^)]*/g) || [];
  assert.ok(writes.length >= 2, "expected the draft and the return routes");
  for (const line of writes) {
    assert.match(line, /requirePerm\("grade"/, `unguarded write route: ${line}`);
  }
});

test("nothing reaches a learner without a guide writing it", () => {
  assert.ok(!/'returned'/.test(learnCode), "learn.js must never set a submission to returned");
  assert.match(workSrc, /add\("status", "returned"\)/);
});

test("the work routes are mounted", () => {
  assert.match(indexSrc, /app\.use\("\/api\/work", require\("\.\/routes\/work"\)\)/);
});

test("feedback is news until it is shown, and again after a second return", () => {
  const { isUnseen } = require("./learn");
  const t0 = "2026-09-01T10:00:00Z";
  const t1 = "2026-09-02T10:00:00Z";
  assert.equal(isUnseen({ status: "returned", returned_at: t0, seen_at: null }), true);
  assert.equal(isUnseen({ status: "returned", returned_at: t0, seen_at: t1 }), false);
  assert.equal(isUnseen({ status: "returned", returned_at: t1, seen_at: t0 }), true, "returned again after it was seen");
  assert.equal(isUnseen({ status: "submitted", returned_at: t0, seen_at: null }), false, "handed in again: waiting, not news");
  assert.equal(isUnseen({ status: "draft", returned_at: null, seen_at: null }), false);
});

test("marking feedback seen is a POST, so a guide previewing as the learner cannot do it", () => {
  // denyPreviewWrites refuses every non-GET in preview. A GET that wrote
  // seen_at would let a guide's look-around hide news from the child.
  assert.match(learnCode, /router\.post\("\/submissions\/:itemId\/seen"/);
  const reads = learnCode.match(/router\.get\([\s\S]*?\n\}\);/g) || [];
  for (const r of reads) assert.ok(!/seen_at\s*=/.test(r), "no GET route may write seen_at");
});