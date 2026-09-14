// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);
async function app() { return require("../../server/index"); }
async function http(a, path, opts = {}) {
  const m = require("node:http"); const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) }; if (body != null) h["content-type"] = "application/json"; if (opts.cookie) h["cookie"] = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a); s.listen(0, () => {
      const { port } = s.address(); const req = m.request({ method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h }, (res) => {
        let d = ""; res.on("data", (x) => { d += x; }); res.on("end", () => { s.close(); let j = null; try { j = JSON.parse(d || ""); } catch {} const sc = res.headers["set-cookie"] || []; const c = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []); resolve({ status: res.statusCode, headers: res.headers, setCookie: c, text: d || "", json: j }); });
      }); req.on("error", (e) => { s.close(); reject(e); }); if (body != null) req.write(body); req.end();
    });
  });
}
function jar(r) { return r.setCookie.map((c) => c.split(";")[0]).join("; "); }
async function signup(a, tag) {
  const email = `fam_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent " + tag, email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
describe("family integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("family scoping: other family data absent", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const famA = await signup(a, "scopingA"); const famB = await signup(a, "scopingB");
    const kidA = `kida_${Date.now()}`;
    const resA = await http(a, "/api/family/learners", { cookie: famA.jar, body: { name: kidA, username: kidA, pin: "1234" } });
    assert.equal(resA.status, 201, `kidA create should be 201 got ${resA.status}: ${resA.text}`);
    const kidB = `kidb_${Date.now()}`;
    const resB = await http(a, "/api/family/learners", { cookie: famB.jar, body: { name: kidB, username: kidB, pin: "1234" } });
    assert.equal(resB.status, 201, `kidB create should be 201 got ${resB.status}: ${resB.text}`);
    const cA = await db.query("insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [famA.familyId, "Course A", "math", famA.userId]);
    const courseA = Number(cA.rows[0].id);
    const listB = await http(a, "/api/family/learners", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200); assert.ok(listB.json.learners.some((l) => l.username === kidB.toLowerCase()));
    const coursesB = await http(a, "/api/courses", { method: "GET", cookie: famB.jar });
    assert.equal(coursesB.status, 200); assert.ok(!coursesB.json.courses.some((c) => Number(c.id) === courseA));
    for (const p of ["/api/reports", "/api/plans", "/api/events", "/api/resources"]) {
      const r = await http(a, p, { method: "GET", cookie: famB.jar }); assert.equal(r.status, 200, `${p}: ${r.text}`);
    }
  });
  it("observer may GET but not POST", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const fam = await signup(a, "observer");
    const inv = await http(a, "/api/guides/invites", { cookie: fam.jar, body: { role: "observer" } });
    assert.equal(inv.status, 201, inv.text); const token = inv.json.token;
    const obsEmail = `obs_${Date.now()}@example.com`;
    const joined = await http(a, "/api/auth/join", { body: { token, name: "Observer", email: obsEmail, password: "s3cur3Pass" } });
    assert.equal(joined.status, 200); const obsJar = jar(joined);
    const gets = await http(a, "/api/courses", { method: "GET", cookie: obsJar });
    assert.equal(gets.status, 200);
    const post = await http(a, "/api/plans", { cookie: obsJar, body: { title: "X", subject: "Y", startDate: "2026-09-01", endDate: "2026-09-30", milestones: [{ title: "a" }, { title: "b" }, { title: "c" }] } });
    assert.equal(post.status, 403, `observer POST should be 403 got ${post.status}: ${post.text}`);
  });
  it("assistant sees only assigned learners", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "assist");
    const k1name = `k1_${Date.now()}`; const k2name = `k2_${Date.now()}`;
    await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: k1name, username: k1name, pin: "1234" } });
    await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: k2name, username: k2name, pin: "1234" } });
    const kid1 = Number((await db.query("select id from users where username=$1", [k1name])).rows[0].id);
    const kid2 = Number((await db.query("select id from users where username=$1", [k2name])).rows[0].id);
    const inv = await http(a, "/api/guides/invites", { cookie: fam.jar, body: { role: "assistant", learnerIds: [kid1] } });
    assert.equal(inv.status, 201, inv.text); const tok = inv.json.token;
    const em = `asst_${Date.now()}@example.com`;
    const joined = await http(a, "/api/auth/join", { body: { token: tok, name: "Assistant", email: em, password: "s3cur3Pass" } });
    assert.equal(joined.status, 200, joined.text); const aj = jar(joined);
    const lst = await http(a, "/api/family/learners", { method: "GET", cookie: aj });
    assert.equal(lst.status, 200, lst.text);
    const ids = lst.json.learners.map((l) => Number(l.id));
    assert.ok(ids.includes(kid1)); assert.ok(!ids.includes(kid2));
    const prog = await http(a, "/api/progress", { method: "GET", cookie: aj });
    assert.equal(prog.status, 200, prog.text);
    const pids = (prog.json.learners || []).map((l) => Number(l.id));
    assert.ok(pids.includes(kid1)); assert.ok(!pids.includes(kid2));
  });
});
