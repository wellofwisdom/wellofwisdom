// SPDX-License-Identifier: AGPL-3.0-or-later
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("roster routes: module loads and exports a router", () => {
  const r = require("./roster");
  assert.ok(r && typeof r === "function");
});

test("roster lib: semicolon interests split without DB", () => {
  const lib = require("../lib/roster");
  const rows = [{ name: "Maya", username: "maya", grade: "5", interests: "sewing; horses", email: "", __raw: [] }];
  const v = lib.validateRows(rows, []);
  assert.deepEqual(v.validated[0].interests, ["sewing", "horses"]);
});

test("roster import uses a single client for BEGIN/COMMIT/ROLLBACK and never via db.query", () => {
  const src = fs.readFileSync(path.join(__dirname, "roster.js"), "utf8");
  assert.match(src, /getPool\(\)\.connect/, "must check out a single client");
  assert.match(src, /client\.query.*BEGIN/, "BEGIN on the client");
  assert.match(src, /client\.query.*COMMIT/, "COMMIT on the client");
  assert.match(src, /client\.query.*ROLLBACK/, "ROLLBACK on the client");
  assert.match(src, /client\.release\(\)/, "must release the client");
  assert.equal(/db\.query\(.*BEGIN/i.test(src), false, "roster.js must not run BEGIN through db.query");
  assert.equal(/db\.query\(.*COMMIT/i.test(src), false, "roster.js must not run COMMIT through db.query");
  assert.equal(/db\.query\(.*ROLLBACK/i.test(src), false, "roster.js must not run ROLLBACK through db.query");
});

test("roster preview: input validation rejects empty csv", async () => {
  const express = require("express");
  const rosterRouter = require("./roster");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role: "parent", guideRole: "owner", familyId: 10, prefs: {} }; req.ip = "127.0.0.1"; next(); });
  app.use("/api/roster", rosterRouter);
  const http = require("node:http");
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/roster/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: "   " }) });
  const data = await res.json().catch(() => ({}));
  server.close();
  assert.equal(res.status, 400);
  assert.equal(data.error, "csv_required");
});

test("roster pins are hashed: create path uses auth.hashPin", () => {
  const auth = require("../lib/auth");
  const pin = "1234";
  const h = auth.hashPin(pin);
  assert.match(h, /^scrypt\$/);
  assert.equal(auth.verifyPin(pin, h), true);
  assert.equal(auth.verifyPin("0000", h), false);
});

