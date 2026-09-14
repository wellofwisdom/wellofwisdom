// SPDX-License-Identifier: AGPL-3.0-or-later
// The speech route spends money and handles a child's voice, so its gates are
// tested against a real express app: a session is required, an unconfigured
// instance says so instead of failing halfway, the cap stops the call, and the
// transcript comes back normalized for the answer type it is going into.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const aiConfig = require("../lib/aiConfig");
const aiLimits = require("../lib/aiLimits");
const sttRoute = require("./stt");

const ENV_KEYS = ["STT_BASE_URL", "STT_API_KEY", "STT_MODEL", "STT_KEEP_RECORDINGS", "STT_DAILY_CAP"];

function withEnv(vars) {
  const prev = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars || {});
  aiConfig.invalidateCache();
  return () => {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    aiConfig.invalidateCache();
  };
}

/** A stand-in for the transcription endpoint. Local calls pass through. */
function stubProvider(handler) {
  const passthrough = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).includes("127.0.0.1")) return passthrough(url, opts);
    calls.push({ url: String(url), opts });
    return handler(calls.length);
  };
  return {
    calls,
    restore: () => { global.fetch = passthrough; },
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

const PARENT = { id: 7, role: "parent", familyId: 3, name: "Guide", guideRole: "owner" };
const LEARNER = { id: 9, role: "learner", familyId: 3, name: "Sam" };

/** The route mounted on a throwaway app, with the given session attached. */
function serve(user, mount = "/api/stt") {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use(mount, sttRoute);
  app.use((err, _req, res, _next) => res.status(500).json({ error: "internal", detail: err.message }));
  const srv = app.listen(0);
  return {
    base: `http://127.0.0.1:${srv.address().port}`,
    close: () => new Promise((r) => srv.close(r)),
  };
}

function audioPost(url, { bytes = "fake-opus-bytes", headers = {}, query = "" } = {}) {
  return fetch(`${url}/api/stt${query}`, {
    method: "POST",
    headers: { "content-type": "audio/webm", "x-stt-name": "answer.webm", ...headers },
    body: Buffer.from(bytes),
  });
}

test("the route is mounted in server/index.js", () => {
  const idx = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(idx, /app\.use\("\/api\/stt", require\("\.\/routes\/stt"\)\)/);
});

test("no session, no transcription", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const srv = serve(null);
  try {
    const res = await audioPost(srv.base);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "auth_required");
    const status = await fetch(`${srv.base}/api/stt/status`);
    assert.equal(status.status, 401);
  } finally {
    await srv.close();
    restore();
  }
});

test("an instance with no speech endpoint says so rather than failing on the first press", async () => {
  const restore = withEnv({});
  const srv = serve(LEARNER);
  try {
    const status = await (await fetch(`${srv.base}/api/stt/status`)).json();
    assert.equal(status.configured, false);
    assert.equal(status.model, null);
    const res = await audioPost(srv.base);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "stt_not_configured");
  } finally {
    await srv.close();
    restore();
  }
});

test("an empty body is refused before anything is spent", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const provider = stubProvider(() => jsonResponse({ text: "never reached" }));
  const srv = serve(LEARNER);
  try {
    const res = await audioPost(srv.base, { bytes: "" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "no_audio");
    assert.equal(provider.calls.length, 0);
  } finally {
    await srv.close();
    provider.restore();
    restore();
  }
});

test("a spoken fraction lands in a numeric answer as 3/4", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1", STT_API_KEY: "fake-stt-key" });
  const provider = stubProvider(() => jsonResponse({ text: "um, three quarters", language: "english", duration: 1.8 }));
  const srv = serve(LEARNER);
  try {
    const res = await audioPost(srv.base, { query: "?kind=numeric" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.text, "3/4");
    assert.equal(body.transcript, "three quarters");
    assert.equal(body.kind, "numeric");
    assert.equal(body.language, "english");
    assert.equal(body.kept, false);
    assert.equal(provider.calls.length, 1, "exactly one transcription call");
  } finally {
    await srv.close();
    provider.restore();
    restore();
  }
});

test("a spoken choice comes back as a choice position, text answers as words", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const provider = stubProvider(() => jsonResponse({ text: "the second one" }));
  const srv = serve(LEARNER);
  try {
    const mcq = await (await audioPost(srv.base, { query: "?kind=mcq&choices=4" })).json();
    assert.equal(mcq.choiceIndex, 1);
    const text = await (await audioPost(srv.base, { query: "?kind=text" })).json();
    assert.equal(text.choiceIndex, null);
    assert.equal(text.text, "the second one");
  } finally {
    await srv.close();
    provider.restore();
    restore();
  }
});

test("a multipart body is accepted, options and all", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const provider = stubProvider(() => jsonResponse({ text: "one and a half" }));
  const srv = serve(LEARNER);
  try {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("fake-opus-bytes")], { type: "audio/webm" }), "answer.webm");
    form.append("kind", "numeric");
    form.append("language", "en");
    const res = await fetch(`${srv.base}/api/stt`, { method: "POST", body: form });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.text, "1 1/2");
    assert.equal(body.kind, "numeric");
    assert.equal(provider.calls[0].opts.body.get("language"), "en");
  } finally {
    await srv.close();
    provider.restore();
    restore();
  }
});

test("the daily call cap stops speech input with a code the client can show", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const provider = stubProvider(() => jsonResponse({ text: "five" }));
  const realCheck = aiLimits.checkStt;
  aiLimits.checkStt = async () => ({ ok: false, reason: "stt_daily_limit", sttCap: 3, sttUsed: 3 });
  const srv = serve(LEARNER);
  try {
    const res = await audioPost(srv.base);
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error, "stt_daily_limit");
    assert.equal(provider.calls.length, 0, "a capped family never reaches the provider");
  } finally {
    aiLimits.checkStt = realCheck;
    await srv.close();
    provider.restore();
    restore();
  }
});

test("a provider failure is reported as a code, never with the provider's text", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1", STT_API_KEY: "fake-stt-key" });
  const provider = stubProvider(() => ({ ok: false, status: 500, json: async () => ({}), text: async () => "quota exceeded for account acct_1234" }));
  const srv = serve(LEARNER);
  try {
    const res = await audioPost(srv.base);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, "stt_provider_error");
    assert.ok(!JSON.stringify(body).includes("acct_1234"), "the account name never reaches a learner");
  } finally {
    await srv.close();
    provider.restore();
    restore();
  }
});

test("recordings are off unless the family or the instance turns them on", async () => {
  const off = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  try {
    assert.equal(await sttRoute.keepRecordingsFor(3), false);
  } finally {
    off();
  }
  const on = withEnv({ STT_BASE_URL: "https://stt.example.test/v1", STT_KEEP_RECORDINGS: "true" });
  try {
    assert.equal(await sttRoute.keepRecordingsFor(3), true);
  } finally {
    on();
  }
});

test("the vault card is guide only, and the key comes back masked", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1", STT_API_KEY: "fake-stt-key-1234" });
  const learnerApp = serve(LEARNER);
  const guideApp = serve(PARENT);
  try {
    const denied = await fetch(`${learnerApp.base}/api/stt/config`);
    assert.equal(denied.status, 403);
    const allowed = await (await fetch(`${guideApp.base}/api/stt/config`)).json();
    assert.equal(allowed.configured, true);
    assert.equal(allowed.config.sttBaseUrl, "https://stt.example.test/v1");
    assert.match(allowed.config.sttApiKey, /^•••••/);
    assert.ok(!JSON.stringify(allowed).includes("fake-stt-key-1234"));
  } finally {
    await learnerApp.close();
    await guideApp.close();
    restore();
  }
});

test("a malformed multipart body is a no_audio answer, not a crash", () => {
  const parsed = sttRoute.parseMultipart(Buffer.from("not really multipart"), "multipart/form-data; boundary=xyz");
  assert.deepEqual(parsed, { fields: {}, file: null });
});
