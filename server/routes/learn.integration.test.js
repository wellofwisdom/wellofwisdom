// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);
async function app() {
  return require("../../server/index");
}
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
      const req = m.request(
        { method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h },
        (res) => {
          let d = "";
          res.on("data", (x) => {
            d += x;
          });
          res.on("end", () => {
            s.close();
            let j = null;
            try {
              j = JSON.parse(d || "");
            } catch {}
            const sc = res.headers["set-cookie"] || [];
            const c = Array.isArray(sc) ? sc : sc ? [String(sc)] : [];
            resolve({
              status: res.statusCode,
              headers: res.headers,
              setCookie: c,
              text: d || "",
              json: j,
            });
          });
        }
      );
      req.on("error", (e) => {
        s.close();
        reject(e);
      });
      if (body != null) req.write(body);
      req.end();
    });
  });
}
function jar(r) {
  return r.setCookie.map((c) => c.split(";")[0]).join("; ");
}
async function signup(a, tag) {
  const email = `learn_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", {
    body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" },
  });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
async function seedCourse(db, familyId, ownerId) {
  const c = await db.query(
    "insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id",
    [familyId, `Course ${Date.now()}`, "fractions", ownerId]
  );
  const courseId = Number(c.rows[0].id);
  const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [
    courseId,
    "Unit 1",
  ]);
  const uid = Number(un.rows[0].id);
  const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [
    uid,
    "Lesson 1",
  ]);
  const lid = Number(ls.rows[0].id);
  const mcq = await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',0,$2) returning id",
    [
      lid,
      JSON.stringify({
        prompt: "2+2?",
        kind: "mcq",
        choices: [
          { id: "c1", text: "3" },
          { id: "c2", text: "4" },
          { id: "c3", text: "5" },
        ],
        answer: "c2",
        explanation: "2+2 is 4",
        hint: "add",
      }),
    ]
  );
  await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2) returning id",
    [lid, JSON.stringify({ prompt: "Half of 10?", kind: "numeric", answer: 5 })]
  );
  return { courseId, lessonId: lid, mcqId: Number(mcq.rows[0].id) };
}
async function learnerLogin(a, familyId, tag) {
  const db = require("../lib/db");
  const uname = `k_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const r = await http(a, "/api/family/learners", {
    cookie: (await signup(a, tag + "_parent")).jar,
    body: { name: uname, username: uname, pin: "1234" },
  });
  void r;
  return uname;
}
describe("learn integration", () => {
  before(ctx.setup);
  after(ctx.teardown);
  it("attempt graded server-side and answer never in learner tree", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "graded");
    const uniq = `k_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const { courseId, mcqId } = await seedCourse(db, fam.familyId, fam.userId);
    const tree = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: lj });
    if (tree.status === 404) {
      const list = await http(a, "/api/learn/courses", { method: "GET", cookie: lj });
      assert.equal(list.status, 200, list.text);
    } else {
      assert.equal(tree.status, 200, tree.text);
      const body = JSON.stringify(tree.json);
      assert.ok(
        !body.includes('"answer":"c2"') && !body.includes('"answer": "c2"'),
        "learner tree leaked answer"
      );
    }
    const at = await http(a, "/api/learn/attempt", {
      cookie: lj,
      body: { itemId: mcqId, questionIndex: 0, answer: "c2" },
    });
    assert.equal(at.status, 200, at.text);
    assert.equal(at.json.correct, true);
    const at2 = await http(a, "/api/learn/attempt", {
      cookie: lj,
      body: { itemId: mcqId, questionIndex: 0, answer: "c1" },
    });
    assert.equal(at2.status, 200);
    assert.equal(at2.json.correct, false);
  });
  it("learner cannot see another family course", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "famA");
    const famB = await signup(a, "famB");
    const ka = `ka_${Date.now()}`;
    const kb = `kb_${Date.now()}`;
    const rA = await http(a, "/api/family/learners", {
      cookie: famA.jar,
      body: { name: ka, username: ka, pin: "1234" },
    });
    assert.equal(rA.status, 201);
    const rB = await http(a, "/api/family/learners", {
      cookie: famB.jar,
      body: { name: kb, username: kb, pin: "1234" },
    });
    assert.equal(rB.status, 201);
    const { courseId } = await seedCourse(db, famA.familyId, famA.userId);
    const codeB = (await db.query("select join_code from families where id=$1", [famB.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode: codeB, username: kb, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const tree = await http(a, `/api/learn/courses/${courseId}`, { method: "GET", cookie: lj });
    assert.equal(tree.status, 404, `cross-family should be 404 got ${tree.status}: ${tree.text}`);
  });
  it("learner lesson fetch strips answers and reflections family-scoped", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "lessonfetch");
    const uniq = `lf_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const { lessonId } = await seedCourse(db, fam.familyId, fam.userId);
    const famB = await signup(a, "lessonfetchB");
    const kb = `kb_${Date.now()}`;
    const rB = await http(a, "/api/family/learners", {
      cookie: famB.jar,
      body: { name: kb, username: kb, pin: "1234" },
    });
    assert.equal(rB.status, 201);
    const codeB = (await db.query("select join_code from families where id=$1", [famB.familyId])).rows[0]
      .join_code;
    const lrB = await http(a, "/api/auth/learner-login", {
      body: { joinCode: codeB, username: kb, pin: "1234" },
    });
    assert.equal(lrB.status, 200);
    const ljB = jar(lrB);
    const own = await http(a, `/api/learn/lessons/${lessonId}`, { method: "GET", cookie: lj });
    assert.equal(own.status, 200, own.text);
    assert.ok(own.json.lesson && Array.isArray(own.json.lesson.items), own.text);
    const body = JSON.stringify(own.json.lesson);
    assert.ok(
      !body.includes('"answer":"c2"') && !body.includes('"answer": "c2"'),
      "lesson fetch leaked answer"
    );
    assert.ok(own.json.solved && typeof own.json.solved === "object");
    assert.ok(own.json.submissions && typeof own.json.submissions === "object");
    const cross = await http(a, `/api/learn/lessons/${lessonId}`, { method: "GET", cookie: ljB });
    assert.equal(cross.status, 404, `cross-family lesson should be 404 got ${cross.status}: ${cross.text}`);
    const badId = await http(a, "/api/learn/lessons/999999", { method: "GET", cookie: lj });
    assert.equal(badId.status, 404, badId.text);
  });
  it("project submissions: draft, hand in, already_submitted, and seen", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "projsub");
    const uniq = `ps_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const c = await db.query(
      "insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id",
      [fam.familyId, `Proj course ${Date.now()}`, "fractions", fam.userId]
    );
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [
      courseId,
      "Unit 1",
    ]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [
      uid,
      "Lesson 1",
    ]);
    const lid = Number(ls.rows[0].id);
    const pj = await db.query(
      "insert into lesson_items (lesson_id, type, position, content) values ($1,'project',0,$2) returning id",
      [lid, JSON.stringify({ title: "Write about fractions", prompt: "Explain halves." })]
    );
    const projId = Number(pj.rows[0].id);
    const mcq = await db.query(
      "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2) returning id",
      [
        lid,
        JSON.stringify({ prompt: "Q?", kind: "mcq", choices: [{ id: "a", text: "x" }], answer: "a" }),
      ]
    );
    const mcqId = Number(mcq.rows[0].id);
    const nonProject = await http(a, `/api/learn/submissions/${mcqId}`, {
      method: "PUT",
      cookie: lj,
      body: { body: "hi", submit: false },
    });
    assert.equal(nonProject.status, 400, nonProject.text);
    assert.match(nonProject.text, /not_a_project/);
    const draft = await http(a, `/api/learn/submissions/${projId}`, {
      method: "PUT",
      cookie: lj,
      body: { body: "my draft", submit: false },
    });
    assert.equal(draft.status, 200, draft.text);
    assert.equal(draft.json.submission.status, "draft");
    const emptySubmit = await http(a, `/api/learn/submissions/${projId}`, {
      method: "PUT",
      cookie: lj,
      body: { body: "   ", submit: true },
    });
    assert.equal(emptySubmit.status, 400, emptySubmit.text);
    assert.match(emptySubmit.text, /nothing_to_hand_in/);
    const handed = await http(a, `/api/learn/submissions/${projId}`, {
      method: "PUT",
      cookie: lj,
      body: { body: "final answer", submit: true },
    });
    assert.equal(handed.status, 200, handed.text);
    assert.equal(handed.json.submission.status, "submitted");
    const already = await http(a, `/api/learn/submissions/${projId}`, {
      method: "PUT",
      cookie: lj,
      body: { body: "again", submit: true },
    });
    assert.equal(already.status, 409, already.text);
    assert.match(already.text, /already_submitted/);
    const seen = await http(a, `/api/learn/submissions/${projId}/seen`, { method: "POST", cookie: lj });
    assert.equal(seen.status, 200, seen.text);
    assert.equal(seen.json.ok, true);
    const lesson = await http(a, `/api/learn/lessons/${lid}`, { method: "GET", cookie: lj });
    assert.equal(lesson.status, 200, lesson.text);
    assert.ok(lesson.json.lesson && Array.isArray(lesson.json.lesson.items));
  });
  it("learner progress surfaces: courses list, returned, review, gamification, hud, plans, upcoming, complete", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "progress");
    const uniq = `pg_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    await seedCourse(db, fam.familyId, fam.userId);
    const list = await http(a, "/api/learn/courses", { method: "GET", cookie: lj });
    assert.equal(list.status, 200, list.text);
    assert.ok(Array.isArray(list.json.courses));
    assert.ok(list.json.courses.length >= 1, list.text);
    assert.ok("lesson_count" in list.json.courses[0] && "lessons_done" in list.json.courses[0], list.text);
    const firstId = Number(list.json.courses[0].id);
    const single = await http(a, `/api/learn/courses/${firstId}`, { method: "GET", cookie: lj });
    assert.equal(single.status, 200, single.text);
    assert.ok(single.json.course && Array.isArray(single.json.course.units));
    assert.ok(single.json.course.progress && typeof single.json.course.progress.lessonsTotal === "number");
    const missing = await http(a, "/api/learn/courses/999999", { method: "GET", cookie: lj });
    assert.equal(missing.status, 404, missing.text);
    const returned = await http(a, "/api/learn/returned", { method: "GET", cookie: lj });
    assert.equal(returned.status, 200, returned.text);
    assert.ok(Array.isArray(returned.json.returned));
    const review = await http(a, "/api/learn/review", { method: "GET", cookie: lj });
    assert.equal(review.status, 200, review.text);
    assert.ok(typeof review.json.due === "number" && Array.isArray(review.json.items));
    const gam = await http(a, "/api/learn/gamification", { method: "GET", cookie: lj });
    assert.equal(gam.status, 200, gam.text);
    assert.ok(gam.json.badges && Array.isArray(gam.json.badges));
    assert.ok(gam.json.locked && Array.isArray(gam.json.locked));
    const hud = await http(a, "/api/learn/hud", { method: "GET", cookie: lj });
    assert.equal(hud.status, 200, hud.text);
    assert.ok(typeof hud.json.xp === "number" && typeof hud.json.packCount === "number");
    const plans = await http(a, "/api/learn/plans", { method: "GET", cookie: lj });
    assert.equal(plans.status, 200, plans.text);
    assert.ok(Array.isArray(plans.json.plans));
    const upcoming = await http(a, "/api/learn/upcoming", { method: "GET", cookie: lj });
    assert.equal(upcoming.status, 200, upcoming.text);
    assert.ok(Array.isArray(upcoming.json.events) && Array.isArray(upcoming.json.milestones));
    const adv = await http(a, `/api/learn/adventure/${firstId}`, { method: "GET", cookie: lj });
    assert.equal(adv.status, 200, adv.text);
    assert.ok("adventure" in adv.json);
    const lessonId = Number(single.json.course.units[0].lessons[0].id);
    const complete = await http(a, `/api/learn/lessons/${lessonId}/complete`, {
      method: "POST",
      cookie: lj,
    });
    assert.equal(complete.status, 200, complete.text);
    assert.equal(complete.json.ok, true);
    const completeAgain = await http(a, `/api/learn/lessons/${lessonId}/complete`, {
      method: "POST",
      cookie: lj,
    });
    assert.equal(completeAgain.status, 200);
    const otherFam = await signup(a, "progressOther");
    const otherU = `other_${Date.now()}`;
    const cr2 = await http(a, "/api/family/learners", {
      cookie: otherFam.jar,
      body: { name: otherU, username: otherU, pin: "1234" },
    });
    assert.equal(cr2.status, 201);
    const code2 = (await db.query("select join_code from families where id=$1", [otherFam.familyId])).rows[0]
      .join_code;
    const lr2 = await http(a, "/api/auth/learner-login", {
      body: { joinCode: code2, username: otherU, pin: "1234" },
    });
    assert.equal(lr2.status, 200);
    const lj2 = jar(lr2);
    const crossComplete = await http(a, `/api/learn/lessons/${lessonId}/complete`, {
      method: "POST",
      cookie: lj2,
    });
    assert.equal(crossComplete.status, 404, `cross-family complete should be 404 got ${crossComplete.status}`);
  });
  it("attempt rejects cross-family, bad id, not gradable, and bad kind", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "attemptneg");
    const uniq = `an_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const { lessonId, mcqId } = await seedCourse(db, fam.familyId, fam.userId);
    const famB = await signup(a, "attemptnegB");
    const kb = `kb_${Date.now()}`;
    const rB = await http(a, "/api/family/learners", {
      cookie: famB.jar,
      body: { name: kb, username: kb, pin: "1234" },
    });
    assert.equal(rB.status, 201);
    const codeB = (await db.query("select join_code from families where id=$1", [famB.familyId])).rows[0]
      .join_code;
    const lrB = await http(a, "/api/auth/learner-login", {
      body: { joinCode: codeB, username: kb, pin: "1234" },
    });
    assert.equal(lrB.status, 200);
    const ljB = jar(lrB);
    const cross = await http(a, "/api/learn/attempt", {
      cookie: ljB,
      body: { itemId: mcqId, questionIndex: 0, answer: "c2" },
    });
    assert.equal(cross.status, 404, cross.text);
    const badId = await http(a, "/api/learn/attempt", {
      cookie: lj,
      body: { itemId: "nope", answer: "c2" },
    });
    assert.equal(badId.status, 400, badId.text);
    assert.match(badId.text, /item_invalid/);
    const notFound = await http(a, "/api/learn/attempt", {
      cookie: lj,
      body: { itemId: 999999, answer: "c2" },
    });
    assert.equal(notFound.status, 404, notFound.text);
    const art = await db.query(
      "insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2) returning id",
      [lessonId, JSON.stringify({ title: "T", body: "b" })]
    );
    const artId = Number(art.rows[0].id);
    const nonGradable = await http(a, "/api/learn/attempt", {
      cookie: lj,
      body: { itemId: artId, answer: "x" },
    });
    assert.equal(nonGradable.status, 400, nonGradable.text);
    assert.match(nonGradable.text, /not_gradable/);
  });
  it("explain requires reachability and ai, returns 503 when not configured", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "explain");
    const uniq = `ex_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0]
      .join_code;
    const lr = await http(a, "/api/auth/learner-login", {
      body: { joinCode, username: uniq, pin: "1234" },
    });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const { mcqId } = await seedCourse(db, fam.familyId, fam.userId);
    const notFound = await http(a, "/api/learn/explain", {
      cookie: lj,
      body: { itemId: 999999, myAnswer: "c1" },
    });
    assert.equal(notFound.status, 404, notFound.text);
    const noAi = await http(a, "/api/learn/explain", {
      cookie: lj,
      body: { itemId: mcqId, myAnswer: "c1" },
    });
    assert.equal(noAi.status, 503, noAi.text);
    assert.match(noAi.text, /ai_not_configured/);
  });
  it("attempt covers flashcards, video, predict and language exercise spaced review", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "attemptkinds");
    const uniq = `ak_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", {
      cookie: fam.jar,
      body: { name: uniq, username: uniq, pin: "1234" },
    });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uniq, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const learnerId = Number((await db.query("select id from users where family_id=$1 and username=$2", [fam.familyId, uniq])).rows[0].id);
    const c = await db.query("insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id", [fam.familyId, `Kinds ${Date.now()}`, "kinds", fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    const vocab = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',0,$2) returning id", [lid, JSON.stringify({ prompt: "What does hola mean", kind: "vocab_card", lemma: "hola", gloss: "hello" })]);
    const vocabId = Number(vocab.rows[0].id);
    const trans = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2) returning id", [lid, JSON.stringify({ prompt: "Traduis en francais", kind: "translate", direction: "en_to_fr", expected: "Bonjour" })]);
    const transId = Number(trans.rows[0].id);
    const flash = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'flashcards',2,$2) returning id", [lid, JSON.stringify({ cards: [{ front: "Cat", back: "Katze" }, { front: "Dog", back: "Hund" }] })]);
    const flashId = Number(flash.rows[0].id);
    const video = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'video',3,$2) returning id", [lid, JSON.stringify({ title: "V", questions: [{ prompt: "Q1", choices: [{ id: "a", text: "yes" }, { id: "b", text: "no" }], answer: "a" }] })]);
    const videoId = Number(video.rows[0].id);
    const pred = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'predict',4,$2) returning id", [lid, JSON.stringify({ prompt: "What happens", reveal: "It rains" })]);
    const predId = Number(pred.rows[0].id);
    const textItem = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',5,$2) returning id", [lid, JSON.stringify({ prompt: "reflect", kind: "text", answer: "something" })]);
    const textId = Number(textItem.rows[0].id);

    const vocabAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: vocabId, questionIndex: 0, answer: "hello" } });
    assert.equal(vocabAttempt.status, 200, vocabAttempt.text);
    assert.equal(vocabAttempt.json.correct, true);
    const transAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: transId, answer: "Bonjour" } });
    assert.equal(transAttempt.status, 200, transAttempt.text);
    assert.equal(transAttempt.json.correct, true);
    assert.equal(transAttempt.json.score, 1);
    const flashAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: flashId, questionIndex: 0, answer: "correct" } });
    assert.equal(flashAttempt.status, 200, flashAttempt.text);
    const videoAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: videoId, answer: "a" } });
    assert.equal(videoAttempt.status, 200, videoAttempt.text);
    assert.equal(videoAttempt.json.correct, true);
    const predAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: predId, answer: "guess" } });
    assert.equal(predAttempt.status, 200, predAttempt.text);
    assert.ok(typeof predAttempt.json.correct === "boolean");
    const badCardIdx = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: flashId, questionIndex: 9, answer: "x" } });
    assert.equal(badCardIdx.status, 400, badCardIdx.text);
    assert.match(badCardIdx.text, /question_index_invalid/);
    const textAttempt = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: textId, answer: "anything" } });
    assert.equal(textAttempt.status, 200, textAttempt.text);
    assert.equal(textAttempt.json.correct, null);
    for (let i = 0; i < 20; i++) {
      const q = await db.query("select interval_days from review_schedule where learner_id=$1 and item_id=$2", [learnerId, vocabId]);
      if (q.rows.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const vocabSched = await db.query("select interval_days from review_schedule where learner_id=$1 and item_id=$2", [learnerId, vocabId]);
    assert.equal(Number(vocabSched.rows[0].interval_days), 1, "vocab_card feeds exercise review lane");
    const transSched = await db.query("select interval_days from review_schedule where learner_id=$1 and item_id=$2", [learnerId, transId]);
    for (let i = 0; i < 10 && !transSched.rows.length; i++) await new Promise((r) => setTimeout(r, 50));
    const transSched2 = await db.query("select interval_days from review_schedule where learner_id=$1 and item_id=$2", [learnerId, transId]);
    assert.ok(transSched2.rows.length, "translate feeds review_schedule");
    const flashSched = await db.query("select card_index from flashcard_reviews where learner_id=$1 and item_id=$2", [learnerId, flashId]);
    for (let i = 0; i < 10 && !flashSched.rows.length; i++) await new Promise((r) => setTimeout(r, 50));
    const flashSched2 = await db.query("select card_index from flashcard_reviews where learner_id=$1 and item_id=$2", [learnerId, flashId]);
    assert.ok(flashSched2.rows.length, "flashcards feed per-card table");
  });
  it("learner lesson reflections: submissions surface but draft ai_feedback never leaks", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "reflect");
    const uniq = `rf_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: uniq, username: uniq, pin: "1234" } });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uniq, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const c = await db.query("insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id", [fam.familyId, `Reflect ${Date.now()}`, "reflect", fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    const proj = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'project',0,$2) returning id", [lid, JSON.stringify({ title: "Write", prompt: "Explain." })]);
    const projId = Number(proj.rows[0].id);
    const before = await http(a, `/api/learn/lessons/${lid}`, { method: "GET", cookie: lj });
    assert.equal(before.status, 200, before.text);
    assert.ok(before.json.submissions && typeof before.json.submissions === "object");
    assert.equal(Object.keys(before.json.submissions).length, 0, before.text);
    const draft = await http(a, `/api/learn/submissions/${projId}`, { method: "PUT", cookie: lj, body: { body: "draft text", submit: false } });
    assert.equal(draft.status, 200, draft.text);
    const afterDraft = await http(a, `/api/learn/lessons/${lid}`, { method: "GET", cookie: lj });
    assert.equal(afterDraft.status, 200, afterDraft.text);
    assert.ok(afterDraft.json.submissions[String(projId)], afterDraft.text);
    const body = JSON.stringify(afterDraft.json);
    assert.ok(!body.includes("ai_feedback"), "ai_feedback leaked to learner");
  });
  it("attempt with video but no matching question is not_gradable", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "vidnograd");
    const uniq = `vn_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: uniq, username: uniq, pin: "1234" } });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uniq, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text);
    const lj = jar(lr);
    const c = await db.query("insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id", [fam.familyId, `VidNoQ ${Date.now()}`, "video", fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    const vid = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'video',0,$2) returning id", [lid, JSON.stringify({ title: "V", url: "https://example.com/v.mp4" })]);
    const vidId = Number(vid.rows[0].id);
    const noQ = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId: vidId, answer: "a" } });
    assert.equal(noQ.status, 400, noQ.text);
    assert.match(noQ.text, /not_gradable/);
  });
});
