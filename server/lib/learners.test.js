// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const learners = require("./learners");

test("shape: bigint id arrives from pg as a string and must become a number", () => {
  // The exact row /api/me used to hand the browser. `"13" === 13` is false,
  // which made the profile page bounce straight back to the list.
  const row = { id: "13", name: "Isabella Treman", username: "isabella" };
  const out = learners.shape(row);
  assert.strictEqual(out.id, 13);
  assert.strictEqual(typeof out.id, "number");
  assert.ok(out.id === 13, "a numeric route param must match the shaped id");
});

test("shape: leaves every other field untouched", () => {
  const row = {
    id: "7", name: "Wren", username: "wren", grade_level: 9,
    interests: ["drawing"], reading_level: "at grade",
    ai_notes: "likes short lessons", email: "wren@example.com",
    created_at: "2026-08-01T00:00:00.000Z",
  };
  assert.deepEqual(learners.shape(row), { ...row, id: 7 });
});

test("shape: null-safe", () => {
  assert.equal(learners.shape(null), null);
  assert.equal(learners.shape(undefined), null);
});

test("FIELDS carries the columns the profile form writes back", () => {
  // A missing column here loads blank in the form and the save writes the
  // blank over real data — how ai_notes and email would have been lost.
  for (const col of ["id", "name", "username", "grade_level", "interests",
    "reading_level", "ai_notes", "email", "created_at"]) {
    assert.match(learners.FIELDS, new RegExp(`\\b${col}\\b`), `FIELDS is missing ${col}`);
  }
});

test("listForFamily: scopes to the family and shapes every row", async () => {
  const calls = [];
  const fakeDb = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: "13", name: "Isabella" }, { id: "14", name: "Wren" }] };
    },
  };
  const rows = await learners.listForFamily(fakeDb, 4);
  assert.deepEqual(rows.map((r) => r.id), [13, 14]);
  assert.match(calls[0].sql, /family_id = \$1/);
  assert.match(calls[0].sql, /role = 'learner'/);
  assert.deepEqual(calls[0].params, [4]);
});
