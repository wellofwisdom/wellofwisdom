// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const roster = require("./roster");

test("parseCsv: comma delimiter basic", () => {
  const out = roster.parseCsv("name,grade,interests\nMaya,3,sewing; horses\n");
  assert.equal(out.delim, ",");
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].name, "Maya");
  assert.equal(out.rows[0].grade, "3");
});

test("parseCsv: semicolon delimiter detected", () => {
  const out = roster.parseCsv("name;grade;interests\nMaya;3;sewing\n");
  assert.equal(out.delim, ";");
  assert.equal(out.rows[0].name, "Maya");
});

test("parseCsv: quoted fields with comma inside", () => {
  const out = roster.parseCsv('name,grade\n"Doe, Jane",4\n');
  assert.equal(out.rows[0].name, "Doe, Jane");
});

test("parseCsv: UTF-8 BOM stripped", () => {
  const out = roster.parseCsv("\ufeffname,grade\nMaya,3\n");
  assert.equal(out.rows[0].name, "Maya");
});

test("parseCsv: header aliases (Grade, Grade Level, interests)", () => {
  const out = roster.parseCsv("Full Name,Grade Level,Hobbies\nMaya,5,sewing\n");
  assert.equal(out.rows[0].name, "Maya");
  assert.equal(out.rows[0].grade, "5");
  assert.equal(out.rows[0].interests, "sewing");
});

test("parseCsv: header alias for target_language", () => {
  const out = roster.parseCsv("name,target_language\nMaya,es\n");
  assert.equal(out.rows[0].target_language, "es");
  const out2 = roster.parseCsv("name,language\nMaya,fr\n");
  assert.equal(out2.rows[0].target_language, "fr");
});

test("toUsername: generates from name and dedupes", () => {
  const used = new Set(["maya"]);
  const u = roster.toUsername("Maya Smith", used);
  assert.match(u, /^[a-z0-9_]+$/);
  assert.equal(u !== "maya", true);
});

test("validateRows: flags bad grade, bad email, duplicate in file", () => {
  const rows = [
    { name: "Maya", username: "maya", grade: "99", interests: "", email: "bad", __raw: [] },
    { name: "Maya", username: "maya", grade: "", interests: "", email: "", __raw: [] },
  ];
  const v = roster.validateRows(rows, []);
  assert.ok(v.validated[0].errors.includes("grade_invalid"));
  assert.ok(v.validated[0].errors.includes("email_invalid"));
  assert.ok(v.validated[1].errors.includes("username_duplicate_in_file"));
});

test("validateRows: duplicate against existing usernames", () => {
  const rows = [{ name: "Maya", username: "maya", grade: "", interests: "", email: "", __raw: [] }];
  const v = roster.validateRows(rows, ["maya"]);
  assert.ok(v.validated[0].errors.includes("username_taken"));
});

test("validateRows: caps at 200 rows", () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({ name: `Kid ${i}`, username: `kid${i}`, grade: "", interests: "", email: "", __raw: [] }));
  const v = roster.validateRows(rows, []);
  assert.equal(v.capExceeded, true);
  assert.ok(v.validated[200].errors.includes("row_cap_exceeded"));
});

test("validateRows: empty username gets generatedUsername", () => {
  const rows = [{ name: "Maya Smith", username: "", grade: "", interests: "", email: "", __raw: [] }];
  const v = roster.validateRows(rows, []);
  assert.equal(v.validated[0].generatedUsername != null, true);
  assert.equal(v.validated[0].valid, true);
});

test("validateRows: interests semicolon separated", () => {
  const rows = [{ name: "Maya", username: "maya", grade: "", interests: "sewing; horses; space", email: "", __raw: [] }];
  const v = roster.validateRows(rows, []);
  assert.deepEqual(v.validated[0].interests, ["sewing", "horses", "space"]);
});

test("validateRows: target_language defaults to en when blank", () => {
  const rows = [{ name: "Maya", username: "maya", grade: "", interests: "", email: "", __raw: [] }];
  const v = roster.validateRows(rows, []);
  assert.equal(v.validated[0].language, "en");
  assert.equal(v.validated[0].valid, true);
});

test("validateRows: target_language accepts en es fr", () => {
  const rows = [
    { name: "A", username: "a1", grade: "", interests: "", email: "", target_language: "en", __raw: [] },
    { name: "B", username: "b1", grade: "", interests: "", email: "", target_language: "es", __raw: [] },
    { name: "C", username: "c1", grade: "", interests: "", email: "", target_language: "fr", __raw: [] },
  ];
  const v = roster.validateRows(rows, []);
  assert.equal(v.validated[0].language, "en");
  assert.equal(v.validated[1].language, "es");
  assert.equal(v.validated[2].language, "fr");
  for (const r of v.validated) assert.equal(r.valid, true);
});

test("validateRows: target_language invalid value flags error", () => {
  const rows = [{ name: "Maya", username: "maya", grade: "", interests: "", email: "", target_language: "xx", __raw: [] }];
  const v = roster.validateRows(rows, []);
  assert.ok(v.validated[0].errors.includes("language_invalid"));
  assert.equal(v.validated[0].valid, false);
});

test("normalizeRosterLang: handles aliases and casing", () => {
  assert.equal(roster.normalizeRosterLang("en"), "en");
  assert.equal(roster.normalizeRosterLang("EN"), "en");
  assert.equal(roster.normalizeRosterLang("Spanish"), "es");
  assert.equal(roster.normalizeRosterLang("français"), "fr");
  assert.equal(roster.normalizeRosterLang(""), "en");
  assert.equal(roster.normalizeRosterLang("xx"), null);
});

test("parseCsv: target_language column is parsed and validated in preview", () => {
  const out = roster.parseCsv("name,target_language\nMaya,es\nJon,fr\n");
  const v = roster.validateRows(out.rows, []);
  assert.equal(v.validated[0].language, "es");
  assert.equal(v.validated[1].language, "fr");
});
