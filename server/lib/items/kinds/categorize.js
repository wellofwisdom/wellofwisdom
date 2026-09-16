// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str } = require("./common");

const MAX_BUCKETS = 6;
const MIN_BUCKETS = 2;
const MAX_CARDS = 12;
const MIN_CARDS = 2;

function normalizeBuckets(raw) {
  const kept = (Array.isArray(raw) ? raw : [])
    .filter((c) => c && typeof c === "object" && clean(c.label, 200))
    .slice(0, MAX_BUCKETS);
  const out = kept.map((c, i) => ({ id: `b${i + 1}`, label: clean(c.label, 200) }));
  return { kept, out };
}

function normalizeCards(raw) {
  const kept = (Array.isArray(raw) ? raw : [])
    .filter((c) => c && typeof c === "object" && clean(c.text, 500))
    .slice(0, MAX_CARDS);
  const out = kept.map((c, i) => ({ id: `d${i + 1}`, text: clean(c.text, 500) }));
  return { kept, out };
}

function normalizeFeedback(raw, cardIds) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = String(k).trim();
    if (!cardIds.has(id)) continue;
    const t = str(v, 500).trim();
    if (t) out[id] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

function mapCategorizeAnswer(rawAnswer, keptCards, keptBuckets, cards, buckets) {
  if (!rawAnswer || typeof rawAnswer !== "object" || Array.isArray(rawAnswer)) return null;
  const entries = Object.entries(rawAnswer);
  if (!entries.length) return null;
  const cardIds = new Set(cards.map((x) => x.id));
  const bucketIds = new Set(buckets.map((x) => x.id));
  const cardByOrig = new Map();
  const bucketByOrig = new Map();
  for (let i = 0; i < keptCards.length; i++) {
    const orig = keptCards[i].id != null ? String(keptCards[i].id) : null;
    if (orig) cardByOrig.set(orig, cards[i].id);
    cardByOrig.set(cards[i].text, cards[i].id);
  }
  for (let i = 0; i < keptBuckets.length; i++) {
    const orig = keptBuckets[i].id != null ? String(keptBuckets[i].id) : null;
    if (orig) bucketByOrig.set(orig, buckets[i].id);
    bucketByOrig.set(buckets[i].label, buckets[i].id);
  }
  const out = {};
  for (const [ck, bv] of entries) {
    const rawC = String(ck).trim();
    const rawB = String(bv ?? "").trim();
    if (!rawC || !rawB) return null;
    const c = cardByOrig.get(rawC) || (cardIds.has(rawC) ? rawC : null);
    const b = bucketByOrig.get(rawB) || (bucketIds.has(rawB) ? rawB : null);
    if (!c || !b) return null;
    if (!cardIds.has(c) || !bucketIds.has(b)) return null;
    out[c] = b;
  }
  if (Object.keys(out).length !== cards.length) return null;
  return out;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const { kept: keptBuckets, out: buckets } = normalizeBuckets(content.buckets);
  const { kept: keptCards, out: cards } = normalizeCards(content.cards);
  if (buckets.length < MIN_BUCKETS || cards.length < MIN_CARDS) return null;
  const mapped = mapCategorizeAnswer(content.answer, keptCards, keptBuckets, cards, buckets);
  const out = { prompt, kind: "categorize", buckets, cards };
  if (mapped) out.answer = mapped;
  const fb = normalizeFeedback(content.feedback, new Set(cards.map((x) => x.id)));
  if (fb) out.feedback = fb;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const bucketTexts = (Array.isArray(content.buckets) ? content.buckets : [])
    .map((x) => (x && typeof x === "object" ? clean(x.label, 200) : ""))
    .filter(Boolean);
  const cardTexts = (Array.isArray(content.cards) ? content.cards : [])
    .map((x) => (x && typeof x === "object" ? clean(x.text, 500) : ""))
    .filter(Boolean);
  if (bucketTexts.length < MIN_BUCKETS) return "buckets_required";
  if (bucketTexts.length > MAX_BUCKETS) return "too_many_buckets";
  if (cardTexts.length < MIN_CARDS) return "cards_required";
  if (cardTexts.length > MAX_CARDS) return "too_many_cards";
  if (!content.answer || typeof content.answer !== "object" || Array.isArray(content.answer)) return "answer_required";
  const { kept: keptBuckets, out: buckets } = normalizeBuckets(content.buckets);
  const { kept: keptCards, out: cards } = normalizeCards(content.cards);
  const mapped = mapCategorizeAnswer(content.answer, keptCards, keptBuckets, cards, buckets);
  if (!mapped) return "answer_invalid";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "categorize" };
  if (Array.isArray(content.buckets)) out.buckets = content.buckets.map((c) => ({ id: c.id, label: c.label }));
  if (Array.isArray(content.cards)) out.cards = content.cards.map((c) => ({ id: c.id, text: c.text }));
  return out;
}

function grade(item, learnerAnswer) {
  if (!item.answer || typeof item.answer !== "object" || Array.isArray(item.answer)) return null;
  const answer = item.answer;
  const cardIds = new Set((item.cards || []).map((c) => String(c.id)));
  const bucketIds = new Set((item.buckets || []).map((c) => String(c.id)));
  for (const [ck, bv] of Object.entries(answer)) {
    if (!cardIds.has(String(ck)) || !bucketIds.has(String(bv))) return null;
  }
  if (!cardIds.size) return null;
  if (typeof learnerAnswer !== "object" || learnerAnswer == null || Array.isArray(learnerAnswer)) {
    return { correct: false, score: 0, feedback: null };
  }
  let hit = 0;
  const misplaced = [];
  for (const cid of cardIds) {
    const given = learnerAnswer[cid] != null ? String(learnerAnswer[cid]).trim() : "";
    const expected = answer[cid] != null ? String(answer[cid]) : null;
    if (expected != null && given === expected) hit++;
    else if (given) misplaced.push(cid);
  }
  const total = cardIds.size;
  const score = total ? hit / total : 0;
  const correct = hit === total;
  let feedback = null;
  if (!correct && item.feedback && typeof item.feedback === "object") {
    const picked = {};
    for (const cid of misplaced) {
      if (item.feedback[cid]) picked[cid] = String(item.feedback[cid]).slice(0, 500);
    }
    if (Object.keys(picked).length) feedback = picked;
  }
  const out = { correct, score };
  if (feedback) out.feedback = feedback;
  return out;
}

module.exports = { kind: "categorize", normalize, problem, strip, grade };
