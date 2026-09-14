// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { clientIpMiddleware } = require("./clientIp");

test("no header configured means nothing is mounted", () => {
  assert.equal(clientIpMiddleware(""), null);
  assert.equal(clientIpMiddleware(undefined), null);
});

test("the named header wins over X-Forwarded-For, and its absence changes nothing", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(clientIpMiddleware("cf-connecting-ip"));
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));
  const srv = app.listen(0);
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const withHeader = await (await fetch(`${base}/ip`, { headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" } })).json();
    assert.equal(withHeader.ip, "203.0.113.9");
    const onlyXff = await (await fetch(`${base}/ip`, { headers: { "x-forwarded-for": "198.51.100.1" } })).json();
    assert.equal(onlyXff.ip, "198.51.100.1", "falls back to Express's own trust proxy logic");
    const blank = await (await fetch(`${base}/ip`, { headers: { "cf-connecting-ip": "   " } })).json();
    assert.ok(blank.ip.includes("127.0.0.1"), "a blank header is ignored");
  } finally {
    srv.close();
  }
});
