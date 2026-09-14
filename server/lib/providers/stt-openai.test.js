// SPDX-License-Identifier: AGPL-3.0-or-later
// The transcription adapter talks to somebody else's endpoint with a real
// audio file, so the request it builds and the way it reads the answer are
// asserted here against a stubbed fetch.
const test = require("node:test");
const assert = require("node:assert/strict");
const aiConfig = require("../aiConfig");
const stt = require("./stt-openai");

const ENV_KEYS = ["STT_BASE_URL", "STT_API_KEY", "STT_MODEL", "AI_BASE_URL", "AI_API_KEY"];

function withEnv(vars) {
  const prev = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  aiConfig.invalidateCache();
  return () => {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    aiConfig.invalidateCache();
  };
}

function stubFetch(handler) {
  const prev = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts, calls.length);
  };
  return {
    calls,
    restore: () => { global.fetch = prev; },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const AUDIO = Buffer.from("fake-opus-bytes");

test("no base URL means speech is off, and the reason is explicit", async () => {
  const restore = withEnv({});
  try {
    assert.equal(stt.configured(), false);
    assert.equal((await stt.status()).configured, false);
    await assert.rejects(() => stt.transcribe({ buffer: AUDIO, mime: "audio/webm" }), /stt_not_configured/);
  } finally {
    restore();
  }
});

test("transcribe posts the audio as multipart to /v1/audio/transcriptions", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1/", STT_API_KEY: "fake-stt-key", STT_MODEL: "whisper-large-v3" });
  const fetchStub = stubFetch(() => jsonResponse({ text: "three quarters", language: "english", duration: 2.5 }));
  try {
    const out = await stt.transcribe({ buffer: AUDIO, mime: "audio/webm", filename: "answer.webm" });
    assert.equal(out.text, "three quarters");
    assert.equal(out.language, "english");
    assert.equal(out.model, "whisper-large-v3");
    assert.equal(out.durationSec, 2.5);
    assert.equal(fetchStub.calls.length, 1);
    const { url, opts } = fetchStub.calls[0];
    // The trailing slash in the config must not double up.
    assert.equal(url, "https://stt.example.test/v1/audio/transcriptions");
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers.authorization, "Bearer fake-stt-key");
    assert.ok(opts.body instanceof FormData, "the audio goes up as multipart, not JSON");
    const file = opts.body.get("file");
    assert.ok(file instanceof Blob);
    assert.equal(file.type, "audio/webm");
    assert.equal(opts.body.get("model"), "whisper-large-v3");
    assert.equal(opts.body.get("response_format"), "verbose_json");
  } finally {
    fetchStub.restore();
    restore();
  }
});

test("a language hint is passed through", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const fetchStub = stubFetch(() => jsonResponse({ text: "hola" }));
  try {
    await stt.transcribe({ buffer: AUDIO, mime: "audio/webm", language: "es" });
    assert.equal(fetchStub.calls[0].opts.body.get("language"), "es");
  } finally {
    fetchStub.restore();
    restore();
  }
});

test("an endpoint without verbose_json is asked again in the plain shape", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const fetchStub = stubFetch((url, opts, n) => (
    n === 1
      ? { ok: false, status: 400, json: async () => ({}), text: async () => "unsupported response_format" }
      : jsonResponse({ text: "five" })
  ));
  try {
    const out = await stt.transcribe({ buffer: AUDIO, mime: "audio/mp4" });
    assert.equal(out.text, "five");
    assert.equal(fetchStub.calls.length, 2);
    assert.equal(fetchStub.calls[0].opts.body.get("response_format"), "verbose_json");
    assert.equal(fetchStub.calls[1].opts.body.get("response_format"), "json");
  } finally {
    fetchStub.restore();
    restore();
  }
});

test("a provider error keeps its status and does not leak the key", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1", STT_API_KEY: "fake-stt-key" });
  const fetchStub = stubFetch(() => ({ ok: false, status: 401, json: async () => ({}), text: async () => "invalid api key" }));
  try {
    await assert.rejects(() => stt.transcribe({ buffer: AUDIO, mime: "audio/webm" }), (err) => {
      assert.match(err.message, /stt_http_401/);
      assert.ok(!err.message.includes("fake-stt-key"), "the key never lands in an error message");
      return true;
    });
  } finally {
    fetchStub.restore();
    restore();
  }
});

test("a silent recording says so rather than returning an empty answer", async () => {
  const restore = withEnv({ STT_BASE_URL: "https://stt.example.test/v1" });
  const fetchStub = stubFetch(() => jsonResponse({ text: "   " }));
  try {
    await assert.rejects(() => stt.transcribe({ buffer: AUDIO, mime: "audio/webm" }), /stt_no_speech/);
  } finally {
    fetchStub.restore();
    restore();
  }
});

test("confidence comes from the segment log probabilities, or is null", () => {
  assert.equal(stt.confidenceFrom({ segments: [{ avg_logprob: Math.log(0.9) }, { avg_logprob: Math.log(0.7) }] }), Number(Math.exp((Math.log(0.9) + Math.log(0.7)) / 2).toFixed(3)));
  assert.equal(stt.confidenceFrom({ confidence: 1.4 }), 1);
  assert.equal(stt.confidenceFrom({ confidence: -0.2 }), 0);
  assert.equal(stt.confidenceFrom({ text: "no timings here" }), null);
  assert.equal(stt.confidenceFrom(null), null);
});

test("the main AI key is reused only when the host matches", async () => {
  const same = withEnv({
    STT_BASE_URL: "https://api.openai.com/v1", AI_BASE_URL: "https://api.openai.com/v1", AI_API_KEY: "fake-ai-key",
  });
  try {
    const cfg = await stt.resolve();
    assert.equal(cfg.apiKey, "fake-ai-key");
    assert.equal(cfg.model, "whisper-1", "a bare endpoint gets the OpenAI model name");
  } finally {
    same();
  }

  const other = withEnv({
    STT_BASE_URL: "https://api.groq.com/openai/v1", AI_BASE_URL: "https://api.deepseek.com/v1", AI_API_KEY: "fake-ai-key",
  });
  try {
    const cfg = await stt.resolve();
    assert.equal(cfg.apiKey, "", "a DeepSeek key is never sent to Groq");
  } finally {
    other();
  }
});
