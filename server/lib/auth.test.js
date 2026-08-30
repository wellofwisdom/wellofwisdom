// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const auth = require("./auth");

test("password hash/verify roundtrip", () => {
  const hash = auth.hashPassword("correct horse battery");
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(auth.verifyPassword("correct horse battery", hash), true);
  assert.equal(auth.verifyPassword("wrong password", hash), false);
});

test("pin hash/verify roundtrip", () => {
  const hash = auth.hashPin("4821");
  assert.equal(auth.verifyPin("4821", hash), true);
  assert.equal(auth.verifyPin("4822", hash), false);
});

test("verify never throws on malformed stored values", () => {
  assert.equal(auth.verifyPassword("x", null), false);
  assert.equal(auth.verifyPassword("x", "garbage"), false);
  assert.equal(auth.verifyPassword("x", "bcrypt$aa$bb"), false);
});

test("token hashes are stable and tokens are unique", () => {
  const t1 = auth.newToken();
  const t2 = auth.newToken();
  assert.notEqual(t1, t2);
  assert.equal(auth.tokenHash(t1), auth.tokenHash(t1));
  assert.notEqual(auth.tokenHash(t1), auth.tokenHash(t2));
  assert.equal(auth.tokenHash(t1).length, 64);
});

test("cookie parsing handles multiple pairs and encoding", () => {
  const cookies = auth.parseCookies("a=1; wow_session=abc%2Fdef; b=");
  assert.deepEqual(cookies, { a: "1", wow_session: "abc/def", b: "" });
});

test("session cookie: attributes, secure only when configured", () => {
  const base = auth.sessionCookie("tok123");
  assert.match(base, /HttpOnly/);
  assert.match(base, /SameSite=Lax/);
  assert.doesNotMatch(base, /Secure/);
  process.env.COOKIE_SECURE = "true";
  assert.match(auth.sessionCookie("tok123"), /Secure/);
  delete process.env.COOKIE_SECURE;
  const cleared = auth.sessionCookie(null, { clear: true });
  assert.match(cleared, /Max-Age=0/);
});

test("login limiter: allows burst then blocks within window", () => {
  const ip = `test-${crypto.randomUUID()}`;
  for (let i = 0; i < 10; i++) {
    assert.equal(auth.loginLimit(ip).ok, true);
  }
  const blocked = auth.loginLimit(ip);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0);
});

test("join codes use the unambiguous alphabet", () => {
  const code = auth.newJoinCode();
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});
