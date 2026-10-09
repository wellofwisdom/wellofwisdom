// SPDX-License-Identifier: AGPL-3.0-or-later
// Shape validation for the family import: a foreign or corrupt zip is
// rejected with a problem list before anything can write. No database here:
// the DB-touching paths are covered by the route integration tests.
const test = require("node:test");
const assert = require("node:assert/strict");
const { ZipArchive } = require("archiver");
const fi = require("./familyimport");

function buildZip(files) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];
    archive.on("data", (c) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const f of files) archive.append(f.data, { name: f.name });
    archive.finalize();
  });
}

const T0 = "2026-01-15T09:30:00.000Z";

function manifest(overrides = {}) {
  return {
    family: { id: 1, name: "Export Fam", join_code: "ABC123", created_at: T0 },
    guides: [{ id: 2, name: "Parent", email: "p@x.com", guide_role: "owner", created_at: T0 }],
    learners: [{
      id: 10, name: "Maya", username: "maya", grade_level: 3, interests: ["space"],
      reading_level: null, ai_notes: null, email: null, tutor_mode: "hints",
      prefs: { lang: "en" }, created_at: T0,
    }],
    plans: [{
      id: 20, family_id: 1, title: "Fall term", subject: "Science", goal: null,
      start_date: "2026-09-01", end_date: "2026-12-18", sessions_per_week: 3,
      minutes_per_session: 30, status: "active", created_by: 2, created_at: T0, updated_at: T0,
    }],
    planMilestones: [{
      id: 21, plan_id: 20, title: "First moon", description: null, position: 0,
      target_date: "2026-09-15", course_id: 30, project_ideas: [], resources: [], created_at: T0,
    }],
    planEnrollments: [{ id: 22, plan_id: 20, learner_id: 10, lens_override: null, personal_note: null }],
    events: [{
      id: 23, family_id: 1, title: "Field trip", description: null, on_date: "2026-10-01",
      at_time: "10:00", kind: "field_trip", plan_id: 20, course_id: null, notified_at: null,
      created_by: 2, created_at: T0,
    }],
    notes: [{ id: 24, family_id: 1, parent_id: null, title: "Reading list", icon: null, body: "Books", position: 0, created_by: 2, created_at: T0, updated_at: T0 }],
    resources: [{ id: 25, family_id: 1, title: "Museum", url: "https://m.example", type: "place", subject: null, status: "inbox", rating: 0, date_for: null, notes: null, course_id: null, plan_id: 20, created_by: 2, created_at: T0, updated_at: T0 }],
    reports: [{ id: 26, family_id: 1, learner_id: 10, period_start: "2026-09-01", period_end: "2026-09-30", title: "September", stats: {}, narrative: "ok", created_by: 2, created_at: T0, updated_at: T0 }],
    attendance: [{ id: 27, family_id: 1, learner_id: 10, day: "2026-09-02", counted: true, minutes: 120, note: null, created_by: 2, created_at: T0, updated_at: T0 }],
    assessments: [{ id: 28, family_id: 1, learner_id: 10, taken_on: "2026-09-20", kind: "test", title: "Unit test", given_by: null, grade_level: 3, scores: [], summary: null, created_by: 2, created_at: T0, updated_at: T0 }],
    badges: [{ id: 29, family_id: 1, learner_id: 10, badge: "first_lesson", earned_at: T0 }],
    tutorThreads: [{ id: 31, family_id: 1, learner_id: 10, lesson_id: 40, item_id: 41, title: "Why is the sky blue", created_at: T0, updated_at: T0 }],
    tutorMessages: [{ id: 32, thread_id: 31, role: "learner", content: "why?", refused: false, created_at: T0 }],
    attempts: [{ id: 33, family_id: 1, learner_id: 10, item_id: 41, question_index: 0, correct: true, answer: "c2", created_at: T0 }],
    completions: [{ id: 34, family_id: 1, learner_id: 10, course_id: 30, lesson_id: 40, completed_at: T0 }],
    reviewSchedule: [{ id: 35, family_id: 1, learner_id: 10, item_id: 41, ease: "2.50", interval_days: 3, reps: 2, lapses: 0, due_at: T0, updated_at: T0 }],
    uploads: [],
    ...overrides,
  };
}

const COURSE = {
  format: "wellofwisdom-course",
  version: 1,
  title: "Space for beginners",
  topic: "Space",
  lens: null,
  gradeLevel: 3,
  description: "A test course",
  license: null,
  author: null,
  includesAnswers: true,
  units: [{
    title: "Unit 1",
    lessons: [{
      title: "Lesson 1",
      summary: "Intro",
      items: [{ type: "article", content: { title: "Intro", body: "Hello world" } }],
    }],
  }],
};

async function exportZip(overrides = {}, courses = [COURSE], extra = []) {
  const files = [
    { name: "family.json", data: JSON.stringify(manifest(overrides)) },
    ...courses.map((c, i) => ({ name: `courses/${30 + i}.wow-course.json`, data: JSON.stringify(c) })),
    ...extra,
  ];
  return buildZip(files);
}

test("parseFamilyZip: a real export shape parses clean", async () => {
  const buf = await exportZip({}, [COURSE], [{ name: "uploads/50.png", data: Buffer.from([1, 2, 3]) }]);
  const parsed = fi.parseFamilyZip(buf);
  assert.equal(parsed.manifest.learners.length, 1);
  assert.equal(parsed.courses.length, 1);
  assert.equal(parsed.courses[0].oldId, 30);
  assert.equal(parsed.manifest.attempts.length, 1);
});

test("parseFamilyZip: missing family.json is rejected", async () => {
  const buf = await buildZip([{ name: "readme.txt", data: "not an export" }]);
  assert.throws(() => fi.parseFamilyZip(buf), (e) => e.code === "shape_invalid" && /family\.json/.test(e.problems[0]));
});

test("parseFamilyZip: a foreign zip with a wrong manifest is rejected with a problem list", async () => {
  const buf = await buildZip([{ name: "family.json", data: JSON.stringify({ hello: "world" }) }]);
  assert.throws(() => fi.parseFamilyZip(buf), (e) => {
    return e.code === "shape_invalid" && e.problems.some((p) => /learners section missing/.test(p));
  });
});

test("parseFamilyZip: invalid usernames and bad enum values are listed, not swallowed", async () => {
  const buf = await exportZip({
    learners: [{ id: 10, name: "X", username: "Not A Username!", grade_level: 99, prefs: {} }],
    events: [{ id: 23, family_id: 1, title: "E", on_date: "tomorrow", kind: "party", created_by: 2, created_at: T0 }],
    resources: [{ id: 25, family_id: 1, title: "R", type: "spaceship", status: "inbox", rating: 9, created_by: 2, created_at: T0, updated_at: T0 }],
  });
  try {
    fi.parseFamilyZip(buf);
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.code, "shape_invalid");
    const joined = e.problems.join(" | ");
    assert.ok(/username/.test(joined), joined);
    assert.ok(/grade_level/.test(joined), joined);
    assert.ok(/events\[0\].on_date/.test(joined), joined);
    assert.ok(/kind/.test(joined), joined);
    assert.ok(/type/.test(joined), joined);
    assert.ok(/rating/.test(joined), joined);
  }
});

test("parseFamilyZip: two learners with the same username are rejected", async () => {
  const buf = await exportZip({
    learners: [
      { id: 10, name: "A", username: "maya", prefs: {}, created_at: T0 },
      { id: 11, name: "B", username: "maya", prefs: {}, created_at: T0 },
    ],
  });
  assert.throws(() => fi.parseFamilyZip(buf), (e) => e.code === "shape_invalid" && e.problems.some((p) => /share username/.test(p)));
});

test("parseFamilyZip: a course file that is not a course package rejects the whole zip", async () => {
  const buf = await buildZip([
    { name: "family.json", data: JSON.stringify(manifest()) },
    { name: "courses/30.wow-course.json", data: JSON.stringify({ format: "something-else" }) },
  ]);
  assert.throws(() => fi.parseFamilyZip(buf), (e) => e.code === "shape_invalid" && /wellofwisdom-course/.test(e.problems[0]));
});

test("parseFamilyZip: ids come through as numbers whether pg wrote strings or not", async () => {
  const m = manifest();
  m.learners[0].id = "10"; // bigint-as-string, the way pg hands rows to JSON
  m.plans[0].id = "20";
  const buf = await buildZip([{ name: "family.json", data: JSON.stringify(m) }]);
  const parsed = fi.parseFamilyZip(buf);
  assert.ok(parsed.manifest.learners.length === 1);
});

test("extFor matches the export route's naming table", () => {
  assert.equal(fi.extFor("image/png"), "png");
  assert.equal(fi.extFor("image/jpeg"), "jpg");
  assert.equal(fi.extFor("video/mp4"), "mp4");
  assert.equal(fi.extFor("audio/mpeg"), "mp3");
  assert.equal(fi.extFor("application/octet-stream"), "bin");
  assert.equal(fi.extFor(null), "bin");
});

test("dupKey: the same row always produces the same key (second import skips, not doubles)", () => {
  const row = { username: "Maya ", bytes: "123", original_name: "a.png", title: null, title2: null };
  const a = fi.dupKey.learners(row);
  const b = fi.dupKey.learners({ username: "maya" });
  assert.equal(a, b);
  const u1 = fi.dupKey.uploads({ original_name: "a.png", bytes: 123, title: null });
  const u2 = fi.dupKey.uploads({ original_name: "a.png", bytes: "123", title: null });
  assert.equal(u1, u2);
});
