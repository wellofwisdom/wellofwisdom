// SPDX-License-Identifier: AGPL-3.0-or-later
// Days of instruction: the number a filing family is actually asked for.
//
// The design decision worth keeping: attendance is DERIVED from the work, and
// this module only merges the guide's overrides on top. A day a learner
// answered something, finished a lesson or handed work in is a day of
// instruction; the guide can add a day the app never saw (a museum, a co-op
// class, a morning of reading) or strike one it counted (five minutes of review
// on a Sunday). Nothing is stored that could drift away from the record.
//
// What this module will NOT do is tell anyone what their state requires. The
// requirement is a number the guide types in, because homeschool law varies by
// state, changes, and turns on facts about a family that no app knows. Getting
// that wrong for somebody is worse than not offering it.

// Every counted day carries where it came from, because a filing officer's
// first question about a claimed day is what backs it up.
const SOURCES = ["work", "added", "excluded"];

function isDay(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

/** Days between two ISO dates, inclusive, as ISO strings. Capped so a typo in
 *  a date box cannot ask for a million rows. */
function daysBetween(fromISO, toISO, { max = 800 } = {}) {
  if (!isDay(fromISO) || !isDay(toISO)) return [];
  const out = [];
  const end = Date.parse(`${toISO}T00:00:00Z`);
  let t = Date.parse(`${fromISO}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end)) return [];
  while (t <= end && out.length < max) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

/** The school year containing a date, given the month it starts in (1 to 12).
 *  August start means 2026-03-04 sits in the year that began 2025-08-01, which
 *  is the year a family would be filing for. */
function schoolYear(dateISO, startMonth = 8) {
  const m = Math.min(12, Math.max(1, Math.round(Number(startMonth) || 8)));
  const d = isDay(dateISO) ? new Date(`${dateISO}T00:00:00Z`) : new Date();
  const year = d.getUTCFullYear();
  const startsThisYear = d.getUTCMonth() + 1 >= m;
  const from = new Date(Date.UTC(startsThisYear ? year : year - 1, m - 1, 1));
  const to = new Date(from.getTime());
  to.setUTCFullYear(to.getUTCFullYear() + 1);
  to.setUTCDate(to.getUTCDate() - 1);
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);
  return {
    from: fromISO,
    to: toISO,
    label: m === 1 ? String(from.getUTCFullYear()) : `${from.getUTCFullYear()} to ${to.getUTCFullYear()}`,
  };
}

/**
 * One log from two sources.
 * `workDays`: ISO days the record shows work on, each with what was done.
 * `overrides`: the guide's rows, { day, counted, minutes, note }.
 * Returns every day either source knows about, sorted, each with its source.
 */
function mergeDays(workDays, overrides) {
  const byDay = new Map();
  for (const w of workDays || []) {
    if (!isDay(w && w.day)) continue;
    byDay.set(w.day, {
      day: w.day,
      counted: true,
      source: "work",
      minutes: null,
      note: null,
      evidence: {
        attempts: Number(w.attempts) || 0,
        lessons: Number(w.lessons) || 0,
        submissions: Number(w.submissions) || 0,
      },
    });
  }
  for (const o of overrides || []) {
    if (!isDay(o && o.day)) continue;
    const base = byDay.get(o.day) || { day: o.day, evidence: { attempts: 0, lessons: 0, submissions: 0 } };
    const counted = o.counted !== false;
    byDay.set(o.day, {
      ...base,
      counted,
      // A day the guide struck is "excluded" whatever the record shows; a day
      // they added that the record also shows stays "work", because the
      // evidence is the stronger claim.
      source: counted ? (base.source === "work" ? "work" : "added") : "excluded",
      minutes: o.minutes == null ? null : Math.max(0, Math.min(1440, Math.round(Number(o.minutes) || 0))),
      note: o.note ? String(o.note).slice(0, 500) : null,
    });
  }
  return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** The numbers a filing needs. `requirement` is what the GUIDE said their state
 *  asks for, never something this app decided. */
function summarize(days, requirement) {
  const counted = (days || []).filter((d) => d.counted);
  const minutes = counted.reduce((n, d) => n + (Number(d.minutes) || 0), 0);
  const req = requirement || {};
  const requiredDays = Number(req.requiredDays) > 0 ? Math.round(Number(req.requiredDays)) : null;
  const requiredHours = Number(req.requiredHours) > 0 ? Math.round(Number(req.requiredHours)) : null;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return {
    days: counted.length,
    added: counted.filter((d) => d.source === "added").length,
    excluded: (days || []).length - counted.length,
    minutes,
    hours,
    requiredDays,
    requiredHours,
    daysRemaining: requiredDays === null ? null : Math.max(0, requiredDays - counted.length),
    hoursRemaining: requiredHours === null ? null : Math.max(0, Math.round((requiredHours - hours) * 10) / 10),
    // Only ever a fraction of what the guide typed in. No opinion about the law.
    daysPct: requiredDays ? Math.min(100, Math.round((counted.length / requiredDays) * 100)) : null,
    hoursPct: requiredHours ? Math.min(100, Math.round((hours / requiredHours) * 100)) : null,
  };
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The log as a CSV a human can hand to an office. Excluded days are left out
 *  entirely: this is the claim, not the working. */
function toCsv(days, { learnerName, from, to }) {
  const rows = [
    ["Learner", "Date", "Counted as", "Minutes", "Note", "Answers", "Lessons finished", "Work handed in"],
  ];
  for (const d of days || []) {
    if (!d.counted) continue;
    const e = d.evidence || {};
    rows.push([
      learnerName || "",
      d.day,
      d.source === "added" ? "Recorded by guide" : "Work in the record",
      d.minutes == null ? "" : d.minutes,
      d.note || "",
      e.attempts || 0,
      e.lessons || 0,
      e.submissions || 0,
    ]);
  }
  const header = `# Days of instruction for ${learnerName || "learner"}, ${from} to ${to}\n`;
  return header + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Read the family's requirement out of prefs, coerced and bounded. Absent
 *  means "this family does not file", which is most of the world. */
function requirementFrom(prefs) {
  const c = (prefs && prefs.compliance) || {};
  const num = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n)) : null;
  };
  return {
    // Free text on purpose: this is a label the guide wrote, not a jurisdiction
    // this app claims to understand.
    label: c.label ? String(c.label).slice(0, 80) : null,
    requiredDays: num(c.requiredDays, 366),
    requiredHours: num(c.requiredHours, 8760),
    yearStartMonth: Math.min(12, Math.max(1, Math.round(Number(c.yearStartMonth) || 8))),
  };
}

module.exports = {
  SOURCES, isDay, daysBetween, schoolYear, mergeDays, summarize, toCsv, requirementFrom,
};
