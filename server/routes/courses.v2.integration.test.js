// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);
async function app() { return require("../../server/index"); }
async function http(a, path, opts = {}) {
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
        let d = ""; res.on("data", (x) => { d += x; }); res.on("end", () => { s.close(); let j = null; try { j = JSON.parse(d || ""); } catch {} const sc = res.headers["set-cookie"] || []; const c = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []); resolve({ status: res.statusCode, headers: res.headers, setCookie: c, text: d || "", json: j }); });
      });
      req.on("error", (e) => { s.close(); reject(e); });
      if (body != null) req.write(body); req.end();
    });
  });
}
function jar(r) { return r.setCookie.map((c) => c.split(";")[0]).join("; "); }
async function signup(a, tag) {
  const email = `c2_${tag}_${Date.now()}_${Math.random().toString(36).slice(2,6)}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0]);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].familyId) };
}
describe("courses v2 integration: generator routes through harness", () => {
  before(ctx.setup); after(ctx.teardown);
  it("generate-outline validates and enqueues course-outline job", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const fam = await signup(a, "outlineA");
    const badTopic = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: {} });
    assert.equal(badTopic.status, 400, badTopic.text);
    assert.match(badTopic.text, /topic_required/);
    const emptyTopic = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "ab" } });
    assert.equal(emptyTopic.status, 400);
    const badGrade = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "Fractions for grade 4", gradeLevel: 99 } });
    assert.equal(badGrade.status, 400, badGrade.text);
    assert.match(badGrade.text, /grade_invalid/);
    const badLang = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "Spanish basics", language: "not-a-language!" } });
    assert.equal(badLang.status, 400, badLang.text);
    assert.match(badLang.text, /language_invalid/);
    const badCefr = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "Spanish basics", cefr: "Z9" } });
    assert.equal(badCefr.status, 400, badCefr.text);
    assert.match(badCefr.text, /cefr_invalid/);
    const ai = require("../lib/ai"); const orig = ai.configured; ai.configured = () => true;
    try {
      const ok = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "Fractions through baking for grade 4", language: "es", cefr: "A1", size: { units: 1, lessonsPerUnit: 1 } } });
      assert.equal(ok.status, 202, ok.text);
      assert.ok(ok.json.jobId);
      const db = require("../lib/db");
      const job = await db.query("select type, status from jobs where id=$1 and family_id=$2", [Number(ok.json.jobId), fam.familyId]);
      assert.equal(job.rows[0].type, "course-outline");
      assert.equal(job.rows[0].status, "queued");
      const verifyBad = await http(a, "/api/courses/999999/verify", { cookie: fam.jar });
      assert.equal(verifyBad.status, 404, verifyBad.text);
      const verifGetBad = await http(a, "/api/courses/999999/verification", { method: "GET", cookie: fam.jar });
      assert.equal(verifGetBad.status, 404, verifGetBad.text);
      const mediaBad = await http(a, "/api/courses/999999/media-pass", { cookie: fam.jar });
      assert.equal(mediaBad.status, 404, mediaBad.text);
      const c = await db.query("insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [fam.familyId, "Probe", "probe", fam.userId]);
      const courseId = Number(c.rows[0].id);
      const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "U"]);
      await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [Number(un.rows[0].id), "L"]);
      const verifEmpty = await http(a, "/api/courses/" + courseId + "/verification", { method: "GET", cookie: fam.jar });
      assert.equal(verifEmpty.status, 200, verifEmpty.text);
      assert.ok(Array.isArray(verifEmpty.json.flags));
    } finally { ai.configured = orig; }
  });
  it("generate-from-outline validates outline, persists skeleton, and enqueues lesson jobs", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const fam = await signup(a, "outlineB");
    const ai = require("../lib/ai"); const orig = ai.configured; ai.configured = () => true;
    try {
      const noOutline = await http(a, "/api/courses/generate-from-outline", { cookie: fam.jar, body: {} });
      assert.equal(noOutline.status, 400, noOutline.text);
      assert.match(noOutline.text, /outline_required/);
      const badOutline = await http(a, "/api/courses/generate-from-outline", { cookie: fam.jar, body: { outline: { title: "", units: [] } } });
      assert.equal(badOutline.status, 400, badOutline.text);
      assert.match(badOutline.text, /outline_unparseable/);
      const badLang2 = await http(a, "/api/courses/generate-from-outline", { cookie: fam.jar, body: { outline: { title: "T", units: [{ title: "U", lessons: [{ title: "L1" }] }] }, language: "!!", cefr: "A1" } });
      assert.equal(badLang2.status, 400, badLang2.text);
      assert.match(badLang2.text, /language_invalid/);
      const outline = { title: "Spanish A1 Greetings", description: "Two lessons", units: [{ title: "Hola", objective: "Greet in Spanish", lessons: [{ title: "Hola y adios", objective: "Say hello and goodbye", plannedKind: "vocab_card", timeEstimateMin: 15 }, { title: "Como te llamas", objective: "Ask names", plannedKind: "listen_choice" }] }] };
      const res = await http(a, "/api/courses/generate-from-outline", { cookie: fam.jar, body: { topic: "Spanish A1", outline, language: "es", cefr: "A1", size: { units: 1, lessonsPerUnit: 2 } } });
      assert.equal(res.status, 201, res.text);
      assert.ok(res.json.courseId);
      assert.ok(Array.isArray(res.json.lessonJobs));
      assert.equal(res.json.lessonJobs.length, 2);
      for (const lj of res.json.lessonJobs) assert.ok(lj.jobId && lj.lessonId, JSON.stringify(lj));
      const db = require("../lib/db");
      const jobs = await db.query("select type from jobs where family_id=$1 and type='course-lesson' order by id", [fam.familyId]);
      assert.ok(jobs.rows.length >= 2);
      const tree = await http(a, "/api/courses/" + res.json.courseId, { method: "GET", cookie: fam.jar });
      assert.equal(tree.status, 200, tree.text);
      assert.ok(tree.json.course);
      const plain = { title: "Fractions", units: [{ title: "Basics", lessons: [{ title: "Halves" }, { title: "Quarters" }] }] };
      const res2 = await http(a, "/api/courses/generate-from-outline", { cookie: fam.jar, body: { outline: plain } });
      assert.equal(res2.status, 201, res2.text);
      assert.equal(res2.json.lessonJobs.length, 2);
    } finally { ai.configured = orig; }
  });
  it("course-verify and course-media job routes exist", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const fam = await signup(a, "outlineJobs");
    const db = require("../lib/db");
    const c = await db.query("insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [fam.familyId, "Probe2", "probe2", fam.userId]);
    const cid = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [cid, "U"]);
    await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [Number(un.rows[0].id), "L"]);
    const mediaJob = await http(a, "/api/courses/" + cid + "/media-pass", { cookie: fam.jar });
    assert.equal(mediaJob.status, 202, mediaJob.text);
    const verifyJob = await http(a, "/api/courses/" + cid + "/verify", { cookie: fam.jar });
    assert.equal(verifyJob.status, 202, verifyJob.text);
  });
});
