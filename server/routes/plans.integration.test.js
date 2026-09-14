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
  const email = `plan_${tag}_${Date.now()}@example.com`; const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db"); const row = await db.query("select family_id from users where email=$1", [email]); return { jar: jar(r), familyId: Number(row.rows[0].family_id) };
}
describe("plans integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("plans list is family scoped", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const famA = await signup(a, "PA"); const famB = await signup(a, "PB");
    const r = await http(a, "/api/plans", { cookie: famA.jar, body: { title: "My plan", subject: "Math", startDate: "2026-09-01", endDate: "2026-10-01", sessionsPerWeek: 3, minutesPerSession: 30, learners: [], milestones: [{ title: "m1" }, { title: "m2" }, { title: "m3" }] } });
    assert.equal(r.status, 201, r.text); const planId = Number(r.json.planId);
    const listA = await http(a, "/api/plans", { method: "GET", cookie: famA.jar }); assert.equal(listA.status, 200); assert.ok(listA.json.plans.some((p) => Number(p.id) === planId));
    const listB = await http(a, "/api/plans", { method: "GET", cookie: famB.jar }); assert.equal(listB.status, 200); assert.ok(!listB.json.plans.some((p) => Number(p.id) === planId));
    const one = await http(a, `/api/plans/${planId}`, { method: "GET", cookie: famB.jar }); assert.equal(one.status, 404);
  });
});
