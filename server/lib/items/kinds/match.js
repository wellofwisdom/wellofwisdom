// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean } = require("./common");

const MAX_PAIRS = 6;
const MIN_PAIRS = 2;

function normalizeSide(raw, prefix) {
  const kept = (Array.isArray(raw) ? raw : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_PAIRS);
  const out = kept.map((c, i) => ({ id: `${prefix}${i + 1}`, text: clean(c.text, 500) }));
  return { kept, out };
}

function mapMatchAnswer(rawAnswer, keptLeft, keptRight, left, right) {
  if (!rawAnswer || typeof rawAnswer !== "object" || Array.isArray(rawAnswer)) return null;
  const entries = Object.entries(rawAnswer);
  if (!entries.length) return null;
  const leftByOrig = new Map();
  const rightByOrig = new Map();
  const rightIds = new Set(right.map((x) => x.id));
  const leftIds = new Set(left.map((x) => x.id));
  for (let i = 0; i < keptLeft.length; i++) {
    const orig = keptLeft[i].id != null ? String(keptLeft[i].id) : null;
    if (orig) leftByOrig.set(orig, left[i].id);
    leftByOrig.set(left[i].text, left[i].id);
  }
  for (let i = 0; i < keptRight.length; i++) {
    const orig = keptRight[i].id != null ? String(keptRight[i].id) : null;
    if (orig) rightByOrig.set(orig, right[i].id);
    rightByOrig.set(right[i].text, right[i].id);
  }
  const out = {};
  for (const [lk, rv] of entries) {
    const rawL = String(lk).trim();
    const rawR = String(rv ?? "").trim();
    if (!rawL || !rawR) return null;
    const l = leftByOrig.get(rawL) || (leftIds.has(rawL) ? rawL : null);
    const r = rightByOrig.get(rawR) || (rightIds.has(rawR) ? rawR : null);
    if (!l || !r) return null;
    if (!leftIds.has(l) || !rightIds.has(r)) return null;
    out[l] = r;
  }
  if (Object.keys(out).length !== left.length) return null;
  return out;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const { kept: keptLeft, out: left } = normalizeSide(content.left, "l");
  const { kept: keptRight, out: right } = normalizeSide(content.right, "r");
  if (left.length < MIN_PAIRS || right.length < MIN_PAIRS) return null;
  if (left.length !== right.length) return null;
  const mapped = mapMatchAnswer(content.answer, keptLeft, keptRight, left, right);
  const out = { prompt, kind: "match", left, right };
  if (mapped) out.answer = mapped;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const leftTexts = (Array.isArray(content.left) ? content.left : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  const rightTexts = (Array.isArray(content.right) ? content.right : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (leftTexts.length < MIN_PAIRS || rightTexts.length < MIN_PAIRS) return "pairs_required";
  if (leftTexts.length > MAX_PAIRS || rightTexts.length > MAX_PAIRS) return "too_many_pairs";
  if (leftTexts.length !== rightTexts.length) return "pairs_mismatch";
  if (!content.answer || typeof content.answer !== "object" || Array.isArray(content.answer)) return "answer_required";
  const { kept: keptLeft, out: left } = normalizeSide(content.left, "l");
  const { kept: keptRight, out: right } = normalizeSide(content.right, "r");
  const mapped = mapMatchAnswer(content.answer, keptLeft, keptRight, left, right);
  if (!mapped) return "answer_invalid";
  const vals = new Set(Object.values(mapped));
  if (vals.size !== left.length) return "answer_invalid";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "match" };
  if (Array.isArray(content.left)) out.left = content.left.map((c) => ({ id: c.id, text: c.text }));
  if (Array.isArray(content.right)) out.right = content.right.map((c) => ({ id: c.id, text: c.text }));
  return out;
}

function grade(item, learnerAnswer) {
  if (!item.answer || typeof item.answer !== "object" || Array.isArray(item.answer)) return null;
  const answer = item.answer;
  const leftIds = new Set((item.left || []).map((c) => String(c.id)));
  const rightIds = new Set((item.right || []).map((c) => String(c.id)));
  for (const [lk, rv] of Object.entries(answer)) {
    if (!leftIds.has(String(lk)) || !rightIds.has(String(rv))) return null;
  }
  if (!leftIds.size) return null;
  if (typeof learnerAnswer !== "object" || learnerAnswer == null || Array.isArray(learnerAnswer)) {
    return { correct: false, score: 0 };
  }
  let hit = 0;
  for (const lid of leftIds) {
    const given = learnerAnswer[lid] != null ? String(learnerAnswer[lid]).trim() : "";
    const expected = answer[lid] != null ? String(answer[lid]) : null;
    if (expected != null && given === expected) hit++;
  }
  const total = leftIds.size;
  const score = total ? hit / total : 0;
  const correct = hit === total;
  return { correct, score };
}

module.exports = { kind: "match", normalize, problem, strip, grade };
