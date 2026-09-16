// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean } = require("./common");

const MAX_POINTS = 10;
const DEFAULT_TOL = 0.5;
const MAX_TOL = 5;

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGrid(raw) {
  if (!raw || typeof raw !== "object") return { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 };
  let xmin = toNum(raw.xmin); let xmax = toNum(raw.xmax);
  let ymin = toNum(raw.ymin); let ymax = toNum(raw.ymax);
  let step = toNum(raw.step);
  if (xmin == null) xmin = -10;
  if (xmax == null) xmax = 10;
  if (ymin == null) ymin = -10;
  if (ymax == null) ymax = 10;
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  // clamp ranges
  xmin = Math.max(-1000, Math.min(1000, xmin));
  xmax = Math.max(-1000, Math.min(1000, xmax));
  ymin = Math.max(-1000, Math.min(1000, ymin));
  ymax = Math.max(-1000, Math.min(1000, ymax));
  if (step == null || step <= 0) step = 1;
  step = Math.max(0.1, Math.min(10, step));
  return { xmin, xmax, ymin, ymax, step };
}

function normalizePoints(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const x = toNum(p.x);
    const y = toNum(p.y);
    if (x == null || y == null) continue;
    out.push({ x, y });
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

function normalize(content) {
  const prompt = clean(content.prompt, 2000);
  if (!prompt) return null;
  const grid = normalizeGrid(content.grid);
  const answer = normalizePoints(content.answer);
  if (!answer.length) return null;
  let tol = toNum(content.tolerance);
  if (tol == null) tol = DEFAULT_TOL;
  tol = Math.max(0.01, Math.min(MAX_TOL, tol));
  return { prompt, kind: "plot", grid, answer, tolerance: tol };
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  if (!clean(content.prompt, 2000)) return "prompt_required";
  const raw = Array.isArray(content.answer) ? content.answer : [];
  // count valid points
  const valid = raw.filter((p) => p && typeof p === "object" && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
  if (!valid.length) return "answer_required";
  if (valid.length > MAX_POINTS) return "too_many_points";
  // check for invalid entries mixed in
  if (raw.length !== valid.length) return "answer_invalid";
  if (content.tolerance != null) {
    const t = Number(content.tolerance);
    if (!Number.isFinite(t) || t <= 0 || t > MAX_TOL) return "tolerance_invalid";
  }
  if (content.grid && typeof content.grid === "object") {
    const g = content.grid;
    for (const k of ["xmin", "xmax", "ymin", "ymax", "step"]) {
      if (g[k] != null && !Number.isFinite(Number(g[k]))) return "grid_invalid";
    }
  }
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "plot", grid: content.grid };
  if (!out.grid) out.grid = { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 };
  return out;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function grade(item, learnerAnswer) {
  const required = Array.isArray(item.answer) ? item.answer : [];
  if (!required.length) return null;
  const tol = Number.isFinite(Number(item.tolerance)) ? Number(item.tolerance) : DEFAULT_TOL;
  const given = normalizePoints(learnerAnswer);
  // need to handle learnerAnswer as [{x,y}] only. If not array or empty, it's wrong.
  if (!Array.isArray(learnerAnswer) || !learnerAnswer.length) return { correct: false, score: 0 };
  // validate given points count
  if (given.length !== learnerAnswer.length) {
    // some invalid points in submission
    return { correct: false, score: 0 };
  }
  // Every required point must be within tol of some given point, and no extras.
  if (given.length !== required.length) {
    let matched = 0;
    const used = new Set();
    for (const req of required) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < given.length; i++) {
        if (used.has(i)) continue;
        const d = dist(req, given[i]);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0 && bestD <= tol) { matched++; used.add(best); }
    }
    const extra = Math.max(0, given.length - required.length);
    const score = Math.max(0, (matched - extra * 0.5) / required.length);
    return { correct: false, score };
  }
  // same count: try to match greedily
  const used = new Set();
  for (const req of required) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < given.length; i++) {
      if (used.has(i)) continue;
      const d = dist(req, given[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > tol) {
      // count how many did match for score
      let matched = used.size;
      const score = matched / required.length;
      return { correct: false, score };
    }
    used.add(best);
  }
  return { correct: true, score: 1 };
}

module.exports = { kind: "plot", normalize, problem, strip, grade, MAX_POINTS, DEFAULT_TOL, MAX_TOL };
