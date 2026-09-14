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
  const email = `rep_${tag}_${Date.now()}@example.com`; const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db"); const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]); assert.ok(row.rows[0], `signup row missing for ${email}: ${r.text}`); return { jar: jar(r), familyId: Number(row.rows[0].family_id) };
}
describe("reports integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("reports are family scoped and need activity", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const famA = await signup(a, "RA"); const famB = await signup(a, "RB");
    const ra = await http(a, "/api/family/learners", { cookie: famA.jar, body: { name: "KidA", username: `kida_${Date.now()}`, pin: "1234" } }); assert.equal(ra.status, 201);
    const kidA = (await (async()=>{const q=await db.query("select id from users where family_id=$1 and role='learner' order by id desc limit 1", [famA.familyId]); assert.ok(q.rows[0], "learner insert failed"); return Number(q.rows[0].id);})());
    const listB0 = await http(a, "/api/reports", { method: "GET", cookie: famB.jar }); assert.equal(listB0.status, 200);
    const gen = await http(a, "/api/reports/generate", { cookie: famA.jar, body: { learnerId: kidA, from: "2026-09-01", to: "2026-09-30" } }); assert.equal(gen.status, 400);
  });
});
