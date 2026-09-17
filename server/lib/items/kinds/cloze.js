// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str, parseNumeric } = require("./common");

const MAX_BLANKS = 10;
const MAX_ACCEPT = 5;
const MAX_CHOICES_PER_BLANK = 6;

function extractMarkers(text) {
  const re = /\[\[(\w+)\]\]/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(String(m[1]));
  return out;
}

function normalizeAcceptList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) => str(v, 200).trim()).filter(Boolean).slice(0, MAX_ACCEPT);
  }
  const single = str(raw, 200).trim();
  if (single) return [single];
  return [];
}

function normalizeChoices(raw) {
  if (!Array.isArray(raw)) return undefined;
  const arr = raw.map((v) => str(v, 200).trim()).filter(Boolean).slice(0, MAX_CHOICES_PER_BLANK);
  return arr.length ? arr : undefined;
}

function normalize(content) {
  const text = clean(content.text, 4000);
  if (!text) return null;
  const markers = extractMarkers(text);
  const uniq = [...new Set(markers)];
  if (!uniq.length) return null;
  if (uniq.length > MAX_BLANKS) return null;
  const rawBlanks = Array.isArray(content.blanks) ? content.blanks : [];
  const byId = new Map();
  for (const b of rawBlanks) {
    if (!b || typeof b !== "object") continue;
    const id = String(b.id ?? "").trim();
    if (!id) continue;
    if (byId.has(id)) continue;
    byId.set(id, b);
  }
  const blanks = [];
  for (const id of uniq) {
    const raw = byId.get(id);
    if (!raw) {
      blanks.push({ id });
      continue;
    }
    const accepts = normalizeAcceptList(raw.accept);
    const numeric = Boolean(raw.numeric);
    if (numeric && accepts.length) {
      const anyParsable = accepts.some((v) => Number.isFinite(parseNumeric(v)));
      if (!anyParsable) return null;
    }
    const blank = { id };
    if (accepts.length) blank.accept = accepts;
    if (numeric) blank.numeric = true;
    const choices = normalizeChoices(raw.choices);
    if (choices) blank.choices = choices;
    blanks.push(blank);
  }
  const out = { text, kind: "cloze", blanks };
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.text, 4000)) return "text_required";
  const markers = extractMarkers(String(content.text || ""));
  const uniq = [...new Set(markers)];
  if (!uniq.length) return "blanks_required";
  if (uniq.length > MAX_BLANKS) return "too_many_blanks";
  const rawBlanks = Array.isArray(content.blanks) ? content.blanks : [];
  const byId = new Map();
  for (const b of rawBlanks) {
    if (!b || typeof b !== "object") continue;
    const id = String(b.id ?? "").trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, b);
  }
  for (const id of uniq) {
    const raw = byId.get(id);
    if (!raw) return "answer_required";
    const accepts = normalizeAcceptList(raw.accept);
    if (!accepts.length) return "answer_required";
    if (raw.numeric) {
      const ok = accepts.some((v) => Number.isFinite(parseNumeric(v)));
      if (!ok) return "answer_invalid";
    }
    if (raw.choices != null && !Array.isArray(raw.choices)) return "choices_invalid";
    if (Array.isArray(raw.choices) && raw.choices.length > MAX_CHOICES_PER_BLANK) return "too_many_choices";
  }
  return null;
}

function strip(content) {
  const out = { text: content.text, kind: "cloze" };
  if (Array.isArray(content.blanks)) {
    out.blanks = content.blanks.map((b) => {
      const o = { id: b.id };
      if (Array.isArray(b.choices) && b.choices.length) o.choices = b.choices.slice(0, MAX_CHOICES_PER_BLANK);
      if (b.numeric) o.numeric = true;
      return o;
    });
  }
  return out;
}

function normSpaceCase(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

function grade(item, learnerAnswer) {
  const blanks = Array.isArray(item.blanks) ? item.blanks : [];
  if (!blanks.length) return null;
  for (const b of blanks) {
    if (!Array.isArray(b.accept) || !b.accept.length) return null;
  }
  if (learnerAnswer == null || typeof learnerAnswer !== "object" || Array.isArray(learnerAnswer)) {
    return { correct: false, score: 0 };
  }
  let hit = 0;
  for (const b of blanks) {
    const givenRaw = learnerAnswer[b.id] != null ? String(learnerAnswer[b.id]) : "";
    const given = givenRaw.trim();
    if (!given) continue;
    let ok = false;
    if (b.numeric) {
      const g = parseNumeric(given);
      if (!Number.isFinite(g)) continue;
      for (const a of b.accept) {
        const exp = parseNumeric(a);
        if (!Number.isFinite(exp)) continue;
        const tol = Math.max(Math.abs(exp) * 0.005, 0.01);
        if (Math.abs(exp - g) <= tol) { ok = true; break; }
      }
    } else {
      const ng = normSpaceCase(given);
      for (const a of b.accept) {
        if (normSpaceCase(a) === ng) { ok = true; break; }
      }
    }
    if (ok) hit++;
  }
  const total = blanks.length;
  const score = total ? hit / total : 0;
  const correct = hit === total;
  return { correct, score };
}

module.exports = { kind: "cloze", normalize, problem, strip, grade };
