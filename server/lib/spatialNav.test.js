// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

function rect(cx, cy, w = 60, h = 40) {
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, width: w, height: h, cx, cy };
}

function isInDir(from, to, dir) {
  if (dir === "up") return to.cy < from.cy - 1;
  if (dir === "down") return to.cy > from.cy + 1;
  if (dir === "left") return to.cx < from.cx - 1;
  return to.cx > from.cx + 1;
}

function score(from, to, dir) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  let primary;
  let secondary;
  if (dir === "up" || dir === "down") {
    primary = Math.abs(dy);
    secondary = Math.abs(dx);
    const overlapX = Math.max(0, Math.min(from.right, to.right) - Math.max(from.left, to.left));
    if (overlapX > 0) secondary *= 0.3;
  } else {
    primary = Math.abs(dx);
    secondary = Math.abs(dy);
    const overlapY = Math.max(0, Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top));
    if (overlapY > 0) secondary *= 0.3;
  }
  const dist = Math.hypot(dx, dy);
  return primary + secondary * 0.6 + dist * 0.15;
}

function findNearest(from, candidates, dir) {
  let bestIdx = null;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!isInDir(from, c, dir)) continue;
    const s = score(from, c, dir);
    if (s < bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return bestIdx;
}

describe("spatial navigation geometry", () => {
  it("picks nearest below", () => {
    const from = rect(100, 100);
    const cands = [rect(100, 200), rect(100, 350), rect(100, 50)];
    assert.equal(findNearest(from, cands, "down"), 0);
  });
  it("picks nearest above", () => {
    const from = rect(100, 200);
    const cands = [rect(100, 100), rect(100, 50), rect(200, 300)];
    assert.equal(findNearest(from, cands, "up"), 0);
  });
  it("picks nearest right", () => {
    const from = rect(100, 100);
    const cands = [rect(200, 100), rect(300, 100), rect(50, 100)];
    assert.equal(findNearest(from, cands, "right"), 0);
  });
  it("picks nearest left", () => {
    const from = rect(200, 100);
    const cands = [rect(100, 100), rect(50, 100), rect(300, 100)];
    assert.equal(findNearest(from, cands, "left"), 0);
  });
  it("returns null when no candidate in direction", () => {
    const from = rect(100, 100);
    const cands = [rect(100, 50), rect(50, 50)];
    assert.equal(findNearest(from, cands, "down"), null);
  });
  it("prefers overlapping axis", () => {
    const from = rect(100, 100);
    const aligned = rect(100, 200);
    const diagonal = rect(300, 210);
    assert.equal(findNearest(from, [diagonal, aligned], "down"), 1);
  });
  it("returns null for empty candidates", () => {
    assert.equal(findNearest(rect(100, 100), [], "down"), null);
  });
  it("vertical candidate wins when moving down", () => {
    const from = rect(100, 100);
    const below = rect(100, 250);
    const right = rect(400, 110);
    assert.equal(findNearest(from, [right, below], "down"), 1);
  });
});
