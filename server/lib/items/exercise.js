// SPDX-License-Identifier: AGPL-3.0-or-later
const { str, clean, MAX_CHOICES, MAX_HINTS, normalizeHints } = require("./kinds/common");
const { forKind, REGISTRY } = require("./kinds");

function kindOf(content) {
  const k = content && content.kind;
  return REGISTRY[k] ? k : "mcq";
}

function normalize(content) {
  if (!content || typeof content !== "object") return null;
  const kind = kindOf(content);
  const handler = forKind(kind);
  if (!handler) return null;
  const promptStr = clean(content.prompt, 2000);
  if (!promptStr) return null;
  const out = handler.normalize(content);
  if (!out) return null;
  const explanation = str(content.explanation, 3000);
  if (explanation) out.explanation = explanation;
  const hints = normalizeHints(content);
  if (hints) out.hints = hints;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  if (Array.isArray(content.hints)) {
    const filtered = content.hints.map((v) => str(v, 500).trim()).filter(Boolean);
    if (filtered.length > MAX_HINTS) return "too_many_hints";
    for (const h of filtered) if (h.length > 500) return "hint_too_long";
  }
  const kind = kindOf(content);
  const handler = forKind(kind);
  if (!handler) return "type_invalid";
  return handler.problem(content);
}

function strip(content) {
  if (!content || typeof content !== "object") return { prompt: "", kind: "mcq" };
  const kind = kindOf(content);
  const handler = forKind(kind);
  const base = handler ? handler.strip(content) : { prompt: content.prompt, kind };
  if (Array.isArray(content.hints) && content.hints.length) {
    base.hints = content.hints.map((v) => str(v, 500).trim()).filter(Boolean).slice(0, MAX_HINTS);
  } else if (content.hint) {
    const single = str(content.hint, 500).trim();
    if (single) base.hints = [single];
  } else if (Array.isArray(content.hints)) {
    base.hints = [];
  }
  // explanation stays server-side; shown only in learn.js reveal after an attempt.
  return base;
}

function grade(item, learnerAnswer) {
  if (!item || typeof item !== "object") return null;
  const handler = forKind(item.kind);
  if (!handler) return null;
  return handler.grade(item, learnerAnswer);
}

function mapChoices(rawChoices, rawAnswer) {
  return require("./kinds/common").mapChoices(rawChoices, rawAnswer);
}

function mapMultiAnswer(rawAnswer, kept, choices) {
  return require("./kinds/common").mapMultiAnswer(rawAnswer, kept, choices);
}

module.exports = {
  normalize,
  problem,
  strip,
  grade,
  mapChoices,
  mapMultiAnswer,
  MAX_CHOICES,
  MAX_HINTS,
  REGISTRY,
};
