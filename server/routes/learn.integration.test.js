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
  const email = `learn_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
async function seedCourse(db, familyId, ownerId) {
  const c = await db.query("insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id", [familyId, `Course ${Date.now()}`, "fractions", ownerId]);
  const courseId = Number(c.rows[0].id);
  const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
  const uid = Number(un.rows[0].id);
  const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
  const lid = Number(ls.rows[0].id);
  const mcq = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',0,$2) returning id", [lid, JSON.stringify({ prompt: "2+2?", kind: "mcq", choices: [{ id: "c1", text: "3" }, { id: "c2", text: "4" }, { id: "c3", text: "5" }], answer: "c2", explanation: "2+2 is 4", hint: "add" })]);
  await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2) returning id", [lid, JSON.stringify({ prompt: "Half of 10?", kind: "numeric", answer: 5 })]);
  return { courseId, lessonId: lid, mcqId: Number(mcq.rows[0].id) };
}
describe("learn integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("attempt graded server-side and answer never in learner tree", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "graded");
    const uniq = `k_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: uniq, username: uniq, pin: "1234" } });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uniq, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text); const lj = jar(lr);
    const { courseId, mcqId } = await seedCourse(db, fam.familyId, fam.userId);
    const tree = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: lj });
    if (tree.status === 404) {
      const list = await http(a, "/api/learn/courses", { method: "GET", cookie: lj }); assert.equal(list.status, 200, list.text);
    } else {
      assert.equal(tree.status, 200, tree.text);
      const body = JSON.stringify(tree.json);
      assert.ok(!body.includes('"answer":"c2"') && !body.includes('"answer": "c2"'), "learner tree leaked answer");
    }
    const at = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: mcqId, questionIndex: 0, answer: "c2" } });
    assert.equal(at.status, 200, at.text); assert.equal(at.json.correct, true);
    const at2 = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: mcqId, questionIndex: 0, answer: "c1" } });
    assert.equal(at2.status, 200); assert.equal(at2.json.correct, false);
  });
  it("learner cannot see another family course", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const famA = await signup(a, "famA"); const famB = await signup(a, "famB");
    const ka = `ka_${Date.now()}`; const kb = `kb_${Date.now()}`;
    const rA = await http(a, "/api/family/learners", { cookie: famA.jar, body: { name: ka, username: ka, pin: "1234" } }); assert.equal(rA.status, 201);
    const rB = await http(a, "/api/family/learners", { cookie: famB.jar, body: { name: kb, username: kb, pin: "1234" } }); assert.equal(rB.status, 201);
    const { courseId } = await seedCourse(db, famA.familyId, famA.userId);
    const codeB = (await db.query("select join_code from families where id=$1", [famB.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode: codeB, username: kb, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text); const lj = jar(lr);
    const tree = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: lj });
    assert.equal(tree.status, 404, `cross-family should be 404 got ${tree.status}: ${tree.text}`);
  });
});
