// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const store = require("./uploads");

test("typeFor: an allowlist, and it tolerates charset parameters", () => {
  assert.equal(store.typeFor("video/mp4").kind, "video");
  assert.equal(store.typeFor("VIDEO/MP4").kind, "video");
  assert.equal(store.typeFor("video/mp4; charset=binary").kind, "video");
  assert.equal(store.typeFor("image/png").ext, "png");
  // Not on the list: no executables, no archives, no html.
  assert.equal(store.typeFor("text/html"), null);
  assert.equal(store.typeFor("application/zip"), null);
  assert.equal(store.typeFor("application/x-msdownload"), null);
  assert.equal(store.typeFor(""), null);
  assert.equal(store.typeFor(null), null);
});

test("resolveKey: a crafted key cannot escape the upload root", () => {
  // Keys come from our own database, but this is the last check before fs.
  for (const evil of [
    "../../../etc/passwd",
    "..\\..\\windows\\system32",
    "4/../../../../root/.ssh/id_rsa",
    "/etc/shadow",
    "",
    null,
  ]) {
    const out = store.resolveKey(evil);
    if (out !== null) {
      assert.ok(
        out.startsWith(store.ROOT + path.sep),
        `key ${JSON.stringify(evil)} escaped to ${out}`
      );
    }
  }
});

test("resolveKey: a normal generated key resolves inside the root", () => {
  const key = store.newKey(4, "mp4");
  assert.match(key, /^4\/[0-9a-f-]{36}\.mp4$/);
  const abs = store.resolveKey(key);
  assert.ok(abs.startsWith(store.ROOT + path.sep));
});

test("newKey: the caller never picks the filename", () => {
  const a = store.newKey(1, "mp4");
  const b = store.newKey(1, "mp4");
  assert.notEqual(a, b, "keys must not collide");
});

test("parseRange: normal seek", () => {
  assert.deepEqual(store.parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(store.parseRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(store.parseRange(" bytes=0-0 ", 1000), { start: 0, end: 0 });
});

test("parseRange: suffix form (the last N bytes)", () => {
  assert.deepEqual(store.parseRange("bytes=-200", 1000), { start: 800, end: 999 });
  assert.deepEqual(store.parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
});

test("parseRange: an end past the file is clamped, not an error", () => {
  assert.deepEqual(store.parseRange("bytes=900-99999", 1000), { start: 900, end: 999 });
});

test("parseRange: nonsense yields null so the whole file is sent", () => {
  for (const bad of ["", null, "bytes=abc-def", "bytes=900-100", "bytes=1000-", "bytes=-0", "items=0-10"]) {
    assert.equal(store.parseRange(bad, 1000), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("maxBytesFor: video gets more room than an image", () => {
  assert.ok(store.maxBytesFor("video") > store.maxBytesFor("image"));
  assert.ok(store.maxBytesFor("image") > 0);
  assert.ok(store.maxBytesFor("nonsense") > 0, "unknown kinds still get a finite cap");
});

test("acceptedMimes: what express.raw is told to buffer matches the allowlist", () => {
  const mimes = store.acceptedMimes();
  assert.ok(mimes.includes("video/mp4"));
  assert.ok(!mimes.includes("text/html"));
  for (const m of mimes) assert.ok(store.typeFor(m), `${m} is accepted but has no type entry`);
});
