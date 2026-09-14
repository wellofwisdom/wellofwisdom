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
  const email = `course_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}: ${r.text}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
describe("courses integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("export round-trips through import, family scoped", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const famA = await signup(a, "A"); const famB = await signup(a, "B");
    const c = await db.query("insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [famA.familyId, "Seed Course", "fractions", famA.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2)", [lid, JSON.stringify({ title: "Intro", body: "Hello world" })]);
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2)", [lid, JSON.stringify({ prompt: "2+2?", kind: "mcq", choices: [{ id: "c1", text: "3" }, { id: "c2", text: "4" }], answer: "c2" })]);
    const listA = await http(a, "/api/courses", { method: "GET", cookie: famA.jar });
    assert.equal(listA.status, 200, listA.text); assert.ok(listA.json.courses.some((x) => Number(x.id) === courseId));
    const listB = await http(a, "/api/courses", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200, listB.text); assert.ok(!listB.json.courses.some((x) => Number(x.id) === courseId));
    const ex = await http(a, `/api/courses/${courseId}/export`, { method: "GET", cookie: famA.jar });
    assert.equal(ex.status, 200, ex.text); assert.equal(ex.json.format, "wellofwisdom-course");
    const imp = await http(a, "/api/courses/import", { cookie: famB.jar, body: ex.json });
    assert.equal(imp.status, 201, imp.text);
    const importedId = Number(imp.json.courseId); assert.ok(importedId > 0);
    const got = await http(a, `/api/courses/${importedId}`, { method: "GET", cookie: famB.jar });
    assert.equal(got.status, 200, got.text); assert.equal(got.json.course.title, "Seed Course");
    const ex2 = await http(a, `/api/courses/${importedId}/export`, { method: "GET", cookie: famB.jar });
    assert.equal(ex2.status, 200); assert.equal(ex2.json.title, "Seed Course");
  });
});
