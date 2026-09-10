// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const { checkPackage, OPEN_LICENSES } = require("./coursecheck");
const cg = require("./coursegen");

const article = { type: "article", content: { title: "Read", body: "Words." } };
const mcq = (answer = "c2") => ({ type: "exercise", content: {
  kind: "mcq", prompt: "Pick", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }], answer,
} });
const lesson = (title, items) => ({ title, items });
const pkg = (units, more = {}) => ({ format: "wellofwisdom-course", title: "Latin", license: "CC-BY-4.0", units, ...more });
const good = () => pkg([{ title: "Nouns", lessons: [lesson("First", [article, mcq()])] }]);
const messages = (r) => r.errors.map((e) => `${e.at}: ${e.message}`);

test("a clean package passes, and the stats are what an import keeps", () => {
  const r = checkPackage(good(), { requireOpenLicense: true });
  assert.equal(r.ok, true, messages(r).join("\n"));
  assert.deepEqual(r.stats, { units: 1, lessons: 1, items: 2, questions: 1, missingAnswers: 0 });
});

test("the wrong format, or no title, is refused", () => {
  assert.equal(checkPackage({ ...good(), format: "other" }).ok, false);
  assert.equal(checkPackage({ ...good(), title: " " }).ok, false);
  assert.equal(checkPackage(null).ok, false);
  assert.equal(checkPackage([]).ok, false);
});

test("a library needs a licence that lets others adapt the course", () => {
  assert.ok(!OPEN_LICENSES.includes("all-rights-reserved"));
  assert.equal(checkPackage({ ...good(), license: undefined }, { requireOpenLicense: true }).ok, false);
  assert.equal(checkPackage({ ...good(), license: "all-rights-reserved" }, { requireOpenLicense: true }).ok, false);
  assert.equal(checkPackage({ ...good(), license: "CC0-1.0" }, { requireOpenLicense: true }).ok, true);
  // Without the library rule, a missing licence is not an error.
  assert.equal(checkPackage({ ...good(), license: undefined }).ok, true);
});

test("a question with no answer key is named, and is an error unless allowed", () => {
  const p = pkg([{ title: "Nouns", lessons: [lesson("First", [article, mcq(null)])] }]);
  const strict = checkPackage(p);
  assert.equal(strict.ok, false);
  assert.match(messages(strict)[0], /unit 1, lesson 1, item 2: \(exercise\) has a question with no usable answer key/);
  const lax = checkPackage(p, { allowMissingAnswers: true });
  assert.equal(lax.ok, true);
  assert.equal(lax.warnings.length, 1);
  assert.equal(lax.stats.missingAnswers, 1);
});

test("an item the import would drop is named with its place and reason", () => {
  const bad = { type: "exercise", content: { kind: "mcq", prompt: "Pick", choices: [{ id: "c1", text: "only one" }] } };
  const r = checkPackage(pkg([{ title: "Nouns", lessons: [lesson("First", [article, bad])] }]));
  assert.deepEqual(messages(r), ["unit 1, lesson 1, item 2: (exercise) is dropped: choices_required"]);
});

test("content an import keeps but changes is caught too", () => {
  const six = { type: "exercise", content: {
    kind: "mcq", prompt: "Pick", answer: "c1",
    choices: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `c${n}`, text: `${n}` })),
  } };
  const r = checkPackage(pkg([{ title: "Nouns", lessons: [lesson("First", [six])] }]));
  assert.match(messages(r).join("\n"), /loses content on import: too_many_choices/);
});

test("past the size of a course, what is cut is said out loud", () => {
  const nine = Array.from({ length: 9 }, () => article);
  const r = checkPackage(pkg([{ title: "Nouns", lessons: [lesson("Long", nine)] }]));
  assert.match(messages(r).join("\n"), /unit 1, lesson 1, item 9: is dropped: a lesson holds at most 8 items/);
  assert.equal(r.stats.items, 8);

  const sevenLessons = Array.from({ length: 7 }, (_, i) => lesson(`L${i}`, [article]));
  const r2 = checkPackage(pkg([{ title: "Nouns", lessons: sevenLessons }]));
  assert.match(messages(r2).join("\n"), /unit 1, lesson 7: and after are dropped/);
  assert.match(messages(r2).join("\n"), /unit 1, lesson 6: is dropped: a unit holds at most 5 lessons/);

  const sevenUnits = Array.from({ length: 7 }, (_, i) => ({ title: `U${i}`, lessons: [lesson("L", [article])] }));
  assert.match(messages(checkPackage(pkg(sevenUnits))).join("\n"), /unit 7: and after are dropped/);
});

test("untitled units and lessons are reported, not silently lost", () => {
  const r = checkPackage(pkg([
    { title: "", lessons: [lesson("Fine", [article])] },
    { title: "Kept", lessons: [lesson("<b></b>", [article]), lesson("Kept", [article])] },
  ]));
  const all = messages(r).join("\n");
  assert.match(all, /unit 1: has no title and is dropped with all its lessons/);
  assert.match(all, /unit 2, lesson 1: has no title/);
  assert.deepEqual(r.stats, { units: 1, lessons: 1, items: 1, questions: 0, missingAnswers: 0 });
});

// The promise at the top of coursecheck.js: its idea of what survives is what
// normalizeCourse actually keeps. Checked against a spread of awkward shapes.
test("what the check counts as surviving is exactly what normalizeCourse keeps", () => {
  const blank = { type: "exercise", content: { kind: "mcq", prompt: "", choices: [] } };
  const shapes = [
    good(),
    pkg([{ title: "A", lessons: Array.from({ length: 8 }, (_, i) => lesson(i % 3 ? `L${i}` : "", Array.from({ length: i + 2 }, (_, k) => (k % 4 ? article : blank)))) }]),
    pkg(Array.from({ length: 8 }, (_, u) => ({ title: u % 2 ? `U${u}` : "", lessons: [lesson("L", [article, mcq()]), lesson("M", [blank])] }))),
    pkg([{ title: "Only blanks", lessons: [lesson("L", [blank, blank])] }, { title: "T", lessons: [lesson("K", Array(12).fill(mcq()))] }]),
    pkg([null, { title: "After a null", lessons: [null, lesson("L", [article])] }]),
  ];
  for (const p of shapes) {
    const norm = cg.normalizeCourse(p);
    const kept = norm ? {
      units: norm.units.length,
      lessons: norm.units.reduce((n, u) => n + u.lessons.length, 0),
      items: norm.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l.items.length, 0), 0),
    } : { units: 0, lessons: 0, items: 0 };
    const { stats } = checkPackage(p, { allowMissingAnswers: true });
    assert.deepEqual({ units: stats.units, lessons: stats.lessons, items: stats.items }, kept, JSON.stringify(p).slice(0, 120));
  }
});

test("the example course in docs passes the library check, and so does its CLI", () => {
  // Runs under npm test, so CI keeps the example (and the command a
  // community-courses repository runs) honest without a workflow change.
  const fs = require("node:fs");
  const path = require("node:path");
  const { execFileSync } = require("node:child_process");
  const dir = path.join(__dirname, "..", "..", "docs", "examples");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wow-course.json"));
  assert.ok(files.length >= 1, "an example course exists");
  for (const f of files) {
    const r = checkPackage(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), { requireOpenLicense: true });
    assert.equal(r.ok, true, `${f}: ${r.errors.map((e) => `${e.at}: ${e.message}`).join("; ")}`);
  }
  const cli = path.join(__dirname, "..", "..", "scripts", "validate-course.js");
  const out = execFileSync(process.execPath, [cli, "--library", "--json", dir], { encoding: "utf8" });
  assert.equal(JSON.parse(out).ok, true);
});