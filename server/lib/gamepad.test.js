// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("gamepad module", () => {
  it("exports expected constants and helpers", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../web/src/lib/gamepad.ts"), "utf8");
    assert.match(src, /DEAD_ZONE/);
    assert.match(src, /REPEAT_DELAY/);
    assert.match(src, /REPEAT_RATE/);
    assert.match(src, /useGamepad/);
    assert.match(src, /triggerRumble/);
    assert.match(src, /navigator\.getGamepads/);
    assert.match(src, /vibrationActuator/);
    assert.match(src, /gamepadconnected/);
  });
  it("spatialNav module has required exports", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../web/src/lib/spatialNav.ts"), "utf8");
    assert.match(src, /findNearest/);
    assert.match(src, /focusNext/);
    assert.match(src, /focusFirst/);
    assert.match(src, /speakFocused/);
    assert.match(src, /data-nav/);
    assert.match(src, /isInDir/);
  });
  it("PadLegend exists", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../web/src/components/PadLegend.tsx"), "utf8");
    assert.match(src, /padlegend/);
    assert.match(src, /data-nav|controller/i);
  });
  it("LearnerShell wires controller mode", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../web/src/pages/learn/LearnerShell.tsx"), "utf8");
    assert.match(src, /controller-mode/);
    assert.match(src, /useGamepad/);
    assert.match(src, /data-nav/);
    assert.match(src, /PadLegend/);
    assert.match(src, /wow-controller-mode/);
    assert.match(src, /focusNext/);
    assert.match(src, /speakFocused/);
  });
});
