// SPDX-License-Identifier: AGPL-3.0-or-later
// The normalizer is the difference between a child saying 3/4 and being
// marked wrong for it, so every rule the packet names is asserted here.
const test = require("node:test");
const assert = require("node:assert/strict");
const speech = require("./speech");

test("filler words go and the freed spacing is tidied", () => {
  assert.equal(speech.normalize("um three quarters"), "three quarters");
  assert.equal(speech.normalize("uh, the, um, answer is five"), "the, answer is five");
  assert.equal(speech.normalize("I think, uh, it's  um  42"), "I think, it's 42");
  assert.equal(speech.normalize("   "), "");
  assert.equal(speech.normalize(null), "");
});

test("a leading 'the answer is' is dropped for answers, kept in prose", () => {
  // Text answers are the child's own words, so the opener stays there.
  assert.equal(speech.normalizeForKind("The answer is forty two", "text").text, "The answer is forty two");
  assert.equal(speech.normalizeForKind("The answer is forty two", "numeric").text, "42");
  assert.equal(speech.normalizeForKind("I think it's three", "numeric").text, "3");
  assert.equal(speech.normalizeForKind("the answer is not zero", "numeric").text, "not 0");
  assert.equal(speech.normalizeForKind("Tell me the answer is right", "numeric").text, "Tell me the answer is right");
});

test("number words become digits", () => {
  assert.equal(speech.spokenToNumbers("five"), "5");
  assert.equal(speech.spokenToNumbers("twenty three"), "23");
  assert.equal(speech.spokenToNumbers("one hundred and five"), "105");
  assert.equal(speech.spokenToNumbers("two hundred thirty four"), "234");
  assert.equal(speech.spokenToNumbers("five thousand"), "5000");
  // Already-digit answers pass through untouched.
  assert.equal(speech.spokenToNumbers("3/4"), "3/4");
  assert.equal(speech.spokenToNumbers("x = 12"), "x = 12");
});

test("fractions, the words a maths answer actually arrives in", () => {
  assert.equal(speech.spokenToNumbers("three quarters"), "3/4");
  assert.equal(speech.spokenToNumbers("two thirds"), "2/3");
  assert.equal(speech.spokenToNumbers("seven eighths"), "7/8");
  assert.equal(speech.spokenToNumbers("three fourths"), "3/4");
  assert.equal(speech.spokenToNumbers("five sixteenths"), "5/16");
  assert.equal(speech.spokenToNumbers("a half"), "1/2");
  assert.equal(speech.spokenToNumbers("a quarter"), "1/4");
  assert.equal(speech.spokenToNumbers("one half"), "1/2");
  assert.equal(speech.spokenToNumbers("half"), "1/2");
  assert.equal(speech.spokenToNumbers("three over four"), "3/4");
});

test("mixed numbers keep their whole part", () => {
  assert.equal(speech.spokenToNumbers("one and a half"), "1 1/2");
  assert.equal(speech.spokenToNumbers("one and three quarters"), "1 3/4");
  assert.equal(speech.spokenToNumbers("two and three quarters"), "2 3/4");
  assert.equal(speech.spokenToNumbers("three and a half"), "3 1/2");
  assert.equal(speech.spokenToNumbers("ten and five sixteenths"), "10 5/16");
});

test("decimals and percent", () => {
  assert.equal(speech.spokenToNumbers("three point five"), "3.5");
  assert.equal(speech.spokenToNumbers("zero point two five"), "0.25");
  assert.equal(speech.spokenToNumbers("point five"), "0.5");
  assert.equal(speech.spokenToNumbers("three point one four"), "3.14");
  assert.equal(speech.spokenToNumbers("fifty percent"), "50%");
  assert.equal(speech.spokenToNumbers("twenty five per cent"), "25%");
});

test("negative and minus", () => {
  assert.equal(speech.spokenToNumbers("negative five"), "-5");
  assert.equal(speech.spokenToNumbers("minus five"), "-5");
  assert.equal(speech.spokenToNumbers("minus three quarters"), "-3/4");
  assert.equal(speech.spokenToNumbers("negative one and a half"), "-1 1/2");
});

test("a numeric answer lands as the number, not the sentence around it", () => {
  const r = (s) => speech.normalizeForKind(s, "numeric");
  assert.equal(r("um, three quarters").text, "3/4");
  assert.equal(r("it's three quarters").text, "3/4");
  assert.equal(r("x equals three quarters").text, "3/4");
  assert.equal(r("three quarters.").text, "3/4");
  assert.equal(r("one and a half").text, "1 1/2");
  // Two numbers, no guessing: the whole phrase goes in the box for the
  // learner to fix before they submit.
  assert.equal(r("forty two not thirty").text, "42 not 30");
  // Nothing numeric at all: the words are still shown, typed path decides.
  assert.equal(r("I don't know").text, "I don't know");
  // What the provider heard stays readable in the transcript.
  assert.equal(r("um, three quarters").transcript, "three quarters");
});

test("text answers keep their words", () => {
  const r = speech.normalizeForKind("um the cat sat on one mat", "text");
  assert.equal(r.text, "the cat sat on one mat");
  assert.equal(r.transcript, "the cat sat on one mat");
  assert.equal(r.choiceIndex, null);
  assert.equal(r.kind, "text");
});

test("choice words map to a position in the choice list", () => {
  assert.equal(speech.choiceIndex("B", 4), 1);
  assert.equal(speech.choiceIndex("b.", 4), 1);
  assert.equal(speech.choiceIndex("be", 4), 1);
  assert.equal(speech.choiceIndex("option b", 4), 1);
  assert.equal(speech.choiceIndex("the letter c", 4), 2);
  assert.equal(speech.choiceIndex("A", 4), 0);
  assert.equal(speech.choiceIndex("the second one", 4), 1);
  assert.equal(speech.choiceIndex("the third", 4), 2);
  assert.equal(speech.choiceIndex("second", 4), 1);
  assert.equal(speech.choiceIndex("option two", 4), 1);
  assert.equal(speech.choiceIndex("number 3", 4), 2);
  assert.equal(speech.choiceIndex("choice four", 4), 3);
  assert.equal(speech.choiceIndex("the last one", 4), 3);
  assert.equal(speech.choiceIndex("2", 4), 1);
});

test("choice mapping refuses to guess", () => {
  assert.equal(speech.choiceIndex("I have two cats", 4), null);
  assert.equal(speech.choiceIndex("B because plants need light", 4), null);
  assert.equal(speech.choiceIndex("the second one", 2), 1);
  // Out of range for a two choice question.
  assert.equal(speech.choiceIndex("option four", 2), null);
  assert.equal(speech.choiceIndex("", 4), null);
  assert.equal(speech.choiceIndex("B", 0), null);
});

test("an mcq answer carries both the words and the position", () => {
  const r = speech.normalizeForKind("um, the second one", "mcq", 4);
  assert.equal(r.kind, "mcq");
  assert.equal(r.text, "the second one");
  assert.equal(r.choiceIndex, 1);
  const none = speech.normalizeForKind("um, three quarters", "mcq", 4);
  assert.equal(none.choiceIndex, null);
});

test("an empty transcript normalizes to nothing rather than to a dash", () => {
  const r = speech.normalizeForKind("um uh", "numeric");
  assert.equal(r.text, "");
  assert.equal(r.transcript, "");
});

test("spoken answers grade the same as typed ones", () => {
  const grade = require("./grade");
  const numeric = (said, key) =>
    grade.gradeExercise({ kind: "numeric", answer: key }, speech.normalizeForKind(said, "numeric").text);
  assert.equal(numeric("three quarters", "0.75"), true);
  assert.equal(numeric("one and a half", "1.5"), true);
  assert.equal(numeric("negative five", "-5"), true);
  assert.equal(numeric("um two thirds", "2/3"), true);
  assert.equal(numeric("three quarters", "0.5"), false);
  const mcq = (said, key, ids) =>
    grade.gradeExercise(
      { kind: "mcq", answer: key, choices: ids.map((id) => ({ id, text: id })) },
      ids[speech.normalizeForKind(said, "mcq", ids.length).choiceIndex]
    );
  assert.equal(mcq("the second one", "B", ["A", "B", "C"]), true);
  assert.equal(mcq("be", "B", ["A", "B", "C"]), true);
});
