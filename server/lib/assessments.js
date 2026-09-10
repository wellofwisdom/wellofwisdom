// SPDX-License-Identifier: AGPL-3.0-or-later
// Assessments: the third thing a filing family is asked for, after days of
// instruction and a portfolio.
//
// Unlike the other two, an assessment is not derived from anything in the app.
// A standardised test is sat somewhere else and its report arrives on paper; an
// evaluation is written by a teacher who read the portfolio. So the guide types
// the result in, and this module is the trust boundary it crosses on the way.
//
// What this module will NOT do is judge a result. It records the score the
// report gave and never decides whether that score is enough, because "enough"
// is set by the law of one place and the facts of one family, and the app knows
// neither. The same line the attendance module holds about required days.

// test: a standardised or norm-referenced test, with scores.
// evaluation: a written assessment by a teacher or evaluator, usually prose.
// other: anything else the family is asked to keep (a placement test, say).
const KINDS = ["test", "evaluation", "other"];

const MAX_SCORES = 40;

function isDay(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
}

function text(v, max) {
  const s = v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** One score row. `row` is null when there is nothing in it worth keeping (a
 *  blank line left in the form); `error` is set when a percentile was given but
 *  is not one. */
function scoreRow(raw) {
  if (!raw || typeof raw !== "object") return { row: null };
  const area = text(raw.area, 80);
  const score = text(raw.score, 40);
  let percentile = null;
  if (raw.percentile != null && String(raw.percentile).trim() !== "") {
    const n = Number(raw.percentile);
    // A national percentile rank runs 1 to 99. A 0 or a 100 is a typo, and a
    // typo in a filed record is worth refusing out loud rather than storing.
    if (!Number.isFinite(n) || n < 1 || n > 99) return { row: null, error: "percentile_invalid" };
    percentile = Math.round(n);
  }
  if (!area || (score === null && percentile === null)) return { row: null };
  return { row: { area, score, percentile } };
}

/**
 * A guide's input, checked and shaped for storage.
 * Returns { value } or { error } with a code the client can explain.
 * `today` is an ISO date, an argument rather than the clock so this stays pure.
 */
function normalizeAssessment(input, { today } = {}) {
  const b = input || {};
  const title = text(b.title, 160);
  if (!title) return { error: "title_required" };

  const takenOn = String(b.takenOn || "").trim();
  if (!isDay(takenOn)) return { error: "date_invalid" };
  // One day of slack, so a guide west of the server's clock can record a test
  // sat this evening. Beyond that, a result from the future is a typo.
  const now = isDay(today) ? today : new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${now}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (takenOn > tomorrow) return { error: "date_in_future" };

  const kind = b.kind == null || b.kind === "" ? "test" : String(b.kind);
  if (!KINDS.includes(kind)) return { error: "kind_invalid" };

  let gradeLevel = null;
  if (b.gradeLevel != null && String(b.gradeLevel).trim() !== "") {
    const g = Number(b.gradeLevel);
    if (!Number.isInteger(g) || g < 1 || g > 14) return { error: "grade_invalid" };
    gradeLevel = g;
  }

  const scores = [];
  for (const raw of Array.isArray(b.scores) ? b.scores : []) {
    const { row, error } = scoreRow(raw);
    if (error) return { error };
    if (row) scores.push(row);
    if (scores.length >= MAX_SCORES) break;
  }

  const summary = text(b.summary, 4000);
  // A record with no score and no words says only that something happened.
  // That is not worth filing, and it is almost always a form sent too early.
  if (!scores.length && !summary) return { error: "nothing_recorded" };

  return {
    value: {
      takenOn,
      kind,
      title,
      givenBy: text(b.givenBy, 160),
      gradeLevel,
      scores,
      summary,
    },
  };
}

function isoDay(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10);
}

/** A stored row as the API hands it out. bigint ids come back as strings from
 *  pg, so they are coerced here, once, rather than at every call site. */
function fromRow(r) {
  return {
    id: Number(r.id),
    learnerId: Number(r.learner_id),
    takenOn: isoDay(r.taken_on),
    kind: r.kind,
    title: r.title,
    givenBy: r.given_by || null,
    gradeLevel: r.grade_level == null ? null : Number(r.grade_level),
    scores: Array.isArray(r.scores) ? r.scores : [],
    summary: r.summary || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

module.exports = { KINDS, MAX_SCORES, isDay, scoreRow, normalizeAssessment, fromRow };
