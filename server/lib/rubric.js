// SPDX-License-Identifier: AGPL-3.0-or-later
// Rubric feedback: the AI reads a learner's handed-in project against the
// rubric its own course carries, and drafts the response. A guide reads that
// draft, edits it or throws it away, and only then does anything reach the
// child.
//
// Two rules hold this feature up, and neither is a detail:
//
//   1. NOTHING IS AUTO-APPLIED. The draft lands in the guide's editor, never in
//      the learner's feedback field. The routes keep them in separate columns
//      (ai_feedback vs feedback) so a bug cannot short the gap.
//   2. THE MODEL DOES NOT DECIDE. suggestedOutcome is a suggestion the guide can
//      ignore; the outcome that counts is written by a person. A model marking
//      a child's work by itself is the thing this project exists not to be.
//
// Everything the model returns crosses normalizeFeedback first, the same trust
// boundary as course generation and misconception detection.
const ai = require("./ai");

// Deliberately not a percentage. A homeschool project is not a test score, and
// a number invites an argument about the number instead of about the work.
const OUTCOMES = [
  { id: "not_yet", label: "Not yet", blurb: "Real gaps against the rubric. Worth another pass." },
  { id: "nearly", label: "Nearly there", blurb: "Most of it lands. One or two things to fix." },
  { id: "met", label: "Met", blurb: "Does what the brief asked for." },
  { id: "exceptional", label: "Exceptional", blurb: "Beyond the brief. Keep this one." },
];
const OUTCOME_IDS = OUTCOMES.map((o) => o.id);
const VERDICTS = ["not_yet", "nearly", "met"];

// Under this there is nothing to give feedback on, so we do not spend an AI
// call to tell a child their empty page needs more work.
const MIN_WORDS = 20;
const MAX_CRITERIA = 8;

function clamp(s, n) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
}

function wordCount(text) {
  const t = String(text == null ? "" : text).trim();
  return t ? t.split(/\s+/).length : 0;
}

/** A rubric is free text a guide (or the generator) wrote, so it arrives as
 *  bullets, numbered lines, semicolons or one run-on paragraph. Split it into
 *  criteria when it has structure, and leave it as a single criterion when it
 *  does not: inventing structure that the guide did not write would have the
 *  model grade against a rubric nobody set. */
function criteriaFrom(rubric) {
  const text = String(rubric == null ? "" : rubric).trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*+\u2022]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const parts = lines.length > 1 ? lines : text.split(/;\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => clamp(p, 200)).filter(Boolean).slice(0, MAX_CRITERIA);
}

const SYSTEM =
  "You are drafting feedback on a young learner's project or piece of writing for their guide (a parent " +
  "or teacher) to review, edit and send. You are NOT the final word: a person reads everything you write " +
  "before the learner sees any of it. " +
  "Judge the work ONLY against the rubric criteria you are given and the brief. Quote or point at the " +
  "learner's actual words as evidence; never praise or criticise something that is not in the work. " +
  "If the work is too short or off-brief to judge, say that plainly instead of padding. " +
  "Write toLearner in warm, plain second person, addressed to the learner: what works, then the one or two " +
  "most useful things to change, then a concrete next step. Never sarcastic, never crushing, never gushing. " +
  "Write forGuide privately for the adult: anything worth a closer look, including work that reads as though " +
  "it was not written by the learner, phrased as an observation and never as an accusation. " +
  "Do not rewrite the work for them and do not hand them finished sentences to paste in. " +
  'Respond with ONLY a JSON object: {"criteria":[{"criterion":string,"verdict":"met"|"nearly"|"not_yet",' +
  '"note":string}],"strengths":[string],"improve":[string],"toLearner":string,"forGuide":string,' +
  '"suggestedOutcome":"not_yet"|"nearly"|"met"|"exceptional"}. ' +
  "One criteria entry per criterion given, in the same order. At most 3 strengths and 3 improve items.";

function buildMessages({ title, description, criteria, body, gradeLevel }) {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        brief: { title: clamp(title, 200), description: clamp(description, 2000) },
        rubric: criteria,
        learnerGradeLevel: gradeLevel || null,
        work: String(body == null ? "" : body).slice(0, 12000),
      }),
    },
  ];
}

/** Trust boundary: the model's draft only ever becomes these fields, in this
 *  shape, at these lengths. The criteria list is pinned to the rubric the guide
 *  actually wrote, so the model cannot grade against a criterion it invented. */
function normalizeFeedback(raw, criteria) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const given = Array.isArray(criteria) ? criteria : [];
  const returned = Array.isArray(obj.criteria) ? obj.criteria : [];

  const perCriterion = given.map((criterion, i) => {
    const r = returned[i] && typeof returned[i] === "object" ? returned[i] : {};
    const verdict = VERDICTS.includes(r.verdict) ? r.verdict : null;
    return { criterion, verdict, note: clamp(r.note, 400) };
  });

  const list = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((s) => clamp(s, 300))
      .filter(Boolean)
      .slice(0, 3);

  return {
    criteria: perCriterion,
    strengths: list(obj.strengths),
    improve: list(obj.improve),
    toLearner: clamp(obj.toLearner, 2000),
    forGuide: clamp(obj.forGuide, 1000),
    suggestedOutcome: OUTCOME_IDS.includes(obj.suggestedOutcome) ? obj.suggestedOutcome : null,
  };
}

/** Draft feedback on one submission. Returns the normalized draft, or, when
 *  there is not enough work to read, a note and no AI call at all. */
async function draftFeedback({ title, description, rubric, body, gradeLevel, familyId }) {
  const words = wordCount(body);
  if (words < MIN_WORDS) {
    return {
      ...normalizeFeedback(null, criteriaFrom(rubric)),
      note: "too_short",
      words,
    };
  }
  const criteria = criteriaFrom(rubric);
  const out = await ai.chatJson("rubric", buildMessages({ title, description, criteria, body, gradeLevel }), {
    maxTokens: 1200,
    temperature: 0.4,
    usage: { familyId, note: "project feedback" },
  });
  return { ...normalizeFeedback(out.json, criteria), words };
}

module.exports = {
  OUTCOMES, OUTCOME_IDS, VERDICTS, MIN_WORDS, MAX_CRITERIA,
  wordCount, criteriaFrom, buildMessages, normalizeFeedback, draftFeedback, SYSTEM,
};
