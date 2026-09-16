// SPDX-License-Identifier: AGPL-3.0-or-later
const { stripTags } = require("../text");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const clean = (s, max) => stripTags(str(s, max));
const MAX_CARDS = 20;

function normalize(content) {
  const raw = Array.isArray(content.cards) ? content.cards : [];
  const kept = raw.filter((c) => c && typeof c === "object" && clean(c.front, 600) && clean(c.back, 600)).slice(0, MAX_CARDS);
  if (!kept.length) return null;
  const cards = kept.map((c) => {
    const o = { front: clean(c.front, 600), back: clean(c.back, 600) };
    const up = Number(c.imageUploadId);
    if (Number.isInteger(up) && up > 0) o.imageUploadId = up;
    return o;
  });
  return { cards };
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  const raw = Array.isArray(content.cards) ? content.cards : [];
  const kept = raw.filter((c) => c && typeof c === "object" && clean(c.front, 600) && clean(c.back, 600));
  if (!kept.length) return "cards_required";
  if (kept.length > MAX_CARDS) return "too_many_cards";
  return null;
}

function strip(content) {
  return { cards: (content.cards || []).map((c) => {
    const o = { front: c.front, back: c.back };
    if (c.imageUploadId) o.imageUploadId = c.imageUploadId;
    return o;
  }) };
}

function grade() { return null; }

module.exports = { normalize, problem, strip, grade, MAX_CARDS };
