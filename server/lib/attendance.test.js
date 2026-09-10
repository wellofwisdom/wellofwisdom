// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const att = require("./attendance");

test("schoolYear: a spring date belongs to the year that started last August", () => {
  const y = att.schoolYear("2026-03-04", 8);
  assert.equal(y.from, "2025-08-01");
  assert.equal(y.to, "2026-07-31");
  assert.equal(y.label, "2025 to 2026");
});

test("schoolYear: a date after the start month belongs to the year just begun", () => {
  const y = att.schoolYear("2026-09-10", 8);
  assert.equal(y.from, "2026-08-01");
  assert.equal(y.to, "2027-07-31");
});

test("schoolYear: a January start is a plain calendar year, labelled as one", () => {
  const y = att.schoolYear("2026-09-10", 1);
  assert.equal(y.from, "2026-01-01");
  assert.equal(y.to, "2026-12-31");
  assert.equal(y.label, "2026");
});

test("schoolYear: a nonsense start month falls back rather than throwing", () => {
  assert.equal(att.schoolYear("2026-03-04", 0).from, att.schoolYear("2026-03-04", 8).from);
  assert.equal(att.schoolYear("2026-03-04", 99).from, att.schoolYear("2026-03-04", 12).from);
});

test("daysBetween: inclusive at both ends, and capped", () => {
  assert.deepEqual(att.daysBetween("2026-01-01", "2026-01-03"), ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.deepEqual(att.daysBetween("2026-01-03", "2026-01-01"), []);
  assert.equal(att.daysBetween("2020-01-01", "2030-01-01").length, 800);
  assert.deepEqual(att.daysBetween("nope", "2026-01-01"), []);
});

const WORK = [
  { day: "2026-01-05", attempts: 12, lessons: 1, submissions: 0 },
  { day: "2026-01-06", attempts: 3, lessons: 0, submissions: 1 },
  { day: "2026-01-11", attempts: 2, lessons: 0, submissions: 0 },
];

test("mergeDays: work alone is the log, and every day carries its evidence", () => {
  const days = att.mergeDays(WORK, []);
  assert.equal(days.length, 3);
  assert.ok(days.every((d) => d.counted && d.source === "work"));
  assert.equal(days[0].evidence.attempts, 12);
});

test("mergeDays: a guide can claim a day the app never saw", () => {
  const days = att.mergeDays(WORK, [{ day: "2026-01-07", counted: true, minutes: 180, note: "Museum" }]);
  const added = days.find((d) => d.day === "2026-01-07");
  assert.equal(added.source, "added");
  assert.equal(added.minutes, 180);
  assert.equal(added.note, "Museum");
  assert.equal(added.evidence.attempts, 0);
});

test("mergeDays: a guide can strike a day the record shows", () => {
  const days = att.mergeDays(WORK, [{ day: "2026-01-11", counted: false }]);
  const struck = days.find((d) => d.day === "2026-01-11");
  assert.equal(struck.counted, false);
  assert.equal(struck.source, "excluded");
  // The evidence stays visible: the guide excluded it, they did not erase it.
  assert.equal(struck.evidence.attempts, 2);
});

test("mergeDays: evidence outranks a guide's note on the same day", () => {
  const days = att.mergeDays(WORK, [{ day: "2026-01-05", counted: true, minutes: 60 }]);
  const d = days.find((x) => x.day === "2026-01-05");
  assert.equal(d.source, "work", "a day the record already backs is work, not a claim");
  assert.equal(d.minutes, 60);
});

test("mergeDays: the log comes back in date order whatever order it went in", () => {
  const days = att.mergeDays(
    [{ day: "2026-02-01" }, { day: "2026-01-01" }],
    [{ day: "2026-01-15", counted: true }]
  );
  assert.deepEqual(days.map((d) => d.day), ["2026-01-01", "2026-01-15", "2026-02-01"]);
});

test("mergeDays: malformed days are dropped rather than stored as junk", () => {
  const days = att.mergeDays([{ day: "yesterday" }, { day: "2026-01-05" }], [{ day: null, counted: true }]);
  assert.deepEqual(days.map((d) => d.day), ["2026-01-05"]);
});

test("mergeDays: minutes are bounded to a real day", () => {
  const days = att.mergeDays([], [{ day: "2026-01-05", counted: true, minutes: 99999 }]);
  assert.equal(days[0].minutes, 1440);
});

test("summarize: counts only counted days, and reports hours from minutes", () => {
  const days = att.mergeDays(WORK, [
    { day: "2026-01-07", counted: true, minutes: 180 },
    { day: "2026-01-11", counted: false },
  ]);
  const s = att.summarize(days, { requiredDays: 180 });
  assert.equal(s.days, 3);
  assert.equal(s.added, 1);
  assert.equal(s.excluded, 1);
  assert.equal(s.hours, 3);
  assert.equal(s.daysRemaining, 177);
  assert.equal(s.daysPct, 2);
});

test("summarize: with no requirement there is nothing to be behind on", () => {
  const s = att.summarize(att.mergeDays(WORK, []), {});
  assert.equal(s.requiredDays, null);
  assert.equal(s.daysRemaining, null);
  assert.equal(s.daysPct, null);
});

test("summarize: past the requirement is complete, never over a hundred percent", () => {
  const days = att.daysBetween("2026-01-01", "2026-01-20").map((day) => ({ day, counted: true }));
  const s = att.summarize(days, { requiredDays: 10 });
  assert.equal(s.daysPct, 100);
  assert.equal(s.daysRemaining, 0);
});

test("toCsv: excluded days do not appear in the filing", () => {
  const days = att.mergeDays(WORK, [{ day: "2026-01-11", counted: false }]);
  const csv = att.toCsv(days, { learnerName: "Ada", from: "2026-01-01", to: "2026-01-31" });
  assert.ok(csv.includes("2026-01-05"));
  assert.ok(!csv.includes("2026-01-11"), "an excluded day must not be claimed");
});

test("toCsv: a comma or a quote in a note cannot break the file", () => {
  const days = att.mergeDays([], [{ day: "2026-01-05", counted: true, note: 'Museum, the "big" one' }]);
  const line = att.toCsv(days, { learnerName: "Ada", from: "a", to: "b" }).split("\n")[2];
  assert.ok(line.includes('"Museum, the ""big"" one"'));
  assert.equal(line.split(",").length > 3, true);
});

test("requirementFrom: absent prefs mean this family does not file", () => {
  const r = att.requirementFrom({});
  assert.equal(r.requiredDays, null);
  assert.equal(r.requiredHours, null);
  assert.equal(r.label, null);
  assert.equal(r.yearStartMonth, 8);
});

test("requirementFrom: nonsense is refused rather than stored as a target", () => {
  const r = att.requirementFrom({ compliance: { requiredDays: -4, requiredHours: "lots", yearStartMonth: 40 } });
  assert.equal(r.requiredDays, null);
  assert.equal(r.requiredHours, null);
  assert.equal(r.yearStartMonth, 12);
});

test("requirementFrom: the requirement is the guide's number, clamped to sane bounds", () => {
  const r = att.requirementFrom({ compliance: { label: "Ohio", requiredDays: 900, requiredHours: 900, yearStartMonth: 9 } });
  assert.equal(r.label, "Ohio");
  assert.equal(r.requiredDays, 366, "no state asks for more days than a year has");
  assert.equal(r.requiredHours, 900);
  assert.equal(r.yearStartMonth, 9);
});

// The guards, asserted from the source: a compliance feature that quietly lost
// its scoping would be worse than not having one.
const fs = require("node:fs");
const path = require("node:path");
const routeSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "attendance.js"), "utf8");
const perm = require("./perm");

test("every write route is gated on a named permission", () => {
  const writes = routeSrc.match(/router\.(post|patch|put|delete)\([^)]*/g) || [];
  assert.ok(writes.length >= 3, "expected the day write, the day clear and the requirement");
  for (const line of writes) {
    assert.match(line, /requirePerm\(/, `unguarded write route: ${line}`);
  }
});

test("a tutor may mark their student's days but not decide what the family files", () => {
  const assistant = { role: "parent", guideRole: "assistant" };
  assert.equal(perm.can(assistant, "record_attendance"), true);
  assert.equal(perm.can(assistant, "set_compliance"), false);
});

test("an observer changes nothing here either", () => {
  const observer = { role: "parent", guideRole: "observer" };
  assert.equal(perm.can(observer, "record_attendance"), false);
  assert.equal(perm.can(observer, "set_compliance"), false);
});

test("every learner-scoped route asks canSeeLearner, so a tutor sees one student", () => {
  // loadLearner is the single gate; nothing may query a learner's days around it.
  assert.match(routeSrc, /perm\.canSeeLearner/);
  const handlers = routeSrc.match(/router\.\w+\("\/:learnerId[^;]*?\n\s*try \{\n(.*)/g) || [];
  assert.ok(handlers.length >= 3, "expected the log, the export and the day writes");
  for (const h of handlers) {
    assert.match(h, /loadLearner\(req, res/, `learner route without the gate: ${h.slice(0, 60)}`);
  }
});

test("no US state's requirement is baked into this app", () => {
  // The numbers belong to the family, because homeschool law varies, changes,
  // and turns on facts no app knows. If a table of states ever appears here,
  // this test should be the argument against it.
  const lib = fs.readFileSync(path.join(__dirname, "attendance.js"), "utf8");
  for (const src of [lib, routeSrc]) {
    assert.ok(!/\b(?:Ohio|Texas|California|Florida|New York|Pennsylvania)\b/.test(src),
      "a state name in the logic means the app is claiming to know the law");
    assert.ok(!/requiredDays\s*[:=]\s*\d/.test(src), "no default day count: an empty target means no target");
  }
});
