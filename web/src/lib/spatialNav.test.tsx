// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { findNearest, type Rect } from "./spatialNav";

function rect(cx: number, cy: number, w = 60, h = 40): Rect {
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2, width: w, height: h, cx, cy };
}

describe("spatial navigation geometry", () => {
  it("picks nearest below", () => {
    const from = rect(100, 100);
    const cands = [rect(100, 200), rect(100, 350), rect(100, 50)];
    expect(findNearest(from, cands, "down")).toBe(0);
  });
  it("picks nearest above", () => {
    const from = rect(100, 200);
    const cands = [rect(100, 100), rect(100, 50), rect(200, 300)];
    expect(findNearest(from, cands, "up")).toBe(0);
  });
  it("picks nearest right", () => {
    const from = rect(100, 100);
    const cands = [rect(200, 100), rect(300, 100), rect(50, 100)];
    expect(findNearest(from, cands, "right")).toBe(0);
  });
  it("picks nearest left", () => {
    const from = rect(200, 100);
    const cands = [rect(100, 100), rect(50, 100), rect(300, 100)];
    expect(findNearest(from, cands, "left")).toBe(0);
  });
  it("returns null when no candidate in direction", () => {
    const from = rect(100, 100);
    const cands = [rect(100, 50), rect(50, 50)];
    expect(findNearest(from, cands, "down")).toBeNull();
  });
  it("prefers overlapping axis", () => {
    const from = rect(100, 100);
    const aligned = rect(100, 200);
    const diagonal = rect(300, 210);
    expect(findNearest(from, [diagonal, aligned], "down")).toBe(1);
  });
  it("returns null for empty candidates", () => {
    expect(findNearest(rect(100, 100), [], "down")).toBeNull();
  });
  it("vertical candidate wins when moving down", () => {
    const from = rect(100, 100);
    const below = rect(100, 250);
    const right = rect(400, 110);
    expect(findNearest(from, [right, below], "down")).toBe(1);
  });
});
