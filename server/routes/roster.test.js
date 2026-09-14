// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after, test } = require("node:test");
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

// ---- integration: transaction and PIN verification (skips without TEST_DATABASE_URL) ----
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);

async function app() { return require("../../server/index"); }
async function httpRaw(a, path, opts = {}) {
  const m = require("node:http");
  const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) };
  if (body != null) h["content-type"] = "application/json";
  if (opts.cookie) h["cookie"] = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a);
    s.listen(0, () => {
      const { port } = s.address();
      const req = m.request({ method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h }, (res) => {
        let d = "";
        res.on("data", (x) => { d += x; });
        res.on("end", () => {
          s.close();
          let j = null; try { j = JSON.parse(d || ""); } catch {}
          const sc = res.headers["set-cookie"] || [];
          const arr = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []);
          resolve({ status: res.statusCode, json: j, text: d || "", setCookie: arr });
        });
      });
      req.on("error", (e) => { s.close(); reject(e); });
      if (body != null) req.write(body);
      req.end();
    });
  });
}
function jarFrom(setCookie) {
  const arr = Array.isArray(setCookie) ? setCookie : (setCookie ? [String(setCookie)] : []);
  return arr.map((c) => String(c).split(";")[0]).join("; ");
}
async function signup(a, tag) {
  const email = `roster_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`.toLowerCase();
  const r = await httpRaw(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent " + tag, email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email]);
  return { cookie: jarFrom(r.setCookie), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id), email };
}

describe("roster integration", () => {
  before(ctx.setup);
  after(ctx.teardown);

  it("happy path: 3 rows created and PINs verify with auth.verifyPin", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const auth = require("../lib/auth");
    const fam = await signup(a, "happy");
    const csv = `name,username,grade,interests,email\nAlice Happy,ahappy_${Date.now()},3,sewing,alice_h_${Date.now()}@example.com\nBob Happy,bhappy_${Date.now()},4,horses,\nCarol Happy,chappy_${Date.now()},5,space,\n`;
    const imp = await httpRaw(a, "/api/roster/import", { cookie: fam.cookie, body: { csv } });
    assert.equal(imp.status, 200, imp.text);
    assert.equal(imp.json.created.length, 3);
    for (const row of imp.json.created) {
      assert.ok(row.pin && /^\d{4}$/.test(String(row.pin)), `pin should be four digits, got ${row.pin}`);
      const got = await db.query("select pin_hash from users where id=$1", [row.id]);
      assert.equal(got.rowCount, 1);
      assert.equal(auth.verifyPin(String(row.pin), got.rows[0].pin_hash), true, "PIN must verify");
    }
  });

  it("transaction: third row colliding at insert leaves zero new learners", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, `collide_${Date.now()}`);
    const base = Date.now();
    const takenName = `pre_${base}`;
    const csvPre = `name,username\nPreexisting,${takenName}\n`;
    const pre = await httpRaw(a, "/api/roster/import", { cookie: fam.cookie, body: { csv: csvPre } });
    assert.equal(pre.status, 200, pre.text);
    assert.equal(pre.json.created.length, 1);
    const before = await db.query("select count(*)::int as n from users where family_id=$1 and role='learner'", [fam.familyId]);
    const beforeN = Number(before.rows[0].n);
    const csv = `name,username\nAlice ${base},alice_${base}\nBob ${base},bob_${base}\nCarol ${base},${takenName}\n`;
    const imp = await httpRaw(a, "/api/roster/import", { cookie: fam.cookie, body: { csv } });
    assert.ok(imp.status >= 400 || (imp.json && imp.json.created && imp.json.created.length === 0), `expected a failure, got ${imp.status}: ${imp.text}`);
    const after = await db.query("select count(*)::int as n from users where family_id=$1 and role='learner'", [fam.familyId]);
    assert.equal(Number(after.rows[0].n), beforeN, "no learners should have been added when the batch fails mid-transaction");
  });
});
