// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("google stub: env gating", () => {
  it("enabled is false when GOOGLE_CLIENT_ID is empty", async () => {
    const prev = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    delete require.cache[require.resolve("./google")];
    const fresh = require("./google");
    assert.equal(fresh.enabled(), false);
    if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
    else delete process.env.GOOGLE_CLIENT_ID;
    delete require.cache[require.resolve("./google")];
    require("./google");
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

describe("google verifyCredential: aud and azp", () => {
  function stubFetchT(payload, ok = true) {
    const fakeRes = { ok, json: async () => payload };
    return fakeRes;
  }

  it("accepts a token where aud is an array containing our client", async () => {
    const cid = "test-client-123.apps.googleusercontent.com";
    const prev = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = cid;
    delete require.cache[require.resolve("./google")];
    const g = require("./google");
    // google.js reads aud as String(data.aud). When Google returns an array,
    // String([...]) becomes comma-joined, and the code splits on ",".
    // Simulate that: tokeninfo returns aud as array, but our code does String().
    // We call verifyCredential directly; it will call fetchT. Stub it.
    const http = require("./http");
    const orig = http.fetchT;
    const sub = "google-sub-1";
    const email = "alice@example.com";
    // Mock fetchT to return array aud + matching azp
    http.fetchT = async () => stubFetchT({
      sub, email, aud: [cid, "other-client"], azp: cid, email_verified: "true",
      iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 3600),
      name: "Alice",
    });
    try {
      const info = await g.verifyCredential("header.payload.sig");
      assert.equal(info.google_sub, sub);
      assert.equal(info.email, email);
    } finally {
      http.fetchT = orig;
      if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
      else delete process.env.GOOGLE_CLIENT_ID;
      delete require.cache[require.resolve("./google")];
      require("./google");
    }
  });

  it("rejects when aud does not include our client", async () => {
    const cid = "test-client-123.apps.googleusercontent.com";
    const prev = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = cid;
    delete require.cache[require.resolve("./google")];
    const g = require("./google");
    const http = require("./http");
    const orig = http.fetchT;
    http.fetchT = async () => stubFetchT({
      sub: "x", email: "bob@example.com", aud: "other-client.apps.googleusercontent.com",
      azp: "other-client.apps.googleusercontent.com", email_verified: "true",
      iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 3600),
    });
    try {
      await assert.rejects(() => g.verifyCredential("header.payload.sig"), /google_invalid_credential/);
    } finally {
      http.fetchT = orig;
      if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
      else delete process.env.GOOGLE_CLIENT_ID;
      delete require.cache[require.resolve("./google")];
      require("./google");
    }
  });

  it("rejects when azp is present but does not match our client", async () => {
    const cid = "test-client-123.apps.googleusercontent.com";
    const prev = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = cid;
    delete require.cache[require.resolve("./google")];
    const g = require("./google");
    const http = require("./http");
    const orig = http.fetchT;
    http.fetchT = async () => stubFetchT({
      sub: "x", email: "carol@example.com", aud: cid,
      azp: "evil-client.apps.googleusercontent.com", email_verified: "true",
      iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 3600),
    });
    try {
      await assert.rejects(() => g.verifyCredential("header.payload.sig"), /google_invalid_credential/);
    } finally {
      http.fetchT = orig;
      if (prev != null) process.env.GOOGLE_CLIENT_ID = prev;
      else delete process.env.GOOGLE_CLIENT_ID;
      delete require.cache[require.resolve("./google")];
      require("./google");
    }
  });
});
