// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

describe("waitlist routes live in source", () => {
  it("POST /api/waitlist is public, GET is parentOnly", () => {
    const src = fs.readFileSync("server/routes/waitlist.js", "utf8");
    // public POST must NOT have auth middleware
    assert.match(src, /router\.post\("\/", async/);
    // GET must be gated
    assert.ok(src.includes('router.get("/", auth.parentOnly'), "GET should be guide-only");
  });
  it("dedupe is on lower(email) and throttle is present", () => {
    const src = fs.readFileSync("server/routes/waitlist.js", "utf8");
    assert.ok(src.includes("lower(email)"));
    assert.ok(src.includes("throttled"));
  });
  it("mounted in server/index.js", () => {
    const idx = fs.readFileSync("server/index.js", "utf8");
    assert.ok(idx.includes('"/api/waitlist"'));
  });
});
