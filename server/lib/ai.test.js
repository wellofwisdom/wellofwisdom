// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");

// Load lib with a clean env so route resolution is deterministic.
delete process.env.AI_BASE_URL;
process.env.AI_MODEL_PRO = "model-pro";
process.env.AI_MODEL_FLASH = "model-flash";
const ai = require("./ai");

test("resolveRoute: known tasks map to the right tier", () => {
  assert.equal(ai.resolveRoute("course-gen").tier, "pro");
  assert.equal(ai.resolveRoute("tutor").tier, "flash");
  assert.equal(ai.resolveRoute("course-gen").model, "model-pro");
  assert.equal(ai.resolveRoute("hint").model, "model-flash");
});

test("resolveRoute: unknown task falls back to flash", () => {
  assert.equal(ai.resolveRoute("does-not-exist").tier, "flash");
});

test("resolveRoute: AI_ROUTES env overrides a task without touching the rest", () => {
  process.env.AI_ROUTES = JSON.stringify({ tutor: "pro" });
  assert.equal(ai.resolveRoute("tutor").tier, "pro");
  assert.equal(ai.resolveRoute("course-gen").tier, "pro");
  assert.equal(ai.resolveRoute("hint").tier, "flash");
  delete process.env.AI_ROUTES;
});

test("chat throws a clear error when no endpoint is configured", async () => {
  await assert.rejects(() => ai.chat("tutor", []), (err) => err.code === "ai_not_configured");
});

test("health reports unconfigured cleanly", () => {
  assert.equal(ai.health().configured, false);
});
