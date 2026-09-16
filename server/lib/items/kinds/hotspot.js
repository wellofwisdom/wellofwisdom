// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str } = require("./common");
const { stripTags } = require("../../text");

const MAX_REGIONS = 12;
const MAX_ANSWER_REGIONS = 6;

function normalizeRegions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const kept = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const shape = r.shape === "poly" ? "poly" : "rect";
    const pts = Array.isArray(r.points) ? r.points : [];
    const norm = pts.map((p) => {
      if (!p || typeof p !== "object") return null;
      const x = Number(p.x);
      const y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    }).filter(Boolean);
    if (shape === "rect" && norm.length < 2) continue;
    if (shape === "poly" && norm.length < 3) continue;
    // rect needs exactly 2 points (opposite corners), poly 3+
    const points = shape === "rect" ? norm.slice(0, 2) : norm;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 40) : `r${kept.length + 1}`;
    kept.push({ id, shape, points });
    if (kept.length >= MAX_REGIONS) break;
  }
  // ensure unique ids
  const seen = new Set();
  for (const r of kept) {
    let base = r.id;
    let n = 1;
    while (seen.has(r.id)) r.id = `${base}_${++n}`;
    seen.add(r.id);
  }
  return kept;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const regions = normalizeRegions(content.regions);
  if (!regions.length) return null;
  const ids = new Set(regions.map((r) => r.id));
  let answer = null;
  if (Array.isArray(content.answer) && content.answer.length) {
    const filtered = content.answer.map((v) => String(v ?? "").trim()).filter(Boolean).filter((id) => ids.has(id));
    if (filtered.length) answer = [...new Set(filtered)].slice(0, MAX_ANSWER_REGIONS);
  }
  const out = { prompt, kind: "hotspot", regions };
  if (answer && answer.length) out.answer = answer;
  const alt = clean(content.alt, 500);
  if (alt) out.alt = alt;
  const uploadId = Number(content.uploadId);
  if (Number.isInteger(uploadId) && uploadId > 0) out.uploadId = uploadId;
  return out;
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const regions = normalizeRegions(content.regions);
  // distinguish raw counts from normalized counts
  const raw = Array.isArray(content.regions) ? content.regions : [];
  if (!regions.length) {
    if (raw.length && raw.length > MAX_REGIONS) return "too_many_regions";
    return "regions_required";
  }
  if (raw.length > MAX_REGIONS) return "too_many_regions";
  if (!Array.isArray(content.answer) || !content.answer.length) return "answer_required";
  const ids = new Set(regions.map((r) => r.id));
  const mapped = content.answer.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!mapped.length) return "answer_required";
  for (const id of mapped) if (!ids.has(id)) return "answer_invalid";
  if (mapped.length > MAX_ANSWER_REGIONS) return "too_many_answers";
  if ([...new Set(mapped)].length !== mapped.length) return "answer_duplicate";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "hotspot", regions: (content.regions || []).map((r) => ({ id: r.id, shape: r.shape, points: r.points })) };
  if (content.alt) out.alt = content.alt;
  if (content.uploadId) out.uploadId = content.uploadId;
  return out;
}

function pointInRect(x, y, pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInRegion(x, y, region) {
  if (region.shape === "rect") return pointInRect(x, y, region.points);
  return pointInPoly(x, y, region.points);
}

function parsePointAnswer(answer, regions) {
  const ids = new Set(regions.map((r) => r.id));
  // keyboard path: array of region ids
  if (Array.isArray(answer) && answer.length && answer.every((v) => typeof v === "string")) {
    const filtered = answer.map((v) => String(v).trim()).filter(Boolean);
    if (filtered.every((id) => ids.has(id))) return { kind: "ids", ids: filtered };
  }
  // mouse/touch path: {x,y} or [x,y]
  let x, y;
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    x = Number(answer.x);
    y = Number(answer.y);
  } else if (Array.isArray(answer) && answer.length === 2 && !answer.some((v) => typeof v === "string" && isNaN(Number(v)))) {
    // ambiguous: if it looks like [x,y] numbers
    const maybeX = Number(answer[0]);
    const maybeY = Number(answer[1]);
    if (Number.isFinite(maybeX) && Number.isFinite(maybeY) && typeof answer[0] !== "string") { x = maybeX; y = maybeY; }
    else {
      // string ids handled above, so fall through
      return null;
    }
  }
  if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
    return { kind: "point", x, y };
  }
  // string ids as single string
  if (typeof answer === "string" && answer.trim() && ids.has(answer.trim())) {
    return { kind: "ids", ids: [answer.trim()] };
  }
  return null;
}

function grade(item, learnerAnswer) {
  const regions = Array.isArray(item.regions) ? item.regions : [];
  const answerIds = Array.isArray(item.answer) ? item.answer : [];
  if (!regions.length || !answerIds.length) return null;
  const correctSet = new Set(answerIds.map((v) => String(v)));
  const regionById = new Map(regions.map((r) => [String(r.id), r]));
  for (const id of correctSet) if (!regionById.has(id)) return null;
  const parsed = parsePointAnswer(learnerAnswer, regions);
  if (!parsed) return false;
  if (parsed.kind === "ids") {
    // keyboard: correct when at least one picked id is correct (single hotspot), or exact set if multiple?
    // spec says correct when point inside a correct region. For keyboard ids, correct when any picked id is in correct set.
    const picked = parsed.ids;
    if (!picked.length) return false;
    // if answer is single region, any correct pick is correct
    // if multiple correct regions, require the picked ids match the correct set exactly for correctness,
    // but partial score counts.
    const givenSet = new Set(picked);
    const correct = answerIds.length === givenSet.size && [...givenSet].every((id) => correctSet.has(id));
    // score: share of correct decisions? For hotspot single region, binary. For multi, score as matched / max
    let score;
    if (answerIds.length === 1) score = correct ? 1 : 0;
    else {
      let hits = 0;
      for (const id of givenSet) if (correctSet.has(id)) hits++;
      // score is hits / total correct, minus extras penalty
      const extras = [...givenSet].filter((id) => !correctSet.has(id)).length;
      score = Math.max(0, (hits - extras) / answerIds.length);
    }
    return { correct, score };
  }
  // point path
  let hitCorrect = false;
  for (const id of correctSet) {
    const reg = regionById.get(id);
    if (reg && pointInRegion(parsed.x, parsed.y, reg)) { hitCorrect = true; break; }
  }
  return { correct: hitCorrect, score: hitCorrect ? 1 : 0 };
}

module.exports = { kind: "hotspot", normalize, problem, strip, grade, MAX_REGIONS, MAX_ANSWER_REGIONS, pointInRegion };
