// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { DEAD_ZONE, REPEAT_DELAY, REPEAT_RATE } from "./gamepad";
import * as spatial from "./spatialNav";

describe("gamepad constants", () => {
  it("exports expected timing constants", () => {
    expect(DEAD_ZONE).toBeCloseTo(0.35);
    expect(REPEAT_DELAY).toBe(360);
    expect(REPEAT_RATE).toBe(140);
  });
});

describe("spatial navigation wiring", () => {
  it("spatialNav exposes required helpers", () => {
    expect(typeof spatial.findNearest).toBe("function");
    expect(typeof spatial.focusNext).toBe("function");
    expect(typeof spatial.focusFirst).toBe("function");
    expect(typeof spatial.speakFocused).toBe("function");
    expect(typeof spatial.pickFromDom).toBe("function");
    expect(typeof spatial.toRect).toBe("function");
  });
});
