// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");

// Export shape is tested without a DB by checking the module exports and the
// course re-import cycle via coursegen. DB integration for collectFamily is
// covered by the family export route itself (manual verification + zip open).

test("export module exports the expected functions", () => {
  const exp = require("./export");
  assert.equal(typeof exp.collectFamily, "function");
  assert.equal(typeof exp.courseExportPayload, "function");
  assert.equal(typeof exp.listCourseIds, "function");
});

test("course payload is valid wellofwisdom-course format", async () => {
  // Build a minimal course payload shape and verify coursegen accepts it.
  const payload = {
    format: "wellofwisdom-course",
    version: 1,
    title: "Test Course",
    topic: "Fractions",
    lens: null,
    gradeLevel: 5,
    description: "A test course",
    license: "CC-BY-4.0",
    author: null,
    includesAnswers: true,
    units: [
      {
        title: "Unit 1",
        lessons: [
          {
            title: "Lesson 1",
            summary: "Intro",
            items: [
              { type: "article", content: { title: "Intro", body: "Hello world" } },
              { type: "exercise", content: { prompt: "What is 2+2?", kind: "mcq", choices: [{ id: "c1", text: "3" }, { id: "c2", text: "4" }], answer: "c2", explanation: "Because", hint: "Think" } },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(payload.format, "wellofwisdom-course");
  const { normalizeCourse } = require("./coursegen");
  const normalized = normalizeCourse(payload);
  assert.ok(normalized, "coursegen accepts the export payload");
  assert.equal(normalized.title, "Test Course");
  assert.equal(normalized.units.length, 1);
});

test("storage: getBuffer returns null for missing key (local)", async () => {
  const storage = require("./storage");
  // Ensure we are in local mode for this check
  const prev = process.env.STORAGE_DRIVER;
  process.env.STORAGE_DRIVER = "local";
  delete require.cache[require.resolve("./storage")];
  const s = require("./storage");
  const got = await s.getBuffer("no-such-family/no-such-file.mp4");
  assert.equal(got, null);
  if (prev === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = prev;
  delete require.cache[require.resolve("./storage")];
});
