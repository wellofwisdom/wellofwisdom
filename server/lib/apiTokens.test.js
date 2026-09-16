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

test("token management is session-only: no scope reaches /api/tokens", () => {
  function req(method, path) { return { method, path }; }
  const all = ["read", "courses:write", "learners:read", "progress:read"];
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/tokens"), all), false);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/tokens"), all), false);
  assert.equal(apiTokens.tokenAllows(req("DELETE", "/api/tokens/1"), all), false);
});

test("the read scope is an allowlist, not every GET", () => {
  function req(method, path) { return { method, path }; }
  const all = ["read", "courses:write", "learners:read", "progress:read"];
  // admin config routes, on no list: not even the instance admin's own token
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/ai/config"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/ai/config"), all), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/ai/usage"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("PUT", "/api/ai/config"), all), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/stt/config"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/mail/config"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/waitlist"), ["read"]), false);
  // full exports are session-only
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/family/export"), all), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/7/export"), all), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/7/export"), ["courses:write"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/7/answer-key"), ["read"]), false);
  // guide management, guides and auth are not token surfaces
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/guides"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/auth/config"), ["read"]), false);
  // learner-only surfaces are never granted to a token
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/learn/courses"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/worlds/game-types"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/tutor/threads"), ["read"]), false);
  // and reads nobody asked for stay closed rather than open by default
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/notes"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/attendance/learners"), ["read"]), false);
});

test("courses:write covers the course routes and nothing else", () => {
  function req(method, path) { return { method, path }; }
  const cw = ["courses:write"];
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/7"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/jobs/3"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/import"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/generate"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/import-url"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/courses/7/publish"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("PATCH", "/api/courses/7"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("PATCH", "/api/courses/items/5"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("PATCH", "/api/courses/lessons/2"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("DELETE", "/api/courses/7"), cw), true);
  assert.equal(apiTokens.tokenAllows(req("DELETE", "/api/courses/items/5"), cw), true);
  // writes outside courses stay closed
  assert.equal(apiTokens.tokenAllows(req("POST", "/api/family/learners"), cw), false);
  assert.equal(apiTokens.tokenAllows(req("DELETE", "/api/family/learners/3"), cw), false);
  assert.equal(apiTokens.tokenAllows(req("PUT", "/api/ai/config"), cw), false);
});

test("patterns match whole segments, not prefixes", () => {
  function req(method, path) { return { method, path }; }
  // /api/family must not open /api/family/export, /api/courses/:id must not
  // open the deeper /api/courses/7/export
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/familyXYZ"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/family/export"), ["read"]), false);
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/courses/7/extra/deep"), ["read"]), false);
  // trailing slash is the same route
  assert.equal(apiTokens.tokenAllows(req("GET", "/api/me/"), ["read"]), true);
});
