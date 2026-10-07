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
            resolve({ status: res.statusCode, text: d || "", json: j, setCookie: c });
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
async function signupFamily(a, tag) {
  const db = require("../lib/db");
  const email = `tutor_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
  const r = await http(a, "/api/auth/signup", {
    body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" },
  });
  assert.equal(r.status, 200, r.text);
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
// A course with one exercise, so a thread can point at a real item.
async function seedItem(db, familyId, ownerId) {
  const c = await db.query(
    "insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id",
    [familyId, `Course ${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, "topic", ownerId]
  );
  const un = await db.query("insert into units (course_id, title, position) values ($1,'U',0) returning id", [
    Number(c.rows[0].id),
  ]);
  const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,'L',0) returning id", [
    Number(un.rows[0].id),
  ]);
  const it = await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',0,$2) returning id",
    [Number(ls.rows[0].id), JSON.stringify({ prompt: "1+1?", kind: "mcq", choices: [{ id: "a", text: "2" }], answer: "a" })]
  );
  return { lessonId: Number(ls.rows[0].id), itemId: Number(it.rows[0].id) };
}
async function learnerJar(a, fam, tag) {
  const db = require("../lib/db");
  // Max 24 chars: the route's username regex is ^[a-z0-9_.-]{2,24}$ and the
  // old Date.now() suffix (13 digits) blew past it on CI (username_invalid).
  const uname = `t_${tag}_${Math.random().toString(36).slice(2, 8)}`;
  // The learner must belong to the SAME family whose join code logs it in.
  // The first CI run failed 401 because a second signupFamily here created
  // the learner under a different family than the joinCode below belonged to.
  const cr = await http(a, "/api/family/learners", {
    cookie: fam.jar,
    body: { name: uname, username: uname, pin: "1234" },
  });
  assert.equal(cr.status, 201, cr.text);
  const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
  const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uname, pin: "1234" } });
  assert.equal(lr.status, 200, lr.text);
  return jar(lr);
}

describe("tutor threads integration", () => {
  before(ctx.setup);
  after(ctx.teardown);

  it("an item-only thread sends lessonId null and must not become lesson_id 0", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signupFamily(a, "itemonly");
    const seeded = await seedItem(db, fam.familyId, fam.userId);
    const lj = await learnerJar(a, fam, "itemonly");
    const r = await http(a, "/api/tutor/threads", {
      cookie: lj,
      body: { lessonId: null, itemId: seeded.itemId },
    });
    assert.equal(r.status, 201, r.text);
    assert.ok(r.json.threadId, "threadId in response");
    const row = await db.query("select lesson_id, item_id from tutor_threads where id=$1", [r.json.threadId]);
    assert.equal(row.rows[0].lesson_id, null, "lesson_id must stay null, not 0");
    assert.equal(Number(row.rows[0].item_id), seeded.itemId);
  });

  it("a lesson thread with itemId null must not become item_id 0", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signupFamily(a, "lessononly");
    const seeded = await seedItem(db, fam.familyId, fam.userId);
    const lj = await learnerJar(a, fam, "lessononly");
    const r = await http(a, "/api/tutor/threads", {
      cookie: lj,
      body: { lessonId: seeded.lessonId, itemId: null },
    });
    assert.equal(r.status, 201, r.text);
    const row = await db.query("select lesson_id, item_id from tutor_threads where id=$1", [r.json.threadId]);
    assert.equal(Number(row.rows[0].lesson_id), seeded.lessonId);
    assert.equal(row.rows[0].item_id, null, "item_id must stay null, not 0");
  });

  it("another family's item id is refused, not adopted as tutor context", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signupFamily(a, "scopea");
    const famB = await signupFamily(a, "scopeb");
    const bItem = await seedItem(db, famB.familyId, famB.userId);
    const lj = await learnerJar(a, famA, "scopea");
    const r = await http(a, "/api/tutor/threads", {
      cookie: lj,
      body: { lessonId: null, itemId: bItem.itemId },
    });
    assert.equal(r.status, 404, r.text);
    assert.equal(r.json.error, "item_not_found");
    const threads = await db.query("select count(*)::int as n from tutor_threads where family_id=$1", [famA.familyId]);
    assert.equal(threads.rows[0].n, 0, "no thread row for a foreign item");
  });

  it("a message on a keyless instance answers ai_not_configured, not a 500", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signupFamily(a, "keyless");
    const seeded = await seedItem(db, fam.familyId, fam.userId);
    const lj = await learnerJar(a, fam, "keyless");
    const th = await http(a, "/api/tutor/threads", {
      cookie: lj,
      body: { lessonId: null, itemId: seeded.itemId },
    });
    assert.equal(th.status, 201, th.text);
    const r = await http(a, `/api/tutor/threads/${th.json.threadId}/messages`, {
      cookie: lj,
      body: { text: "I do not know where to start" },
    });
    assert.equal(r.status, 503, r.text);
    assert.equal(r.json.error, "ai_not_configured");
  });
});
