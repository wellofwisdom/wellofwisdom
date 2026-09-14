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
  const email = `upl_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email]);
  assert.ok(row.rows[0], `signup row missing for ${email}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
describe("uploads integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("uploads list is family scoped", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const famA = await signup(a, "Au"); const famB = await signup(a, "Bu");
    const insA = await db.query("insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by) values ($1,'image','image/png',123,$2,'a.png','A image',$3) returning id", [famA.familyId, `${famA.familyId}/test-a.png`, famA.userId]);
    const idA = Number(insA.rows[0].id);
    const listB = await http(a, "/api/uploads", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200, listB.text); assert.ok(!listB.json.uploads.some((u) => Number(u.id) === idA));
    const listA = await http(a, "/api/uploads", { method: "GET", cookie: famA.jar });
    assert.equal(listA.status, 200); assert.ok(listA.json.uploads.some((u) => Number(u.id) === idA));
  });
});
