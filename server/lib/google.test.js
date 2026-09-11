// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("google stub: env gating", () => {
  it("enabled is false when GOOGLE_CLIENT_ID is empty", async () => {
    const prev = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    const g = require("./google");
    // force reload after env change
    delete require.cache[require.resolve("./google")];
    const fresh = require("./google");
    assert.equal(fresh.enabled(), false);
    if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
    else delete process.env.GOOGLE_CLIENT_ID;
  });

  it("verifyCredential rejects when not configured", async () => {
    const prev = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    delete require.cache[require.resolve("./google")];
    const g = require("./google");
    await assert.rejects(() => g.verifyCredential("a.b.c"), /google_not_configured/);
    if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
    else delete process.env.GOOGLE_CLIENT_ID;
    delete require.cache[require.resolve("./google")];
    require("./google");
  });
});
