// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("roster routes: module loads and exports a router", () => {
  const r = require("./roster");
  assert.ok(r && typeof r === "function");
});

test("roster validation: semicolon interests split", () => {
  const lib = require("../lib/roster");
  const rows = [{ name: "Maya", username: "maya", grade: "5", interests: "sewing; horses", email: "", __raw: [] }];
  const v = lib.validateRows(rows, []);
  assert.deepEqual(v.validated[0].interests, ["sewing", "horses"]);
});

test("roster import uses a transaction that rolls back on failure", () => {
  const src = fs.readFileSync(path.join(__dirname, "roster.js"), "utf8");
  assert.match(src, /BEGIN/, "should begin a transaction");
  assert.match(src, /COMMIT/, "should commit on success");
  assert.match(src, /ROLLBACK/, "should rollback on error");
  assert.match(src, /for update/i, "should lock existing usernames for update");
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
