// SPDX-License-Identifier: AGPL-3.0-or-later
// Fetch a URL somebody pasted, without letting it reach inside our network.
//
// safeSourceUrl (lib/grade.js) refuses a private host by NAME, which is not
// enough on its own, and plain fetch made it worse:
//   - fetch follows redirects, so a public URL could answer 302 to
//     http://10.0.1.9:5432/ and the server would go there;
//   - a public DNS name can resolve to a private address (10.0.1.9.nip.io);
//   - IPv6 private and mapped forms ([fd00::1], [::ffff:7f00:1]) and the
//     100.64/10 shared range were not on the list at all.
// This instance shares a Docker network with other services, and the course
// studio turns a fetched page into course text, so a page reached that way
// could be read back out through a generated lesson.
//
// So: every address a name resolves to is checked at CONNECT time (through
// the socket's lookup, which also closes DNS rebinding: the address checked is
// the address used), every redirect hop is re-validated from scratch, and the
// body is capped. Only for URLs a user supplied; fixed provider endpoints (the
// AI, kie.ai, mail) keep using fetchT.
const dns = require("node:dns");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const zlib = require("node:zlib");
const { safeSourceUrl } = require("./grade");

// Everything that is not the public internet. IPv4-mapped IPv6 addresses
// (::ffff:10.0.0.1) are matched against the IPv4 entries by BlockList itself.
const PRIVATE = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) PRIVATE.addSubnet(addr, bits, "ipv4");
for (const [addr, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) PRIVATE.addSubnet(addr, bits, "ipv6");

// The server's OWN public address is the one gap a list like this cannot know.
// From inside, a request to it reaches the host directly and can skip an edge
// firewall, so an operator can name it (and anything else): FETCH_BLOCK_CIDRS
// is a comma list like "5.78.143.227/32,2a01:4f8::/32". A malformed entry is
// skipped with a warning rather than taking the server down.
for (const entry of String(process.env.FETCH_BLOCK_CIDRS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const [addr, bitsRaw] = entry.split("/");
  const v = net.isIP(addr);
  const bits = bitsRaw === undefined ? (v === 6 ? 128 : 32) : Number(bitsRaw);
  try {
    if (!v || !Number.isInteger(bits)) throw new Error("bad entry");
    PRIVATE.addSubnet(addr, bits, v === 6 ? "ipv6" : "ipv4");
  } catch {
    console.warn(`[safefetch] ignoring FETCH_BLOCK_CIDRS entry "${entry}"`);
  }
}

/** Is this IP literal somewhere a pasted URL must never reach? Anything that
 *  is not a parseable IP counts as private: fail closed. */
function isPrivateAddress(ip) {
  const s = String(ip || "").replace(/^\[|\]$/g, "");
  const v = net.isIP(s);
  if (!v) return true;
  return PRIVATE.check(s, v === 6 ? "ipv6" : "ipv4");
}

function blocked(message = "blocked_private_address") {
  const err = new Error(message);
  err.code = "EBLOCKED";
  return err;
}

/** A dns.lookup with the same signature, that refuses a name if ANY address
 *  it resolves to is private. Checking all of them, not the first, matters: a
 *  name with one public and one private record must not be a coin toss. */
function guardedLookup(resolve = dns.lookup, isBlocked = isPrivateAddress) {
  return (hostname, options, cb) => {
    if (typeof options === "function") { cb = options; options = {}; }
    const opts = typeof options === "number" ? { family: options } : { ...(options || {}) };
    resolve(hostname, { ...opts, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIP(addrs) }];
      if (!list.length) return cb(blocked("no_address"));
      if (list.some((a) => isBlocked(a.address))) return cb(blocked());
      if (opts.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

function decode(res) {
  const enc = String(res.headers["content-encoding"] || "").toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function once(url, { method, headers, timeoutMs, maxBytes, lookup, isBlocked }) {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    // A literal IP never goes through lookup, so it is checked here instead.
    if (net.isIP(host) && isBlocked(host)) return reject(blocked());
    const lib = url.protocol === "https:" ? https : http;
    let settled = false;
    let req = null;
    // One deadline for the whole exchange. A socket idle timeout alone would
    // let a server that trickles a byte a second hold the request open forever.
    const timer = setTimeout(() => finish(new Error("timeout")), timeoutMs);
    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        if (req) req.destroy();
        reject(err);
      } else {
        resolve(value);
      }
    }
    req = lib.request(url, { method, headers, lookup }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return finish(null, { redirect: res.headers.location, status });
      }
      const chunks = [];
      let size = 0;
      const body = decode(res);
      body.on("data", (c) => {
        size += c.length;
        if (size > maxBytes) return finish(blocked("too_large"));
        chunks.push(c);
      });
      body.on("end", () => finish(null, { status, headers: res.headers, body: Buffer.concat(chunks) }));
      body.on("error", (e) => finish(e));
      // Only a message cut short is a failure. A complete one can close before a
      // decompressor has flushed its last chunk, and that must not reject.
      res.on("close", () => { if (!res.complete) finish(new Error("connection_closed")); });
    });
    req.on("error", (e) => finish(e));
    req.end();
  });
}

/**
 * GET a user-supplied URL safely. Resolves to a fetch-like object
 * ({ ok, status, url, headers, text(), json() }) so it drops in where fetchT
 * was, or rejects: code EBLOCKED for a refused address, redirect loop or
 * oversized body, a plain Error for a network failure or a timeout.
 * `resolve` and `isBlocked` exist so the tests can stand in for DNS.
 */
async function safeFetch(raw, {
  headers = {},
  timeoutMs = 15000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 3,
  resolve,
  isBlocked = isPrivateAddress,
} = {}) {
  const lookup = guardedLookup(resolve, isBlocked);
  let current = String(raw || "");
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = safeSourceUrl(current);
    if (!url) throw blocked("blocked_url");
    const out = await once(url, {
      method: "GET",
      headers: { "user-agent": "WellOfWisdom/0.1 (+https://wellofwisdom.app)", ...headers },
      timeoutMs,
      maxBytes,
      lookup,
      isBlocked,
    });
    if (out.redirect) {
      // Relative locations are resolved against the hop that sent them, then
      // the result goes back through every check above, from scratch.
      current = new URL(out.redirect, url).href;
      continue;
    }
    const text = out.body.toString("utf8");
    return {
      ok: out.status >= 200 && out.status < 300,
      status: out.status,
      url: url.href,
      headers: out.headers,
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  }
  throw blocked("too_many_redirects");
}

module.exports = { isPrivateAddress, guardedLookup, safeFetch };
