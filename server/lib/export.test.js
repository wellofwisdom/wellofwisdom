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

test("export: family.json contains no password or PIN hashes", async () => {
  // Stub db.query to return rows that contain hash fields, then verify
  // collectFamily strips them via its belt-and-braces filter.
  const db = require("./db");
  const origQuery = db.query;
  const hashRow = {
    id: 1, name: "Leaker", username: "leak", password_hash: "scrypt$abc$def",
    pin_hash: "scrypt$123$456", token_hash: "deadbeef", google_sub: "999",
    grade_level: 5, interests: [], reading_level: null, ai_notes: null,
    email: "a@b.com", tutor_mode: "full", prefs: {}, created_at: new Date().toISOString(),
  };
  const parentRow = {
    id: 99, name: "Parent", email: "p@p.com", guide_role: "owner",
    password_hash: "scrypt$xxx$yyy", token_hash: "toktok", google_sub: "111",
    created_at: new Date().toISOString(),
  };
  db.query = async (sql) => {
    const s = String(sql);
    if (s.includes("families where id")) return { rows: [{ id: 1, name: "Fam", join_code: "ABC", created_at: new Date().toISOString() }] };
    if (s.includes("role = 'learner'")) return { rows: [hashRow] };
    if (s.includes("role = 'parent'")) return { rows: [parentRow] };
    if (s.includes("invites")) return { rows: [{ id: 1, token_hash: "invhash", family_id: 1 }] };
    // All other tables return empty
    return { rows: [] };
  };
  try {
    // Force fresh require so module picks up the stubbed db
    delete require.cache[require.resolve("./export")];
    const { collectFamily } = require("./export");
    const data = await collectFamily(1);
    const json = JSON.stringify(data);
    assert.equal(json.includes("password_hash"), false, "password_hash leaked into export");
    assert.equal(json.includes("pin_hash"), false, "pin_hash leaked into export");
    assert.equal(json.includes("token_hash"), false, "token_hash leaked into export");
    assert.equal(json.includes("google_sub"), false, "google_sub leaked into export");
    assert.equal(json.includes("scrypt$"), false, "hash value leaked into export");
    // But non-secret fields should still be there
    assert.equal(data.learners[0].name, "Leaker");
    assert.equal(data.learners[0].username, "leak");
    assert.equal(data.guides[0].name, "Parent");
  } finally {
    db.query = origQuery;
    delete require.cache[require.resolve("./export")];
  }
});

test("export: family route uses streaming append (not getBuffer) for uploads", async () => {
  // Verify the source of the export route uses storage.get (stream) not storage.getBuffer
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../routes/family.js"), "utf8");
  // The upload loop should call storage.get, not storage.getBuffer
  assert.equal(src.includes("storage.getBuffer(up.storage_key)"), false, "family export should not buffer whole uploads into memory");
  assert.equal(src.includes("storage.get(up.storage_key"), true, "family export should stream via storage.get");
  assert.equal(src.includes("archive.append(s.stream"), true, "family export should append the read stream to the archive");
});
