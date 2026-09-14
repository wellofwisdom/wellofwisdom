// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const apiTokens = require("./apiTokens");

test("newRawToken starts with wow_ and is long", () => {
  const t = apiTokens.newRawToken();
  assert.ok(t.startsWith("wow_"));
  assert.ok(t.length > 40);
  assert.notEqual(t, apiTokens.newRawToken());
});

test("hashToken is sha256 hex", () => {
  const h = apiTokens.hashToken("wow_abc");
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]+$/);
  assert.equal(h, apiTokens.hashToken("wow_abc"));
});

test("normalizeScopes dedupes and filters unknown", () => {
  assert.deepEqual(apiTokens.normalizeScopes(["read", "read", "bogus", "courses:write"]), ["read", "courses:write"]);
  assert.deepEqual(apiTokens.normalizeScopes(["progress:read", "learners:read"]), ["progress:read", "learners:read"]);
  assert.deepEqual(apiTokens.normalizeScopes([]), []);
  assert.deepEqual(apiTokens.normalizeScopes(null), []);
});

test("validateName and validateScopes", () => {
  assert.equal(apiTokens.validateName(""), "name_required");
  assert.equal(apiTokens.validateName("  "), "name_required");
  assert.equal(apiTokens.validateName("my token"), null);
  assert.equal(apiTokens.validateScopes(["read"]), null);
  assert.equal(apiTokens.validateScopes(["bogus"]), "scopes_required");
  assert.equal(apiTokens.validateScopes([]), "scopes_required");
});

test("tokenLimit allows burst then blocks", () => {
  const key = `test-limit-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 120; i++) assert.equal(apiTokens.tokenLimit(key).ok, true);
  assert.equal(apiTokens.tokenLimit(key).ok, false);
});

test("tokenAllows checks scopes", () => {
  function req(method, path) { return { method, path }; }
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/1"), ["read"]), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/1"), []), false);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/import"), ["courses:write"]), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/import"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/family/learners"), ["learners:read"]), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/family/learners"), ["progress:read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/family/learners"), ["read"]), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/reports"), ["progress:read"]), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/me"), ["read"]), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/family/learners"), ["learners:read"]), false);
});
