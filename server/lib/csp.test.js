// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const csp = require("./csp");

test("the policy carries the request nonce and never 'unsafe-inline' for scripts", () => {
  const nonce = csp.newNonce();
  const policy = csp.buildCsp(nonce);
  assert.ok(policy.includes(`script-src 'self' 'nonce-${nonce}'`));
  const scriptSrc = policy.split("; ").find((d) => d.startsWith("script-src"));
  assert.ok(!scriptSrc.includes("unsafe-inline"), "inline scripts run only with the nonce");
  assert.ok(!scriptSrc.includes("unsafe-eval"));
});

test("plugins, base tags and cross-origin form posts are refused", () => {
  const policy = csp.buildCsp("n");
  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("base-uri 'self'"));
  assert.ok(policy.includes("form-action 'self'"));
  assert.ok(policy.includes("frame-ancestors 'self'"));
});

test("Google sign-in and the video embeds the player uses are allowed", () => {
  const policy = csp.buildCsp("n");
  assert.ok(policy.includes("https://accounts.google.com/gsi/client"));
  assert.ok(policy.includes("https://www.youtube-nocookie.com"));
  assert.ok(policy.includes("https://player.vimeo.com"));
});

test("a self-hoster can append sources without editing code", () => {
  const policy = csp.buildCsp("n", { extra: "http://peertube.lan:9000" });
  const frame = policy.split("; ").find((d) => d.startsWith("frame-src"));
  const img = policy.split("; ").find((d) => d.startsWith("img-src"));
  assert.ok(frame.endsWith("http://peertube.lan:9000"));
  assert.ok(img.endsWith("http://peertube.lan:9000"));
});

test("every script tag in the shell gets the nonce, src or inline", () => {
  const html = '<head><script type="application/ld+json">{}</script><script>x()</script></head><body><script type="module" crossorigin src="/assets/a.js"></script></body>';
  const out = csp.injectNonce(html, "abc");
  assert.equal((out.match(/nonce="abc"/g) || []).length, 3);
  assert.ok(out.includes('<script nonce="abc" type="module"'));
  assert.ok(out.includes('<script nonce="abc">x()'));
});

test("CSP_MODE picks the header, and anything unknown enforces", () => {
  const prev = process.env.CSP_MODE;
  try {
    process.env.CSP_MODE = "report";
    assert.equal(csp.mode(), "report");
    process.env.CSP_MODE = "off";
    assert.equal(csp.mode(), "off");
    process.env.CSP_MODE = "banana";
    assert.equal(csp.mode(), "enforce");
    delete process.env.CSP_MODE;
    assert.equal(csp.mode(), "enforce");
  } finally {
    if (prev === undefined) delete process.env.CSP_MODE; else process.env.CSP_MODE = prev;
  }
});

test("the middleware sets a nonce on res.locals and the header in enforce mode", () => {
  const prev = process.env.CSP_MODE;
  delete process.env.CSP_MODE;
  try {
    const headers = {};
    const res = { locals: {}, setHeader: (k, v) => { headers[k] = v; } };
    let called = false;
    csp.cspMiddleware({}, res, () => { called = true; });
    assert.ok(called);
    assert.ok(res.locals.nonce.length > 10);
    assert.ok(headers["Content-Security-Policy"].includes(res.locals.nonce));
    assert.equal(headers["Content-Security-Policy-Report-Only"], undefined);
  } finally {
    if (prev === undefined) delete process.env.CSP_MODE; else process.env.CSP_MODE = prev;
  }
});
