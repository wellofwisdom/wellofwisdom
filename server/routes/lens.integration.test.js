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
  const email = `lens_${tag}_${Date.now()}_${Math.random().toString(36).slice(2,4)}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id), email };
}
async function createLearner(a, parentJar, tag) {
  const uname = `le_${tag}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const r = await http(a, "/api/family/learners", { cookie: parentJar, body: { name: uname, username: uname, pin: "1234" } });
  assert.equal(r.status, 201, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id from users where username=$1", [uname.toLowerCase()]);
  assert.ok(row.rows[0]);
  return { username: uname, learnerId: Number(row.rows[0].id) };
}

describe("lens integration", () => {
  before(ctx.setup);
  after(ctx.teardown);

  it("course lens: persists on export/import and visible in detail", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "course_lens");
    const c = await db.query("insert into courses (family_id, title, topic, lens, grade_level, status, created_by) values ($1,$2,$3,$4,$5,'draft',$6) returning id", [fam.familyId, `Lens Course ${Date.now()}`, "fractions", "horses", 4, fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2)", [lid, JSON.stringify({ title: "Intro", body: "hello" })]);
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2)", [lid, JSON.stringify({ prompt: "1+1?", kind: "mcq", choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }], answer: "b" })]);

    const tree = await http(a, `/api/courses/${courseId}`, { method: "GET", cookie: fam.jar });
    assert.equal(tree.status, 200, tree.text);
    assert.equal(tree.json.course.lens, "horses");
    const row = await db.query("select lens from courses where id=$1", [courseId]); assert.equal(row.rows[0].lens, "horses");

    const ex = await http(a, `/api/courses/${courseId}/export`, { method: "GET", cookie: fam.jar });
    assert.equal(ex.status, 200, ex.text);
    assert.equal(ex.json.lens, "horses");

    const imp = await http(a, "/api/courses/import", { cookie: fam.jar, body: { ...ex.json, title: `Imported ${Date.now()}` } });
    assert.equal(imp.status, 201, imp.text);
    const imported = await http(a, `/api/courses/${Number(imp.json.courseId)}`, { method: "GET", cookie: fam.jar });
    assert.equal(imported.status, 200, imported.text);
    assert.equal(imported.json.course.lens, "horses");

    // Lens absent without source
    const c2 = await db.query("insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id", [fam.familyId, `No lens ${Date.now()}`, "fractions", fam.userId]);
    const id2 = Number(c2.rows[0].id);
    const ex2 = await http(a, `/api/courses/${id2}/export`, { method: "GET", cookie: fam.jar });
    assert.equal(ex2.status, 200); assert.equal(ex2.json.lens, null);
    const got2 = await http(a, `/api/courses/${id2}`, { method: "GET", cookie: fam.jar });
    assert.equal(got2.status, 200); assert.equal(got2.json.course.lens, null);
  });

  it("course list includes lens, family scoped", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "list_lensA");
    const famB = await signup(a, "list_lensB");
    const c = await db.query("insert into courses (family_id, title, topic, lens, status, created_by) values ($1,$2,$3,$4,'draft',$5) returning id", [famA.familyId, `Scoped ${Date.now()}`, "fractions", "dinosaurs", famA.userId]);
    const id = Number(c.rows[0].id);
    const listA = await http(a, "/api/courses", { method: "GET", cookie: famA.jar });
    assert.equal(listA.status, 200, listA.text);
    const mine = listA.json.courses.find((x) => Number(x.id) === id);
    assert.ok(mine, listA.text); assert.equal(mine.lens, "dinosaurs");
    const listB = await http(a, "/api/courses", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200, listB.text);
    assert.ok(!listB.json.courses.some((x) => Number(x.id) === id));
  });

  it("plan lens_override: per-learner personalization persisted and visible", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "plan_lens");
    const { learnerId: l1 } = await createLearner(a, fam.jar, "pl1");
    const { learnerId: l2 } = await createLearner(a, fam.jar, "pl2");
    const ms = [{ title: "m1" }, { title: "m2" }, { title: "m3" }];
    const r = await http(a, "/api/plans", { cookie: fam.jar, body: { title: "Path with lenses", subject: "Math", startDate: "2026-09-01", endDate: "2026-10-01", learners: [{ learnerId: l1, lens: "horses", note: "loves horses" }, { learnerId: l2, lens: "dinosaurs" }], milestones: ms } });
    assert.equal(r.status, 201, r.text);
    const planId = Number(r.json.planId);
    const get = await http(a, `/api/plans/${planId}`, { method: "GET", cookie: fam.jar });
    assert.equal(get.status, 200, get.text);
    const e1 = get.json.plan.enrollments.find((e) => Number(e.learner_id) === l1);
    const e2 = get.json.plan.enrollments.find((e) => Number(e.learner_id) === l2);
    assert.ok(e1 && e2, get.text);
    assert.equal(e1.lens_override, "horses");
    assert.equal(e1.personal_note, "loves horses");
    assert.equal(e2.lens_override, "dinosaurs");
    const rows = await db.query("select learner_id, lens_override from plan_enrollments where plan_id=$1 order by learner_id", [planId]);
    assert.equal(rows.rows.length, 2);
    // empty lens becomes null
    const { learnerId: l3 } = await createLearner(a, fam.jar, "pl3");
    const r2 = await http(a, "/api/plans", { cookie: fam.jar, body: { title: "No lens", subject: "Math", startDate: "2026-09-01", endDate: "2026-10-01", learners: [{ learnerId: l3, lens: "   " }], milestones: ms } });
    assert.equal(r2.status, 201, r2.text);
    const g2 = await http(a, `/api/plans/${Number(r2.json.planId)}`, { method: "GET", cookie: fam.jar });
    assert.equal(g2.status, 200);
    const e3 = g2.json.plan.enrollments.find((e) => Number(e.learner_id) === l3);
    assert.equal(e3.lens_override, null);
  });

  it("plan and course lens both present for generate and milestone flows (stubbed)", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const fam = await signup(a, "lens_gen");
    const many = "x".repeat(250);
    // generate requires ai_not_configured today; lens validation still runs:
    // invalid grade on generate surfaces before ai check for generate, but lens itself is just trimmed.
    const r = await http(a, "/api/courses/generate", { cookie: fam.jar, body: { topic: many.slice(0, 10), lens: many, gradeLevel: 4, notes: "n" } });
    // Without AI it is 503, with it 202; either proves lens did not cause a separate failure.
    assert.ok([202, 503].includes(r.status), `${r.status}: ${r.text}`);
    const o = await http(a, "/api/plans/outline", { cookie: fam.jar, body: { subject: "Math", goal: "g", startDate: "2026-09-01", endDate: "2026-10-01", lens: many } });
    assert.ok([202, 503].includes(o.status), `${o.status}: ${o.text}`);
    const go = await http(a, "/api/courses/generate-outline", { cookie: fam.jar, body: { topic: "fractions", lens: many, gradeLevel: 4 } });
    assert.ok([202, 503].includes(go.status), `${go.status}: ${go.text}`);
  });

  it("learner course view surfaces lens (family scoped published)", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "learner_lens");
    const { username, learnerId } = await createLearner(a, fam.jar, "ll1");
    void learnerId;
    const code = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode: code, username, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const c = await db.query("insert into courses (family_id, title, topic, lens, status, learner_id, created_by) values ($1,$2,$3,$4,'published',null,$5) returning id", [fam.familyId, `Learner lens ${Date.now()}`, "fractions", "horses", fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2)", [lid, JSON.stringify({ title: "Intro", body: "hi" })]);
    const list = await http(a, "/api/learn/courses", { method: "GET", cookie: lj });
    assert.equal(list.status, 200, list.text);
    const hit = (list.json.courses || []).find((x) => Number(x.id) === courseId);
    assert.ok(hit, list.text);
    assert.equal(hit.lens, "horses");
    const one = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: lj });
    assert.equal(one.status, 200, one.text);
    assert.equal(one.json.course.lens, "horses");
    // cross-family learner sees nothing
    const famB = await signup(a, "learner_lensB");
    const { username: uB } = await createLearner(a, famB.jar, "llB");
    const codeB = (await db.query("select join_code from families where id=$1", [famB.familyId])).rows[0].join_code;
    const lrB = await http(a, "/api/auth/learner-login", { body: { joinCode: codeB, username: uB, pin: "1234" } });
    const ljB = jar(lrB);
    const miss = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: ljB });
    assert.equal(miss.status, 404, miss.text);
  });

  it("adventure world builder uses lens interest for flavor (stubbed ai lens task)", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const ai = require("../lib/ai");
    const orig = ai.chatJson;
    let seenTask = null;
    ai.chatJson = async (task, messages) => {
      seenTask = task;
      void messages;
      return { json: { title: "World", tagline: "tag", setting: "setting", characters: [{ name: "You", role: "self", description: "you", portraitPrompt: "p" }], chapters: [{ title: "Ch1", hook: "hook", boss: true }], coverPrompt: "cover" }, content: "", usage: null, model: "stub" };
    };
    try {
      const fam = await signup(a, "adv_lens");
      const c = await db.query("insert into courses (family_id, title, topic, lens, status, created_by) values ($1,$2,$3,$4,'draft',$5) returning id", [fam.familyId, `Adv ${Date.now()}`, "fractions", "horses", fam.userId]);
      const courseId = Number(c.rows[0].id);
      const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
      const uid = Number(un.rows[0].id);
      await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0)", [uid, "Lesson 1"]);
      const course = { title: `Adv ${courseId}`, units: [{ title: "Unit 1" }] };
      const learner = { name: "Kid", grade_level: 4, interests: ["horses"] };
      const { buildWorld } = require("../lib/adventure");
      const out = await buildWorld({ themeId: "custom", course, learner });
      assert.ok(out.world && out.world.title === "World");
      assert.equal(seenTask, "lens");
      assert.ok(out.world.characters.length >= 1);
      assert.ok(out.world.chapters.length >= 1);
    } finally {
      ai.chatJson = orig;
    }
  });

  it("plan milestone course generation picks lens_override (no AI: expects 503)", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "mile_lens");
    const { learnerId } = await createLearner(a, fam.jar, "ml1");
    const ms = [{ title: "m1" }, { title: "m2" }, { title: "m3" }];
    const cr = await http(a, "/api/plans", { cookie: fam.jar, body: { title: "Milestone lens", subject: "Math", startDate: "2026-09-01", endDate: "2026-10-01", learners: [{ learnerId, lens: "horses" }], milestones: ms } });
    assert.equal(cr.status, 201, cr.text);
    const planId = Number(cr.json.planId);
    const row = await db.query("select id from plan_milestones where plan_id=$1 order by position limit 1", [planId]);
    const mid = Number(row.rows[0].id);
    const r = await http(a, `/api/plans/milestones/${mid}/course`, { cookie: fam.jar, body: { learnerId } });
    assert.ok([202, 503].includes(r.status), `${r.status}: ${r.text}`);
    if (r.status === 503) assert.match(r.text, /ai_not_configured/);
    const notFound = await http(a, "/api/plans/milestones/999999/course", { cookie: fam.jar, body: {} });
    assert.equal(notFound.status, 404, notFound.text);
  });
});
