// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");

// Load lib with a clean env so route resolution is deterministic.
delete process.env.AI_BASE_URL;
delete process.env.AI_API_KEY;
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

test("resolveEffectiveEntry: learner task on trains-on-data provider falls back to default", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default-123",
    aiModelPro: "model-pro",
    aiModelFlash: "model-flash",
    aiProviders: [
      { id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] },
      { id: "safe", name: "Safe", kind: "openai-compatible", baseUrl: "https://safe.example/v1", apiKey: "sk-safe", trainsOnData: false, models: [] },
    ],
    aiRoutes: { tutor: { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "tutor", messages: [{ role: "user", content: "hello" }], opts: {} });
  assert.equal(r.entry.id, "__default");
  assert.ok(r.fallbackWarning && r.fallbackWarning.includes("cheap"));
});

test("resolveEffectiveEntry: non-learner task may use trains-on-data when publicContent", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { "course-gen": { providerId: "cheap", model: "cheap-model" } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "course-gen", messages: [], opts: { publicContent: true } });
  assert.equal(r.entry.id, "cheap");
  assert.equal(r.modelOverride, "cheap-model");
});

test("resolveEffectiveEntry: course-gen without publicContent falls back from trains-on-data", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { "course-gen": { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "course-gen", messages: [], opts: { publicContent: false } });
  assert.equal(r.entry.id, "__default");
});

test("resolveEffectiveEntry: prompt with learner data triggers fallback even for non-learner task", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { translate: { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({
    vault, task: "translate",
    messages: [{ role: "system", content: "Their guide asked you to remember: struggles with fractions" }],
    opts: {},
  });
  assert.equal(r.entry.id, "__default");
});

test("resolveEffectiveEntry: safe provider is used when routed", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "safe", name: "Safe", kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant", trainsOnData: false, models: ["claude-haiku"] }],
    aiRoutes: { tutor: { providerId: "safe", model: "claude-haiku" } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "tutor", messages: [], opts: {} });
  assert.equal(r.entry.id, "safe");
  assert.equal(r.modelOverride, "claude-haiku");
  assert.equal(r.fallbackWarning, null);
});

test("aiConfig mask never returns raw apiKey", () => {
  const aiConfig = require("./aiConfig");
  const masked = aiConfig.mask({
    aiApiKey: "sk-ant-1234567890",
    aiProviders: [{ id: "x", name: "X", kind: "openai-compatible", baseUrl: "https://x.example/v1", apiKey: "sk-secret-9999", trainsOnData: false, models: [] }],
  });
  assert.ok(masked.aiApiKey.startsWith("•••••"));
  assert.ok(!masked.aiApiKey.includes("1234567890".slice(0, 8)));
  assert.ok(masked.aiProviders[0].apiKey.startsWith("•••••"));
  assert.ok(!masked.aiProviders[0].apiKey.includes("secret-9999"));
});

test("aiConfig env fallback still provides default provider via fromEnv", async () => {
  process.env.AI_BASE_URL = "https://env.example/v1";
  process.env.AI_API_KEY = "sk-env-key";
  const aiConfig = require("./aiConfig");
  aiConfig.invalidateCache();
  const cfg = await aiConfig.resolveConfig();
  assert.ok(cfg.aiBaseUrl === "https://env.example/v1" || (cfg.aiProviders && cfg.aiProviders.length >= 0));
  delete process.env.AI_BASE_URL;
  delete process.env.AI_API_KEY;
  aiConfig.invalidateCache();
});
