// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const digest = require("./digest");

const QUIET = { lessons: 0, answers: 0, correct: 0, reviews_due: 0, newBadges: [], upcoming: [], streak: { current: 0, best: 0 } };

test("firstName: first word, or a friendly fallback", () => {
  assert.equal(digest.firstName("Hazel Rose Quinn"), "Hazel");
  assert.equal(digest.firstName("  Wren  "), "Wren");
  assert.equal(digest.firstName(""), "there");
  assert.equal(digest.firstName(null), "there");
});

test("shouldSendLearnerNote: a learner who has not started gets nothing", () => {
  assert.equal(digest.shouldSendLearnerNote(QUIET), false);
  assert.equal(digest.shouldSendLearnerNote(null), false);
});

test("shouldSendLearnerNote: any one signal is enough", () => {
  for (const signal of [
    { lessons: 1 }, { answers: 3 }, { reviews_due: 2 },
    { newBadges: [{ id: "first_lesson" }] }, { upcoming: [{ title: "Exam" }] },
  ]) {
    assert.equal(digest.shouldSendLearnerNote({ ...QUIET, ...signal }), true, JSON.stringify(signal));
  }
});

test("shouldSendLearnerNote: a quiet week still mails when reviews are waiting", () => {
  // The nudge case — no activity, but work is due, so silence would be worse.
  assert.equal(digest.shouldSendLearnerNote({ ...QUIET, reviews_due: 7 }), true);
});

test("learnerNoteHtml: reports the learner's own week", () => {
  const html = digest.learnerNoteHtml(
    { id: 1, name: "Hazel Quinn" },
    {
      lessons: 3, answers: 20, correct: 17, reviews_due: 4,
      newBadges: [{ id: "streak_3", label: "Warming Up", icon: "🔥" }],
      upcoming: [{ title: "Biology exam", on_date: "2026-09-04" }],
      streak: { current: 5, best: 5 },
    },
    "https://wellofwisdom.app"
  );
  assert.match(html, /Hi Hazel/);
  assert.match(html, /3 lessons finished/);
  assert.match(html, /20 questions answered — 85% right/);
  assert.match(html, /5-day streak/);
  assert.match(html, /Warming Up/);
  assert.match(html, /4 reviews ready/);
  assert.match(html, /Biology exam/);
  assert.match(html, /https:\/\/wellofwisdom\.app/);
});

test("learnerNoteHtml: singular wording and no streak line below two days", () => {
  const html = digest.learnerNoteHtml(
    { id: 1, name: "Wren" },
    { ...QUIET, lessons: 1, answers: 1, correct: 1, reviews_due: 1, streak: { current: 1, best: 3 } },
    "https://wellofwisdom.app"
  );
  assert.match(html, /1 lesson finished/);
  assert.match(html, /1 question answered/);
  assert.match(html, /1 review ready/);
  assert.doesNotMatch(html, /streak/);
});

test("learnerNoteHtml: a quiet week is an invitation, not a scolding", () => {
  const html = digest.learnerNoteHtml({ id: 1, name: "Wren" }, { ...QUIET, upcoming: [{ title: "Field trip", on_date: "2026-09-02" }] }, "https://wellofwisdom.app");
  assert.match(html, /whenever you are/);
  assert.doesNotMatch(html, /0 lessons/);
});

test("learnerNoteHtml: escapes names and titles", () => {
  const html = digest.learnerNoteHtml(
    { id: 1, name: "<script>x</script>" },
    { ...QUIET, upcoming: [{ title: "Trip & <b>tour</b>", on_date: "2026-09-02" }] },
    "https://wellofwisdom.app"
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Trip &amp; &lt;b&gt;tour&lt;\/b&gt;/);
});
