// SPDX-License-Identifier: AGPL-3.0-or-later
// The offline TTS path: a real HTTP stub answers the Piper shape (POST
// /synthesize with JSON, WAV bytes back), because this box has no Docker and
// the whole point of the tier is that a sidecar answers over plain HTTP. The
// cloud tiers are canned at the fetch level so no test ever leaves the machine.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const media = require("../media");
const piper = require("./piper-tts");

const ENV_KEYS = ["TTS_BASE_URL", "KIE_API_KEY", "GOOGLE_TTS_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"];

function withEnv(vars) {
  const prev = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  return () => {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
}

// A smallest-but-honest PCM WAV: canonical 44-byte header plus a payload that
// carries a text tag, so a join can be asserted byte by byte.
function wavBytes(sampleRate, text) {
  const data = Buffer.alloc(64, 0);
  if (text) data.write(text, 0, "latin1");
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8, "latin1");
  head.write("fmt ", 12, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const MP3 = Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]), // ID3v2 header
  Buffer.from("tagged-"),
  Buffer.from("real-frames"),
]);

// The stub sidecar: a node http server speaking piper-tts 1.8.0's shape.
// "boom" answers 500 (Flask error page shape); everything else answers the
// WAV with Flask's own default content type, because the adapter must sniff
// the payload, not trust a header.
async function startSidecar() {
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      hits.push({ method: req.method, url: req.url, body });
      if (req.url === "/info") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ voice: { name: "en_US-lessac-medium", num_speakers: 1 } }));
        return;
      }
      let text = "";
      try { text = String(JSON.parse(body).text || ""); } catch { /* error page below */ }
      if (text === "boom") { res.writeHead(500, { "content-type": "text/html" }); res.end("<html>boom</html>"); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(wavBytes(22050, "spoken"));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    hits,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

// Real fetches for the sidecar, canned answers for the cloud vendors, and a
// count of every cloud call so tests can prove the sidecar shielded them.
function dispatchFetch(sidecarUrl) {
  const prev = global.fetch;
  const cloud = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith(sidecarUrl)) return prev(url, opts);
    cloud.push(String(url));
    if (String(url).includes("texttospeech.googleapis.com")) {
      return {
        ok: true, status: 200,
        json: async () => ({ audioContent: Buffer.from("google-mp3").toString("base64") }),
        text: async () => "",
      };
    }
    return { ok: false, status: 401, json: async () => ({}), text: async () => "unauthorized" };
  };
  return { cloud, restore: () => { global.fetch = prev; } };
}

test("the sidecar is configured exactly when TTS_BASE_URL is set", () => {
  const restore = withEnv({});
  try {
    assert.equal(piper.configured(), false);
    assert.deepEqual(piper.status(), { configured: false, via: "piper" });
  } finally { restore(); }
  const restore2 = withEnv({ TTS_BASE_URL: "http://piper:5000/" });
  try {
    assert.equal(piper.configured(), true);
    assert.equal(piper.baseUrl(), "http://piper:5000", "a trailing slash never doubles up");
  } finally { restore2(); }
});

test("looksLikeWav accepts a real header and refuses error pages and MP3", () => {
  assert.equal(piper.looksLikeWav(wavBytes(22050, "x")), true);
  assert.equal(piper.looksLikeWav(Buffer.from("<html>error</html>")), false);
  assert.equal(piper.looksLikeWav(MP3), false);
  assert.equal(piper.looksLikeWav(Buffer.from("RIFF")), false);
  assert.equal(piper.looksLikeWav(null), false);
});

test("synthesize posts the Piper JSON shape to /synthesize and returns the WAV", async () => {
  const sidecar = await startSidecar();
  const restore = withEnv({ TTS_BASE_URL: `${sidecar.url}/` });
  try {
    const r = await piper.synthesize({ text: "Hello world", voice: "en_US-lessac-medium" });
    assert.equal(r.mime, "audio/wav");
    assert.ok(piper.looksLikeWav(r.buffer));
    assert.equal(sidecar.hits.length, 1);
    const hit = sidecar.hits[0];
    assert.equal(hit.method, "POST");
    assert.equal(hit.url, "/synthesize", "piper-tts 1.8.0 serves /synthesize, not /tts");
    const sent = JSON.parse(hit.body);
    assert.equal(sent.text, "Hello world");
    assert.equal(sent.voice, "en_US-lessac-medium");
    assert.ok(!sent.api_key && !sent.authorization, "the sidecar is local and keyless");
  } finally {
    await sidecar.close();
    restore();
  }
});

test("an empty line is refused before any HTTP happens", async () => {
  const sidecar = await startSidecar();
  const restore = withEnv({ TTS_BASE_URL: sidecar.url });
  try {
    await assert.rejects(() => piper.synthesize({ text: "   " }), /piper_empty_text/);
    await assert.rejects(() => piper.synthesize({}), /piper_empty_text/);
    assert.equal(sidecar.hits.length, 0);
  } finally {
    await sidecar.close();
    restore();
  }
});

test("a non-200 answer and a non-WAV body are piper errors a ladder can catch", async () => {
  const sidecar = await startSidecar();
  const restore = withEnv({ TTS_BASE_URL: sidecar.url });
  try {
    await assert.rejects(() => piper.synthesize({ text: "boom" }), /piper_http_500/);
    sidecar.hits.length = 0;
    const prev = global.fetch;
    global.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from("<html>fake 200</html>") });
    try {
      await assert.rejects(() => piper.synthesize({ text: "hello" }), /piper_bad_audio/);
    } finally { global.fetch = prev; }
  } finally {
    await sidecar.close();
    restore();
  }
});

test("speechSegment prefers the sidecar, and no cloud vendor is touched", async () => {
  const sidecar = await startSidecar();
  const restore = withEnv({ TTS_BASE_URL: sidecar.url, KIE_API_KEY: "fake-kie-key", GOOGLE_TTS_API_KEY: "fake-google-key" });
  const dispatched = dispatchFetch(sidecar.url);
  try {
    const buf = await media.speechSegment({ text: "two hosts", role: "narrator" });
    assert.ok(piper.looksLikeWav(buf), "the sidecar's WAV bytes come back as-is");
    assert.equal(sidecar.hits.length, 1);
    assert.equal(JSON.parse(sidecar.hits[0].body).text, "two hosts");
    assert.equal(dispatched.cloud.length, 0, "a healthy sidecar spends nothing");
  } finally {
    dispatched.restore();
    await sidecar.close();
    restore();
  }
});

test("a sidecar failure falls down the ladder to the configured cloud tier", async () => {
  const sidecar = await startSidecar();
  const restore = withEnv({ TTS_BASE_URL: sidecar.url, GOOGLE_TTS_API_KEY: "fake-google-key" });
  const dispatched = dispatchFetch(sidecar.url);
  try {
    const buf = await media.speechSegment({ text: "boom" });
    assert.equal(buf.toString(), "google-mp3");
    assert.equal(sidecar.hits.length, 2, "the sidecar was tried first, and its 500 is retried once before the fall");
    assert.ok(dispatched.cloud.some((u) => u.includes("texttospeech.googleapis.com")), "google answered the fallback");
  } finally {
    dispatched.restore();
    await sidecar.close();
    restore();
  }
});

test("a sidecar that is down entirely falls through instead of failing the line", async () => {
  // Park a listener, note its port, release it: nothing answers there now.
  const zombie = await startSidecar();
  const deadUrl = zombie.url;
  await zombie.close();
  const restore = withEnv({ TTS_BASE_URL: deadUrl, GOOGLE_TTS_API_KEY: "fake-google-key" });
  const dispatched = dispatchFetch(deadUrl);
  try {
    const buf = await media.speechSegment({ text: "still heard" });
    assert.equal(buf.toString(), "google-mp3");
  } finally {
    dispatched.restore();
    restore();
  }
});

test("speechSegment with nothing configured says tts_not_configured", async () => {
  const restore = withEnv({});
  try {
    await assert.rejects(() => media.speechSegment({ text: "hello" }), /tts_not_configured/);
  } finally { restore(); }
});

test("speechStatus reports the tier that would answer, sidecar first", () => {
  const none = withEnv({});
  try { assert.deepEqual(media.speechStatus(), { configured: false, via: null }); } finally { none(); }
  const sidecarOnly = withEnv({ TTS_BASE_URL: "http://piper:5000" });
  try { assert.deepEqual(media.speechStatus(), { configured: true, via: "piper" }); } finally { sidecarOnly(); }
  const kieOnly = withEnv({ KIE_API_KEY: "fake-kie-key" });
  try { assert.deepEqual(media.speechStatus(), { configured: true, via: "kie" }); } finally { kieOnly(); }
  const both = withEnv({ TTS_BASE_URL: "http://piper:5000", KIE_API_KEY: "fake-kie-key" });
  try { assert.deepEqual(media.speechStatus(), { configured: true, via: "piper" }); } finally { both(); }
});

test("concatSpeechSegments joins WAV lines into one well-formed WAV", () => {
  const a = wavBytes(22050, "one");
  const b = wavBytes(22050, "two");
  const out = media.concatSpeechSegments([a, b]);
  assert.equal(out.mime, "audio/wav");
  assert.equal(out.dropped, 0);
  assert.equal(out.bytes.readUInt32LE(4), out.bytes.length - 8, "the RIFF size covers the whole file");
  assert.equal(out.bytes.readUInt32LE(40), 128, "the data chunk holds both payloads");
  assert.equal(out.bytes.toString("latin1", 44, 47), "one");
  assert.equal(out.bytes.toString("latin1", 108, 111), "two", "the second line's samples follow the first's");
});

test("concatSpeechSegments keeps the MP3 join the overview job always had", () => {
  const second = Buffer.concat([MP3, Buffer.alloc(128, 0x41)]);
  second.write("TAG", second.length - 128, "latin1");
  const out = media.concatSpeechSegments([Buffer.from("first-bytes"), second]);
  assert.equal(out.mime, "audio/mpeg");
  assert.equal(out.dropped, 0);
  assert.equal(out.bytes.toString(), "first-bytestagged-real-frames", "the ID3 header after the first segment is gone (its declared size is 0, so 10 bytes)");
});

test("concatSpeechSegments never mixes formats: the first line's tier wins", () => {
  const out = media.concatSpeechSegments([wavBytes(22050, "a"), MP3, wavBytes(22050, "b")]);
  assert.equal(out.mime, "audio/wav");
  assert.equal(out.dropped, 1, "the MP3 line counts as dropped, like any skipped line");
  assert.ok(piper.looksLikeWav(out.bytes));
});

test("concatSpeechSegments drops a WAV whose sample format differs from the first", () => {
  const out = media.concatSpeechSegments([wavBytes(22050, "a"), wavBytes(16000, "b")]);
  assert.equal(out.mime, "audio/wav");
  assert.equal(out.dropped, 1, "two sample rates in one file plays wrong, so the second is dropped");
});

test("concatSpeechSegments refuses to build a file from nothing", () => {
  assert.throws(() => media.concatSpeechSegments([]), /overview_no_audio/);
  assert.throws(() => media.concatSpeechSegments([null, Buffer.alloc(0)]), /overview_no_audio/);
});
