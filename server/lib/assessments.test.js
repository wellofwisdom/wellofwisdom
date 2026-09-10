// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const as = require("./assessments");
const perm = require("./perm");

const TODAY = "2026-09-10";

const GOOD = {
  takenOn: "2026-05-14",
  kind: "test",
  title: "Spring standardised test, Form F",
  givenBy: "Co-op testing day, Mrs. Hale",
  gradeLevel: "6",
  scores: [
    { area: "Reading", score: "231", percentile: "74" },
    { area: "Mathematics", score: "Above grade level", percentile: "" },
    { area: "", score: "", percentile: "" },
  ],
  summary: "",
};

function norm(input) {
  return as.normalizeAssessment(input, { today: TODAY });
}

test("a real report goes in as it was written", () => {
  const { value, error } = norm(GOOD);
  assert.equal(error, undefined);
  assert.equal(value.title, "Spring standardised test, Form F");
  assert.equal(value.gradeLevel, 6);
  assert.deepEqual(value.scores, [
    { area: "Reading", score: "231", percentile: 74 },
    // A score that is words, not a number, is a real answer and is kept.
    { area: "Mathematics", score: "Above grade level", percentile: null },
  ]);
});

test("the blank line left at the bottom of the form is dropped, not stored", () => {
  assert.equal(norm(GOOD).value.scores.length, 2);
});

test("a percentile outside 1 to 99 is refused out loud, not clamped", () => {
  for (const p of [0, 100, 140, -3, "lots"]) {
    const out = norm({ ...GOOD, scores: [{ area: "Reading", score: "200", percentile: p }] });
    assert.equal(out.error, "percentile_invalid", `accepted ${p}`);
  }
  assert.equal(norm({ ...GOOD, scores: [{ area: "Reading", percentile: 99 }] }).value.scores[0].percentile, 99);
  assert.equal(norm({ ...GOOD, scores: [{ area: "Reading", percentile: "62.6" }] }).value.scores[0].percentile, 63);
});

test("a score row needs an area and something to say about it", () => {
  const out = norm({ ...GOOD, summary: "Scores to follow.", scores: [{ area: "Science" }, { score: "88" }] });
  assert.deepEqual(out.value.scores, []);
});

test("a title and a date are required, and the date must be a real one", () => {
  assert.equal(norm({ ...GOOD, title: "   " }).error, "title_required");
  assert.equal(norm({ ...GOOD, takenOn: "" }).error, "date_invalid");
  assert.equal(norm({ ...GOOD, takenOn: "14/05/2026" }).error, "date_invalid");
  assert.equal(norm({ ...GOOD, takenOn: "2026-13-40" }).error, "date_invalid");
});

test("a result from the future is a typo, with a day of slack for time zones", () => {
  assert.equal(norm({ ...GOOD, takenOn: "2026-09-11" }).error, undefined);
  assert.equal(norm({ ...GOOD, takenOn: "2026-09-12" }).error, "date_in_future");
});

test("the kind is one of three, and defaults to a test", () => {
  assert.equal(norm({ ...GOOD, kind: undefined }).value.kind, "test");
  assert.equal(norm({ ...GOOD, kind: "evaluation" }).value.kind, "evaluation");
  assert.equal(norm({ ...GOOD, kind: "pass" }).error, "kind_invalid");
});

test("grade follows the same 1 to 14 bound as the learner profile", () => {
  assert.equal(norm({ ...GOOD, gradeLevel: "" }).value.gradeLevel, null);
  assert.equal(norm({ ...GOOD, gradeLevel: 0 }).error, "grade_invalid");
  assert.equal(norm({ ...GOOD, gradeLevel: 15 }).error, "grade_invalid");
  assert.equal(norm({ ...GOOD, gradeLevel: 6.5 }).error, "grade_invalid");
});

test("an evaluation can be all words and no scores", () => {
  const out = norm({
    takenOn: "2026-06-01",
    kind: "evaluation",
    title: "End of year evaluation",
    givenBy: "Certified teacher",
    scores: [],
    summary: "Reads widely and writes with growing confidence.",
  });
  assert.equal(out.error, undefined);
  assert.equal(out.value.scores.length, 0);
});

test("a record with no scores and no words is a form sent too early", () => {
  assert.equal(norm({ ...GOOD, scores: [], summary: " " }).error, "nothing_recorded");
});

test("long text is bounded and the score list is capped", () => {
  const many = Array.from({ length: 90 }, (_, i) => ({ area: `Area ${i}`, score: "1" }));
  const out = norm({ ...GOOD, title: "x".repeat(500), summary: "y".repeat(9000), scores: many });
  assert.equal(out.value.title.length, 160);
  assert.equal(out.value.summary.length, 4000);
  assert.equal(out.value.scores.length, as.MAX_SCORES);
});

test("fromRow: bigint ids and dates are coerced once, at the boundary", () => {
  const r = as.fromRow({
    id: "13", learner_id: "7", taken_on: new Date("2026-05-14T00:00:00Z"), kind: "test",
    title: "T", given_by: null, grade_level: 6, scores: null, summary: null,
  });
  assert.strictEqual(r.id, 13);
  assert.strictEqual(r.learnerId, 7);
  assert.equal(r.takenOn, "2026-05-14");
  assert.deepEqual(r.scores, []);
});

// The line this feature must not cross, asserted from the source.
const lib = fs.readFileSync(path.join(__dirname, "assessments.js"), "utf8");
const routeSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "assessments.js"), "utf8");
const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "026_assessments.sql"), "utf8");

test("the app records a result and never judges one", () => {
  // Whether a score is enough is set by the law of one place and the facts of
  // one family. If a verdict ever appears here, this test is the argument
  // against it: the output of the normalizer carries the report and nothing else.
  const keys = Object.keys(norm(GOOD).value).sort();
  assert.deepEqual(keys, ["gradeLevel", "givenBy", "kind", "scores", "summary", "takenOn", "title"].sort());
  for (const src of [lib, routeSrc]) {
    assert.ok(!/\b(?:passed|passing|isPassing|meetsRequirement|threshold|cutoff)\b/i.test(src),
      "a verdict word in the logic means the app is judging a result");
    assert.ok(!/\b(?:Ohio|Texas|California|Florida|New York|Pennsylvania|Virginia)\b/.test(src),
      "a state name in the logic means the app is claiming to know the law");
  }
  assert.ok(!/\b(?:passed|passing|verdict|meets)\s+(?:boolean|bool|text|int)/i.test(sql),
    "no column in the table holds a verdict");
});

test("every write route is gated on a named permission", () => {
  const writes = routeSrc.match(/router\.(post|patch|put|delete)\([^)]*/g) || [];
  assert.ok(writes.length >= 3, "expected create, correct and delete");
  for (const line of writes) {
    assert.match(line, /requirePerm\("record_assessment"/, `unguarded write route: ${line}`);
  }
});

test("every route goes through the same learner gate, so a tutor sees one student", () => {
  assert.match(routeSrc, /perm\.canSeeLearner/);
  const handlers = routeSrc.match(/router\.\w+\("\/:learnerId[^;]*?\n\s*try \{\n(.*)/g) || [];
  assert.ok(handlers.length >= 4, "expected the list and the three writes");
  for (const h of handlers) {
    assert.match(h, /loadLearner\(req, res/, `learner route without the gate: ${h.slice(0, 60)}`);
  }
});

test("every query is family-scoped, not only learner-scoped", () => {
  const queries = routeSrc.match(/db\.query\(\s*[`"][\s\S]*?[`"],/g) || [];
  const onAssessments = queries.filter((q) => /assessments/.test(q));
  assert.ok(onAssessments.length >= 4);
  for (const q of onAssessments) assert.match(q, /family_id/, `unscoped query: ${q.slice(0, 80)}`);
});

test("a tutor may record their student's results; an observer records nothing", () => {
  assert.equal(perm.can({ role: "parent", guideRole: "assistant" }, "record_assessment"), true);
  assert.equal(perm.can({ role: "parent", guideRole: "observer" }, "record_assessment"), false);
  assert.equal(perm.can({ role: "learner" }, "record_assessment"), false);
});
