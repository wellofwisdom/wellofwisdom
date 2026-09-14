// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);

async function app() { return require("../lib/db") && require("../../server/index"); }

async function http(appInstance, path, opts = {}) {
  const m = require("node:http");
  const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) };
  if (body != null) h["content-type"] = "application/json";
  if (opts.cookie) h["cookie"] = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(appInstance);
    s.listen(0, () => {
      const { port } = s.address();
      const req = m.request({ method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h }, (res) => {
        let d = ""; res.on("data", (x) => { d += x; });
        res.on("end", () => {
          s.close(); let j = null; try { j = JSON.parse(d || ""); } catch {}
          const sc = res.headers["set-cookie"] || []; const c = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []);
          resolve({ status: res.statusCode, headers: res.headers, setCookie: c, text: d || "", json: j });
        });
      });
      req.on("error", (e) => { s.close(); reject(e); });
      if (body != null) req.write(body);
      req.end();
    });
  });
}
function jar(r) { return r.setCookie.map((c) => c.split(";")[0]).join("; "); }

describe("auth integration", () => {
  before(ctx.setup);
  after(ctx.teardown);

  it("signup creates family and session, login succeeds", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set (auth signup)"); return; }
    const a = await app();
    const email = `a_${Date.now()}@example.com`;
    const r1 = await http(a, "/api/auth/signup", { body: { familyName: "Test Family", name: "Alex", email, password: "s3cur3Pass" } });
    assert.equal(r1.status, 200);
    assert.ok(r1.json && r1.json.ok === true, r1.text);
    const j = jar(r1);
    assert.match(j, /wow_session=/);
    const me = await http(a, "/api/me", { method: "GET", cookie: j });
    assert.equal(me.status, 200);
    assert.ok(me.json && me.json.user);
    assert.equal(me.json.user.familyName, "Test Family");
    const r2 = await http(a, "/api/auth/login", { body: { email, password: "s3cur3Pass" } });
    assert.equal(r2.status, 200); assert.equal(r2.json.ok, true);
    const r3 = await http(a, "/api/auth/login", { body: { email, password: "wrongwrong" } });
    assert.equal(r3.status, 401);
  });

  it("login is rate limited per IP", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set (rate limit)"); return; }
    const a = await app();
    let lastStatus = null;
    for (let i = 0; i < 12; i++) {
      const r = await http(a, "/api/auth/login", { body: { email: `nobody_${i}_${Date.now()}@example.com`, password: "wrongwrong1" } });
      lastStatus = r.status;
    }
    assert.equal(lastStatus, 429);
  });

  it("learner login by family join code plus PIN", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set (learner login)"); return; }
    const a = await app();
    const uniq = Date.now().toString(36);
    const email = `parent_${uniq}@example.com`;
    const r1 = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${uniq}`, name: "Parent", email, password: "s3cur3Pass" } });
    assert.equal(r1.status, 200);
    const pj = jar(r1);
    const uname = `kid_${uniq}`;
    const r2 = await http(a, "/api/family/learners", { cookie: pj, body: { name: "Kid One", username: uname, pin: "1234" } });
    assert.equal(r2.status, 201, r2.text);
    const db = require("../lib/db");
    const { rows } = await db.query("select join_code from families where id = (select family_id from users where email = $1)", [email.toLowerCase()]);
    const joinCode = rows[0].join_code;
    const r3 = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uname, pin: "1234" } });
    assert.equal(r3.status, 200, r3.text);
    const lj = jar(r3);
    assert.match(lj, /wow_session=/);
    const me = await http(a, "/api/me", { method: "GET", cookie: lj });
    assert.equal(me.status, 200); assert.equal(me.json.user.role, "learner");
    const r4 = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uname, pin: "9999" } });
    assert.equal(r4.status, 401);
  });
});
