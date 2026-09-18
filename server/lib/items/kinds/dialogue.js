// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, normalizeHints } = require("./common");

const MAX_TURNS = 6;
const MAX_GOALS = 8;
const MAX_GOOD_ENDINGS = 8;

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const scene = clean(content.scene, 4000);
  if (!scene) return null;
  let turns = 3;
  if (content.turns != null) {
    const n = Number(content.turns);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TURNS) return null;
    turns = n;
  }
  const out = { prompt, kind: "dialogue", scene, turns };
  if (Array.isArray(content.goals)) {
    const goals = content.goals.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_GOALS);
    if (goals.length) out.goals = goals;
  }
  if (Array.isArray(content.goodEndings)) {
    const ge = content.goodEndings.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_GOOD_ENDINGS);
    if (ge.length) out.goodEndings = ge;
  }
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  const explanation = str(content.explanation, 3000).trim();
  if (explanation) out.explanation = explanation;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  if (!clean(content.scene, 4000)) return "scene_required";
  if (content.turns != null) {
    const n = Number(content.turns);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TURNS) return "turns_invalid";
  }
  if (content.goals != null && !Array.isArray(content.goals)) return "goals_invalid";
  if (Array.isArray(content.goals) && content.goals.length > MAX_GOALS) return "too_many_goals";
  if (Array.isArray(content.goodEndings) && content.goodEndings.length > MAX_GOOD_ENDINGS) return "too_many_goodEndings";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > 3) return "too_many_hints";
  }
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "dialogue", scene: content.scene, turns: content.turns || 3 };
  if (Array.isArray(content.goals) && content.goals.length) out.goals = content.goals.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_GOALS);
  if (Array.isArray(content.goodEndings) && content.goodEndings.length) out.goodEndings = content.goodEndings.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_GOOD_ENDINGS);
  if (Array.isArray(content.hints) && content.hints.length) {
    out.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, 3);
  } else if (content.hint) {
    const s = str(content.hint, 500).trim();
    if (s) out.hints = [s];
  }
  if (content.explanation) out.explanation = str(content.explanation, 3000).trim() || undefined;
  return out;
}

function grade(item, learnerAnswer) {
  const needed = Number(item.turns) || 3;
  let turns = [];
  if (learnerAnswer != null && typeof learnerAnswer === "object" && !Array.isArray(learnerAnswer) && Array.isArray(learnerAnswer.turns)) {
    turns = learnerAnswer.turns;
  } else if (Array.isArray(learnerAnswer)) {
    turns = learnerAnswer;
  } else {
    return { correct: false, score: 0 };
  }
  const nonEmpty = turns.map((t) => String(t ?? "").trim()).filter((t) => t.length > 0);
  if (!nonEmpty.length) return { correct: false, score: 0 };
  if (nonEmpty.length < needed) return { correct: false, score: nonEmpty.length / needed };
  return { correct: true, score: 1 };
}

module.exports = { kind: "dialogue", normalize, problem, strip, grade };
