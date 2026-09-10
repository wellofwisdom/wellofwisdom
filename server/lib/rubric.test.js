// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const rubric = require("./rubric");

test("criteriaFrom: bullets, numbers and dashes all become clean criteria", () => {
  const out = rubric.criteriaFrom("- Explains the method\n* Shows the working\n1. Says what surprised you");
  assert.deepEqual(out, ["Explains the method", "Shows the working", "Says what surprised you"]);
});

test("criteriaFrom: a single run-on line stays one criterion, no invented structure", () => {
  const out = rubric.criteriaFrom("A good write up explains what you built and why it works");
  assert.equal(out.length, 1);
});

test("criteriaFrom: semicolons split a one-line rubric the guide wrote that way", () => {
  assert.deepEqual(rubric.criteriaFrom("clear diagram; measurements shown; a conclusion"),
    ["clear diagram", "measurements shown", "a conclusion"]);
});

test("criteriaFrom: nothing in, nothing out", () => {
  assert.deepEqual(rubric.criteriaFrom(""), []);
  assert.deepEqual(rubric.criteriaFrom(null), []);
});

test("criteriaFrom: a runaway rubric is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => `- criterion ${i}`).join("\n");
  assert.equal(rubric.criteriaFrom(many).length, rubric.MAX_CRITERIA);
});

test("normalizeFeedback: the criteria are the guide's, not the model's", () => {
  const out = rubric.normalizeFeedback(
    {
      criteria: [
        { criterion: "something the model made up", verdict: "met", note: "good" },
        { criterion: "another invention", verdict: "met", note: "also good" },
      ],
    },
    ["Shows the working"]
  );
  assert.equal(out.criteria.length, 1);
  assert.equal(out.criteria[0].criterion, "Shows the working");
});

test("normalizeFeedback: an unknown verdict or outcome is dropped, never coerced", () => {
  const out = rubric.normalizeFeedback(
    { criteria: [{ verdict: "A+", note: "n" }], suggestedOutcome: "97%" },
    ["Shows the working"]
  );
  assert.equal(out.criteria[0].verdict, null);
  assert.equal(out.suggestedOutcome, null);
});

test("normalizeFeedback: junk in gives an empty draft, not a crash", () => {
  for (const junk of [null, undefined, "a string", 42, []]) {
    const out = rubric.normalizeFeedback(junk, ["One thing"]);
    assert.equal(out.toLearner, "");
    assert.equal(out.criteria.length, 1);
    assert.equal(out.criteria[0].verdict, null);
  }
});

test("normalizeFeedback: only the known fields survive, so nothing new can leak", () => {
  const out = rubric.normalizeFeedback(
    { toLearner: "Nice work", secretGrade: "F", learnerEmail: "a@b.c" },
    []
  );
  assert.deepEqual(
    Object.keys(out).sort(),
    ["criteria", "forGuide", "improve", "strengths", "suggestedOutcome", "toLearner"]
  );
});

test("normalizeFeedback: lists are clamped to three and to length", () => {
  const out = rubric.normalizeFeedback(
    { strengths: ["a", "b", "c", "d", "e"], improve: ["x".repeat(999)] },
    []
  );
  assert.equal(out.strengths.length, 3);
  assert.equal(out.improve[0].length, 300);
});

test("wordCount: an empty page is zero, not one", () => {
  assert.equal(rubric.wordCount(""), 0);
  assert.equal(rubric.wordCount("   \n  "), 0);
  assert.equal(rubric.wordCount("three little words"), 3);
});

test("draftFeedback: too little work spends no AI call at all", async () => {
  const out = await rubric.draftFeedback({
    title: "Build a bridge",
    rubric: "- It stands up",
    body: "i did it",
    familyId: 1,
  });
  assert.equal(out.note, "too_short");
  assert.equal(out.toLearner, "");
  assert.equal(out.criteria.length, 1);
});

test("the outcome vocabulary is a closed set, and never a percentage", () => {
  assert.deepEqual(rubric.OUTCOME_IDS, ["not_yet", "nearly", "met", "exceptional"]);
  for (const o of rubric.OUTCOMES) assert.ok(o.label && o.blurb);
});

test("the prompt tells the model it is drafting for a person to review", () => {
  assert.match(rubric.SYSTEM, /NOT the final word/);
  assert.match(rubric.SYSTEM, /before the learner sees/);
});

test("buildMessages: the work is sent, the learner's name is not", () => {
  const msgs = rubric.buildMessages({
    title: "Bridge",
    description: "Build one",
    criteria: ["It stands up"],
    body: "I used lolly sticks.",
    gradeLevel: 5,
  });
  assert.equal(msgs.length, 2);
  const payload = JSON.parse(msgs[1].content);
  assert.equal(payload.work, "I used lolly sticks.");
  assert.deepEqual(payload.rubric, ["It stands up"]);
  assert.equal(payload.learnerGradeLevel, 5);
  assert.ok(!("name" in payload));
});
