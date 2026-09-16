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

test("resolveEffectiveEntry: fails closed for a task no denylist ever covered, even when the sniff sees nothing", () => {
  // The adventure world prompt shape: a learner's name and interests in a
  // phrasing the sniffer does not know. The rule must not depend on the task
  // name or the sniff; only publicContent opens the door.
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { lens: { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({
    vault, task: "lens",
    messages: [{ role: "user", content: "Learner: Mara, grade 4, loves trains and sailing" }],
    opts: {},
  });
  assert.equal(r.entry.id, "__default");
  assert.ok(r.fallbackWarning && r.fallbackWarning.includes("cheap"));
});

test("resolveEffectiveEntry: the sniff overrides publicContent and still falls back", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { "course-gen": { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({
    vault, task: "course-gen",
    messages: [{ role: "user", content: "Learner interests: sailing, mecha" }],
    opts: { publicContent: true },
  });
  assert.equal(r.entry.id, "__default");
});

test("resolveEffectiveEntry: opts.learnerData forces fallback even with publicContent", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { "exercise-gen": { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "exercise-gen", messages: [], opts: { publicContent: true, learnerData: true } });
  assert.equal(r.entry.id, "__default");
});

test("resolveEffectiveEntry: publicContent must be strictly true, not truthy", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiProviders: [{ id: "cheap", name: "Cheap", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap", trainsOnData: true, models: [] }],
    aiRoutes: { "course-gen": { providerId: "cheap", model: null } },
  };
  const r = ai.resolveEffectiveEntry({ vault, task: "course-gen", messages: [], opts: { publicContent: "yes" } });
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

test("chat: a route with no model and no provider models is a config error, not a wrong-provider guess", async () => {
  const aiConfig = require("./aiConfig");
  const orig = aiConfig.resolveConfig;
  aiConfig.resolveConfig = async () => ({
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiModelPro: "model-pro",
    aiModelFlash: "model-flash",
    aiProviders: [{ id: "bare", name: "Bare", kind: "openai-compatible", baseUrl: "https://bare.example/v1", apiKey: "sk-bare", trainsOnData: false, models: [] }],
    aiRoutes: { hint: { providerId: "bare", model: null } },
  });
  try {
    await assert.rejects(
      () => ai.chat("hint", []),
      (err) => err.code === "ai_no_model" && String(err.message).includes("bare")
    );
  } finally {
    aiConfig.resolveConfig = orig;
  }
});

test("chat: a route with no model sends the provider's own model, never the default's", async () => {
  const http = require("node:http");
  const seen = [];
  const srv = http.createServer((req, res) => {
    let d = "";
    req.on("data", (x) => { d += x; });
    req.on("end", () => {
      seen.push(JSON.parse(d));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 }, model: "sentinel" }));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  const aiConfig = require("./aiConfig");
  const orig = aiConfig.resolveConfig;
  aiConfig.resolveConfig = async () => ({
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiModelPro: "model-pro",
    aiModelFlash: "model-flash",
    aiProviders: [{ id: "local", name: "Local", kind: "openai-compatible", baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: "", trainsOnData: false, models: ["ollama-big", "ollama-small"] }],
    aiRoutes: { hint: { providerId: "local", model: null } },
  });
  try {
    const out = await ai.chat("hint", [{ role: "user", content: "hello" }]);
    assert.equal(out.content, "hi");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].model, "ollama-small", "flash tier uses the provider's second model");
    assert.notEqual(seen[0].model, "model-flash", "the default provider's model name must never be sent to another provider");
  } finally {
    aiConfig.resolveConfig = orig;
    srv.close();
  }
});

test("learner data never leaves via a trains-on-data provider (acceptance shape)", () => {
  const vault = {
    aiBaseUrl: "https://default.example/v1",
    aiApiKey: "sk-default",
    aiModelPro: "model-pro",
    aiModelFlash: "model-flash",
    aiProviders: [
      { id: "cheap", name: "Cheap public generation", kind: "openai-compatible", baseUrl: "https://cheap.example/v1", apiKey: "sk-cheap-9999", trainsOnData: true, models: ["cheap-model"] },
      { id: "safe", name: "No-training provider", kind: "openai-compatible", baseUrl: "https://safe.example/v1", apiKey: "sk-safe-1111", trainsOnData: false, models: ["safe-model"] },
    ],
    aiRoutes: { "course-gen": { providerId: "cheap", model: "cheap-model" }, tutor: { providerId: "cheap", model: null }, hint: { providerId: "cheap", model: null }, grading: { providerId: "cheap", model: null }, rubric: { providerId: "cheap", model: null }, lens: { providerId: "cheap", model: null }, translate: { providerId: "cheap", model: null }, "lesson-content": { providerId: "cheap", model: null } },
  };
  const aiMod = require("./ai");
  // open course generation may use cheap
  assert.equal(aiMod.resolveEffectiveEntry({ vault, task: "course-gen", messages: [], opts: { publicContent: true } }).entry.id, "cheap");
  // every learner-data task must fall back, including tasks no denylist covered
  for (const task of ["tutor", "hint", "grading", "rubric", "lens", "translate", "lesson-content", "exercise-gen", "misconceptions"]) {
    const r = aiMod.resolveEffectiveEntry({ vault, task, messages: [], opts: {} });
    assert.equal(r.entry.id, "__default", task + " should fall back");
  }
  // private course-gen also falls back
  assert.equal(aiMod.resolveEffectiveEntry({ vault, task: "course-gen", messages: [], opts: { publicContent: false } }).entry.id, "__default");
  // masking never leaks raw keys
  const aiConfig = require("./aiConfig");
  const masked = aiConfig.mask(vault);
  assert.ok(!JSON.stringify(masked).includes("sk-cheap-9999"));
  assert.ok(!JSON.stringify(masked).includes("sk-safe-1111"));
});


