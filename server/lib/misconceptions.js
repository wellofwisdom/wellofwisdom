// SPDX-License-Identifier: AGPL-3.0-or-later
// Misconception detection: a pass over a learner's WRONG answers that names the
// pattern behind them ("adds numerators and denominators straight across"),
// which is worth more to a guide than any single lesson and which nothing on
// the market does for a family of two.
//
// The model only ever sees the wrong attempts, each phrased as "asked X, chose
// Y, the answer was Z", never the learner's name history or anything else. Its
// output crosses normalizeAnalysis (the trust boundary) before a guide reads
// it, and it is told to ground every pattern in the answers it was shown.
const ai = require("./ai");

// Below this there is no pattern to find, so we do not spend an AI call at all.
const MIN_WRONG = 3;
const MAX_PATTERNS = 5;

function clamp(s, n) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
}

/** One wrong attempt as a line the model can reason about. The learner's answer
 *  and the correct answer are resolved to their human text for MCQ (the stored
 *  values are choice ids), so the model sees words, not ids. */
function humanizeAttempt(row) {
  const prompt = clamp(row.prompt, 300);
  if (row.kind === "mcq") {
    const byId = new Map((row.choices || []).map((c) => [String(c.id), c.text]));
    const chose = byId.has(String(row.given)) ? byId.get(String(row.given)) : row.given;
    const answer = byId.has(String(row.correctAnswer)) ? byId.get(String(row.correctAnswer)) : row.correctAnswer;
    return { prompt, chose: clamp(chose, 200), answer: clamp(answer, 200), subject: row.subject ? clamp(row.subject, 80) : null };
  }
  // numeric. (text exercises are self-check, no ground truth, excluded upstream.)
  return { prompt, chose: clamp(row.given, 80), answer: clamp(row.correctAnswer, 80), subject: row.subject ? clamp(row.subject, 80) : null };
}

const SYSTEM =
  "You are a diagnostic tutor helping a guide (a parent or teacher) understand WHY a learner keeps getting " +
  "certain questions wrong. You are given only the questions they missed, each as the prompt, the answer they " +
  "chose, and the correct answer. Find the recurring MISCONCEPTIONS behind the mistakes: the faulty rule or " +
  "habit that would produce these specific wrong answers. " +
  "Ground every pattern in the answers shown. Do NOT invent mistakes that are not evidenced. If the misses look " +
  "like unrelated slips rather than a pattern, say so with fewer or no patterns. Never mention the learner by " +
  "name, never scold, and keep it practical for the guide. " +
  'Respond with ONLY a JSON object: {"patterns":[{"skill":string,"misconception":string,"evidence":string,' +
  '"suggestion":string}],"overall":string}. At most ' + MAX_PATTERNS + " patterns. evidence quotes one concrete " +
  "miss. suggestion is one next step. overall is one or two sentences for the guide.";

function buildMessages(lines) {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: JSON.stringify({ missed: lines }) },
  ];
}

/** Trust boundary: coerce and clamp the model's analysis before a guide sees it. */
function normalizeAnalysis(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const patterns = (Array.isArray(obj.patterns) ? obj.patterns : [])
    .map((p) => ({
      skill: clamp(p && p.skill, 120),
      misconception: clamp(p && p.misconception, 400),
      evidence: clamp(p && p.evidence, 300),
      suggestion: clamp(p && p.suggestion, 300),
    }))
    .filter((p) => p.misconception)
    .slice(0, MAX_PATTERNS);
  return { patterns, overall: clamp(obj.overall, 600) };
}

/** attempts: humanized-ready rows (see humanizeAttempt). Returns
 *  { patterns, overall, note? }. note "not_enough" means we did not call AI. */
async function analyze({ attempts, familyId }) {
  const lines = (attempts || []).map(humanizeAttempt).filter((l) => l.prompt && l.answer);
  if (lines.length < MIN_WRONG) return { patterns: [], overall: "", note: "not_enough", missed: lines.length };
  const out = await ai.chatJson("misconceptions", buildMessages(lines), {
    maxTokens: 900,
    temperature: 0.3,
    usage: { familyId, note: "misconceptions" },
  });
  return { ...normalizeAnalysis(out.json), missed: lines.length };
}

module.exports = { humanizeAttempt, buildMessages, normalizeAnalysis, analyze, MIN_WRONG, MAX_PATTERNS };
