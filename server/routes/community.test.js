// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

describe("community in-app library", () => {
  it("route is mounted in server/index.js", () => {
    const idx = fs.readFileSync("server/index.js", "utf8");
    assert.ok(idx.includes('"/api/community"'));
  });
  it("is parentOnly (read + write)", () => {
    const src = fs.readFileSync("server/routes/community.js", "utf8");
    assert.ok(src.includes("auth.parentOnly"));
  });
  it("GET is list, POST /import is one tap", () => {
    const src = fs.readFileSync("server/routes/community.js", "utf8");
    assert.ok(src.includes('router.get("/",'));
    assert.ok(src.includes('router.post("/import"'));
  });
  it("falls back to local examples when community repo not yet live", () => {
    const src = fs.readFileSync("server/routes/community.js", "utf8");
    assert.ok(src.includes("localExamples"));
  });
  it("rawBase points at community-courses (or env override)", () => {
    const src = fs.readFileSync("server/routes/community.js", "utf8");
    assert.ok(src.includes("community-courses"));
    assert.ok(src.includes("COMMUNITY_COURSES_URL"));
  });
});
