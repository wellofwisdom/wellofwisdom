// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const zlib = require("node:zlib");
const { isPrivateAddress, safeFetch } = require("./safefetch");

test("isPrivateAddress: everything inside, including the forms the name check missed", () => {
  for (const ip of [
    "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.31.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fd00::1", "fc12:3456::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:7f00:1",
    "[::ffff:7f00:1]", "64:ff9b::a00:1", "224.0.0.1", "255.255.255.255",
  ]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
  }
});

test("isPrivateAddress: the public internet stays reachable", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "[2606:4700::1]"]) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
  }
});

test("isPrivateAddress: something that is not an IP fails closed", () => {
  assert.equal(isPrivateAddress("nope"), true);
  assert.equal(isPrivateAddress(""), true);
  assert.equal(isPrivateAddress(null), true);
});

// A real HTTP server on loopback, and a stand-in DNS: "public.test" is allowed
// to be 127.0.0.1 here (only in this test, via isBlocked), while
// "internal.test" resolves somewhere private, which is what an attacker's DNS
// name would do.
const DNS = {
  "public.test": [{ address: "127.0.0.1", family: 4 }],
  "internal.test": [{ address: "10.0.0.5", family: 4 }],
  "split.test": [{ address: "127.0.0.1", family: 4 }, { address: "10.0.0.5", family: 4 }],
};
const resolve = (host, opts, cb) => {
  const list = DNS[host];
  if (!list) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  cb(null, list);
};
const isBlocked = (ip) => ip !== "127.0.0.1" && isPrivateAddress(ip);

let server;
let port;
test.before(async () => {
  server = http.createServer((req, res) => {
    const go = (to) => { res.writeHead(302, { location: to }); res.end(); };
    if (req.url === "/ok") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"format":"wellofwisdom-course"}'); }
    if (req.url === "/gz") {
      res.writeHead(200, { "content-encoding": "gzip" });
      return res.end(zlib.gzipSync("squashed but whole"));
    }
    if (req.url === "/big") { res.writeHead(200); return res.end(Buffer.alloc(300000, 97)); }
    if (req.url === "/slow") { res.writeHead(200); const t = setInterval(() => res.write("."), 50); req.on("close", () => clearInterval(t)); return; }
    if (req.url === "/to-internal") return go(`http://internal.test:${port}/ok`);
    if (req.url === "/to-literal") return go(`http://[::ffff:7f00:1]:${port}/ok`);
    if (req.url === "/to-loopback") return go(`http://127.0.0.1:${port}/ok`);
    if (req.url === "/to-relative") return go("/ok");
    if (req.url === "/loop") return go("/loop");
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
test.after(() => server.close());

const opts = (more) => ({ resolve, isBlocked, timeoutMs: 3000, ...more });
const url = (path, host = "public.test") => `http://${host}:${port}${path}`;
const code = async (p) => { try { await p; return "resolved"; } catch (e) { return e.code === "EBLOCKED" ? e.message : `error:${e.message}`; } };

test("safeFetch: a public page comes back like a fetch response", async () => {
  const r = await safeFetch(url("/ok"), opts());
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { format: "wellofwisdom-course" });
});

test("safeFetch: a relative redirect is followed", async () => {
  const r = await safeFetch(url("/to-relative"), opts());
  assert.equal(r.status, 200);
  assert.match(r.url, /\/ok$/);
});

test("safeFetch: a gzipped body is decoded, not handed back as bytes", async () => {
  const r = await safeFetch(url("/gz"), opts());
  assert.equal(await r.text(), "squashed but whole");
});

test("safeFetch: a name that resolves somewhere private is refused before connecting", async () => {
  assert.equal(await code(safeFetch(url("/ok", "internal.test"), opts())), "blocked_private_address");
});

test("safeFetch: one private record among public ones is enough to refuse", async () => {
  assert.equal(await code(safeFetch(url("/ok", "split.test"), opts())), "blocked_private_address");
});

test("safeFetch: a public page cannot redirect the server inside", async () => {
  assert.equal(await code(safeFetch(url("/to-internal"), opts())), "blocked_private_address");
  assert.equal(await code(safeFetch(url("/to-literal"), opts())), "blocked_private_address");
  assert.equal(await code(safeFetch(url("/to-loopback"), opts())), "blocked_url");
});

test("safeFetch: a redirect loop ends", async () => {
  assert.equal(await code(safeFetch(url("/loop"), opts())), "too_many_redirects");
});

test("safeFetch: an oversized body is cut off rather than buffered", async () => {
  assert.equal(await code(safeFetch(url("/big"), opts({ maxBytes: 100000 }))), "too_large");
});

test("safeFetch: a server that trickles bytes forever hits the deadline", async () => {
  assert.equal(await code(safeFetch(url("/slow"), opts({ timeoutMs: 400, maxBytes: 1e9 }))), "error:timeout");
});

test("safeFetch: without the test's allowance, loopback itself is refused", async () => {
  assert.equal(await code(safeFetch(url("/ok"), { resolve })), "blocked_private_address");
});

// The call sites, asserted from source: a pasted URL must never go back to a
// plain fetch, which follows redirects anywhere.
const fs = require("node:fs");
const path = require("node:path");

test("no route fetches a pasted URL with plain fetchT", () => {
  const courses = fs.readFileSync(path.join(__dirname, "..", "routes", "courses.js"), "utf8");
  assert.ok(!/fetchT\(/.test(courses), "courses.js fetches sources and imports: safeFetch only");
  assert.equal((courses.match(/await safeFetch\(/g) || []).length, 2, "sources and import-by-URL");
});

test("PeerTube's arbitrary host goes through safeFetch and fails closed when blocked", () => {
  const video = fs.readFileSync(path.join(__dirname, "video.js"), "utf8");
  const fn = video.slice(video.indexOf("async function checkPeerTube"), video.indexOf("async function resolveVideoUrl"));
  assert.match(fn, /await safeFetch\(/);
  assert.ok(!/fetchT\(/.test(fn));
  assert.match(fn, /EBLOCKED[^\n]*ok: false/);
});