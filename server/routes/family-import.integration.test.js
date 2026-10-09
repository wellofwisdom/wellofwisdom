// SPDX-License-Identifier: AGPL-3.0-or-later
// Family import round trip: export a seeded family, import into a second
// family (dry run, then confirm), re-import to prove duplicates skip, and
// reject foreign shapes. Runs against a real database when TEST_DATABASE_URL
// is set (CI); skips otherwise, like every integration test here.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

// Uploads must land in a scratch dir, never the repo's data/. Set before any
// require: lib/storage resolves LOCAL_ROOT from the env at require time.
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wow-import-uploads-"));

const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);

async function app() { return require("../../server/index"); }

const auth = require("../lib/auth"); // hashPin only, no db touched at require time

function httpRaw(a, method, reqPath, opts = {}) {
  const m = require("node:http");
  const h = { ...(opts.headers || {}) };
  if (opts.cookie) h.cookie = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a);
    s.listen(0, () => {
      const { port } = s.address();
      const req = m.request({ method, host: "127.0.0.1", port, path: reqPath, headers: h }, (res) => {
        const chunks = [];
        res.on("data", (x) => chunks.push(x));
        res.on("end", () => { s.close(); resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }); });
      });
      req.on("error", (e) => { s.close(); reject(e); });
      req.end();
    });
  });
}

async function http(a, reqPath, opts = {}) {
  const m = require("node:http");
  const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) };
  if (body != null) h["content-type"] = "application/json";
  if (opts.cookie) h.cookie = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a);
    s.listen(0, () => {
      const { port } = s.address();
      const req = m.request({ method: opts.method || "POST", host: "127.0.0.1", port, path: reqPath, headers: h }, (res) => {
        let d = "";
        res.on("data", (x) => { d += x; });
        res.on("end", () => {
          s.close();
          let j = null;
          try { j = JSON.parse(d || ""); } catch {}
          const sc = res.headers["set-cookie"] || [];
          const c = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []);
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

async function signup(a, tag) {
  const email = `famimp_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Import ${tag}`, name: "Parent " + tag, email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}

async function seedFamily(a, tag) {
  const fam = await signup(a, tag);
  const db = require("../lib/db");
  const fid = fam.familyId;

  const learner = await db.query(
    "insert into users (family_id, role, name, username, pin_hash, grade_level, prefs) values ($1,'learner','Maya Read','maya',$2,3,'{}') returning id",
    [fid, auth.hashPin("1234")]
  );
  const learnerId = Number(learner.rows[0].id);

  const course = await db.query(
    "insert into courses (family_id, title, topic, status, created_by) values ($1,'Space course','space','draft',$2) returning id",
    [fid, fam.userId]
  );
  const courseId = Number(course.rows[0].id);
  const unit = await db.query("insert into units (course_id, title, position) values ($1,'Unit 1',0) returning id", [courseId]);
  const lesson = await db.query("insert into lessons (unit_id, title, position) values ($1,'Lesson 1',0) returning id", [Number(unit.rows[0].id)]);
  const lessonId = Number(lesson.rows[0].id);
  const item1 = await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2) returning id",
    [lessonId, JSON.stringify({ title: "Intro", body: "Hello world" })]
  );
  const item2 = await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2) returning id",
    [lessonId, JSON.stringify({ prompt: "What is 2+2?", kind: "mcq", choices: [{ id: "c1", text: "3" }, { id: "c2", text: "4" }], answer: "c2", explanation: "Because", hint: "Think" })]
  );

  const storage = require("../lib/storage");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3, 4]);
  const put = await storage.put(fid, "image/png", png);
  await db.query(
    "insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, is_public, created_by) values ($1,'image','image/png',$2,$3,'diagram.png','Diagram',false,$4)",
    [fid, png.length, put.key, fam.userId]
  );

  const plan = await db.query(
    "insert into term_plans (family_id, title, subject, start_date, end_date, created_by) values ($1,'Fall term','Science','2026-09-01','2026-12-18',$2) returning id",
    [fid, fam.userId]
  );
  const planId = Number(plan.rows[0].id);
  await db.query("insert into plan_enrollments (plan_id, learner_id) values ($1,$2)", [planId, learnerId]);
  await db.query("insert into plan_milestones (plan_id, title, position, course_id) values ($1,'First moon',0,$2)", [planId, courseId]);
  await db.query("insert into events (family_id, title, on_date, kind, plan_id, created_by) values ($1,'Field trip','2026-10-01','field_trip',$2,$3)", [fid, planId, fam.userId]);
  await db.query("insert into workspace_pages (family_id, title, body, created_by) values ($1,'Reading list','Books to finish',$2)", [fid, fam.userId]);
  await db.query("insert into resources (family_id, title, type, plan_id, created_by) values ($1,'Museum','place',$2,$3)", [fid, planId, fam.userId]);
  await db.query("insert into reports (family_id, learner_id, period_start, period_end, title, created_by) values ($1,$2,'2026-09-01','2026-09-30','September',$3)", [fid, learnerId, fam.userId]);
  await db.query("insert into attendance_days (family_id, learner_id, day, minutes, created_by) values ($1,$2,'2026-09-02',120,$3)", [fid, learnerId, fam.userId]);
  await db.query("insert into assessments (family_id, learner_id, taken_on, title, created_by) values ($1,$2,'2026-09-20','Unit test',$3)", [fid, learnerId, fam.userId]);
  await db.query("insert into badges (family_id, learner_id, badge) values ($1,$2,'first_lesson')", [fid, learnerId]);

  const thread = await db.query("insert into tutor_threads (family_id, learner_id, title) values ($1,$2,'Why is the sky blue') returning id", [fid, learnerId]);
  await db.query("insert into tutor_messages (thread_id, role, content) values ($1,'learner','why?')", [Number(thread.rows[0].id)]);
  await db.query("insert into tutor_messages (thread_id, role, content) values ($1,'tutor','let us think')", [Number(thread.rows[0].id)]);

  await db.query("insert into attempts (family_id, learner_id, item_id, correct, answer) values ($1,$2,$3,true,$4)", [fid, learnerId, Number(item2.rows[0].id), JSON.stringify("c2")]);
  await db.query("insert into lesson_completions (family_id, learner_id, course_id, lesson_id) values ($1,$2,$3,$4)", [fid, learnerId, courseId, lessonId]);
  await db.query("insert into review_schedule (family_id, learner_id, item_id) values ($1,$2,$3)", [fid, learnerId, Number(item1.rows[0].id)]);

  return fam;
}

async function counts(familyId) {
  const db = require("../lib/db");
  const one = (sql) => db.query(sql, [familyId]).then((r) => Number(r.rows[0].n));
  const keys = [
    ["learners", "select count(*)::int as n from users where family_id=$1 and role='learner'"],
    ["courses", "select count(*)::int as n from courses where family_id=$1"],
    ["uploads", "select count(*)::int as n from uploads where family_id=$1"],
    ["plans", "select count(*)::int as n from term_plans where family_id=$1"],
    ["enrollments", "select count(*)::int as n from plan_enrollments e join term_plans p on p.id=e.plan_id where p.family_id=$1"],
    ["milestones", "select count(*)::int as n from plan_milestones m join term_plans p on p.id=m.plan_id where p.family_id=$1"],
    ["events", "select count(*)::int as n from events where family_id=$1"],
    ["notes", "select count(*)::int as n from workspace_pages where family_id=$1"],
    ["resources", "select count(*)::int as n from resources where family_id=$1"],
    ["reports", "select count(*)::int as n from reports where family_id=$1"],
    ["attendance", "select count(*)::int as n from attendance_days where family_id=$1"],
    ["assessments", "select count(*)::int as n from assessments where family_id=$1"],
    ["badges", "select count(*)::int as n from badges where family_id=$1"],
    ["threads", "select count(*)::int as n from tutor_threads where family_id=$1"],
    ["messages", "select count(*)::int as n from tutor_messages t join tutor_threads h on h.id=t.thread_id where h.family_id=$1"],
    ["attempts", "select count(*)::int as n from attempts where family_id=$1"],
    ["completions", "select count(*)::int as n from lesson_completions where family_id=$1"],
    ["reviews", "select count(*)::int as n from review_schedule where family_id=$1"],
  ];
  const out = {};
  await Promise.all(keys.map(async ([k, sql]) => { out[k] = await one(sql); }));
  return out;
}

function section(rep, key) { return rep.sections.find((s) => s.key === key); }

describe("family import integration", () => {
  before(ctx.setup);
  after(ctx.teardown);

  it("round trip: export family A, dry run + confirm into family B, duplicates skip", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const storage = require("../lib/storage");
    const famA = await seedFamily(a, "A");
    const famB = await signup(a, "B");
    const famC = await signup(a, "C");

    // Export A (owner only, binary zip).
    const exp = await httpRaw(a, "GET", "/api/family/export", { cookie: famA.jar });
    assert.equal(exp.status, 200, `export failed: ${exp.status}`);
    assert.match(String(exp.headers["content-type"] || ""), /zip/);
    assert.ok(exp.buffer.length > 200, "export zip suspiciously small");

    // Dry run into B: counts reported, nothing written.
    const dry = await http(a, "/api/family/import", { body: { zip: exp.buffer.toString("base64") }, cookie: famB.jar });
    assert.equal(dry.status, 200, dry.text);
    assert.equal(dry.json.dryRun, true);
    assert.equal(section(dry.json, "learners").create, 1);
    assert.equal(section(dry.json, "courses").create, 1);
    assert.equal(section(dry.json, "uploads").create, 1);
    assert.equal(section(dry.json, "plans").create, 1);
    assert.equal(section(dry.json, "attempts").skipOther, 1, "work history is reported, not guessed");
    const emptyB = await counts(famB.familyId);
    assert.equal(Object.values(emptyB).some((n) => n > 0), false, "dry run wrote rows");

    // Confirm: everything lands in B.
    const imp = await http(a, "/api/family/import", { body: { zip: exp.buffer.toString("base64"), confirm: true }, cookie: famB.jar });
    assert.equal(imp.status, 200, imp.text);
    assert.equal(imp.json.ok, true, JSON.stringify(imp.json.sections?.filter((s) => s.error)));
    const expectCreate = { learners: 1, courses: 1, uploads: 1, plans: 1, planEnrollments: 1, planMilestones: 1, events: 1, notes: 1, resources: 1, reports: 1, attendance: 1, assessments: 1, badges: 1, tutorThreads: 1, tutorMessages: 2 };
    for (const [key, n] of Object.entries(expectCreate)) {
      assert.equal(section(imp.json, key).create, n, `${key}: expected ${n} created`);
    }
    const pins = imp.json.learners || [];
    assert.equal(pins.length, 1);
    assert.match(pins[0].pin, /^\d{4}$/);

    const afterB = await counts(famB.familyId);
    assert.equal(afterB.learners, 1);
    assert.equal(afterB.courses, 1);
    assert.equal(afterB.uploads, 1);
    assert.equal(afterB.plans, 1);
    assert.equal(afterB.enrollments, 1);
    assert.equal(afterB.milestones, 1);
    assert.equal(afterB.events, 1);
    assert.equal(afterB.notes, 1);
    assert.equal(afterB.resources, 1);
    assert.equal(afterB.reports, 1);
    assert.equal(afterB.attendance, 1);
    assert.equal(afterB.assessments, 1);
    assert.equal(afterB.badges, 1);
    assert.equal(afterB.threads, 1);
    assert.equal(afterB.messages, 2);
    assert.equal(afterB.attempts, 0, "attempt history is not restorable and lands nowhere");
    assert.equal(afterB.completions, 0);
    assert.equal(afterB.reviews, 0);

    // The restored course carries its content.
    const db = require("../lib/db");
    const bCourse = (await db.query("select id from courses where family_id=$1", [famB.familyId])).rows[0];
    const itemN = await db.query(
      "select count(*)::int as n from lesson_items i join lessons l on l.id=i.lesson_id join units u on u.id=l.unit_id where u.course_id=$1",
      [Number(bCourse.id)]
    );
    assert.equal(Number(itemN.rows[0].n), 2);

    // Remapped references point inside B: milestone course and resource plan.
    const mile = await db.query(
      "select m.course_id from plan_milestones m join term_plans p on p.id=m.plan_id where p.family_id=$1",
      [famB.familyId]
    );
    assert.equal(Number(mile.rows[0].course_id), Number(bCourse.id));
    const bPlan = (await db.query("select id from term_plans where family_id=$1", [famB.familyId])).rows[0];
    const res = await db.query("select plan_id from resources where family_id=$1", [famB.familyId]);
    assert.equal(Number(res.rows[0].plan_id), Number(bPlan.id));

    // The restored upload's bytes exist under a fresh key.
    const bUp = (await db.query("select storage_key, bytes from uploads where family_id=$1", [famB.familyId])).rows[0];
    assert.equal(Number(bUp.bytes), 12);
    assert.equal(await storage.exists(bUp.storage_key), true);

    // The restored learner can actually sign in with the returned PIN.
    const famInfo = await http(a, "/api/family", { method: "GET", cookie: famB.jar });
    const login = await http(a, "/api/auth/learner-login", {
      body: { joinCode: famInfo.json.family.join_code, username: "maya", pin: pins[0].pin },
    });
    assert.equal(login.status, 200, login.text);

    // Second import of the same zip: everything reports as already here.
    const again = await http(a, "/api/family/import", { body: { zip: exp.buffer.toString("base64"), confirm: true }, cookie: famB.jar });
    assert.equal(again.status, 200, again.text);
    assert.equal(again.json.totalCreated, 0, "a second import must not duplicate rows");
    for (const key of Object.keys(expectCreate)) {
      assert.equal(section(again.json, key).skipDuplicate >= 0, true);
      assert.equal(section(again.json, key).create, 0, `${key} should not create again`);
    }
    assert.equal(section(again.json, "tutorThreads").skipDuplicate, 1, "threads dedupe across renumbered learners");
    const againB = await counts(famB.familyId);
    assert.deepEqual(againB, afterB, "no row counts moved on the second import");

    // Family A is untouched, family C never touched.
    const afterA = await counts(famA.familyId);
    assert.equal(afterA.learners, 1);
    assert.equal(afterA.courses, 1);
    const afterC = await counts(famC.familyId);
    assert.equal(Object.values(afterC).some((n) => n > 0), false);
  });

  it("rejects foreign shapes before writing anything", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const fam = await signup(a, "shape");
    const famCounts = await counts(fam.familyId);

    const notZip = await http(a, "/api/family/import", { body: { zip: Buffer.from("definitely not a zip").toString("base64") }, cookie: fam.jar });
    assert.equal(notZip.status, 400);
    assert.equal(notZip.json.error, "zip_invalid");

    // A zip whose family.json is not an export manifest.
    const { ZipArchive } = require("archiver");
    const chunks = [];
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("data", (c) => chunks.push(c));
    const done = new Promise((r) => archive.on("end", r));
    archive.append(JSON.stringify({ hello: "world" }), { name: "family.json" });
    archive.finalize();
    await done;
    const foreign = await http(a, "/api/family/import", { body: { zip: Buffer.concat(chunks).toString("base64") }, cookie: fam.jar });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.json.error, "shape_invalid");
    assert.ok(Array.isArray(foreign.json.problems) && foreign.json.problems.length > 0);

    const after = await counts(fam.familyId);
    assert.deepEqual(after, famCounts, "rejected imports must not write");
  });

  it("requires an owner session", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const anon = await http(a, "/api/family/import", { body: { zip: "AAAA" } });
    assert.equal(anon.status, 401);
  });
});
