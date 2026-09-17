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

describe("flashcards per-card integration", () => {
  before(ctx.setup); after(ctx.teardown);
  it("flip two cards in one deck: only graded card due date changed", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await (async () => {
      const email = `fc_${Date.now()}@example.com`;
      const r = await http(a, "/api/auth/signup", { body: { familyName: "Fam FC", name: "Parent", email, password: "s3cur3Pass" } });
      assert.equal(r.status, 200, r.text);
      const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
      return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
    })();
    const uniq = `k_${Date.now()}`;
    const cr = await http(a, "/api/family/learners", { cookie: fam.jar, body: { name: uniq, username: uniq, pin: "1234" } });
    assert.equal(cr.status, 201, cr.text);
    const joinCode = (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code;
    const lr = await http(a, "/api/auth/learner-login", { body: { joinCode, username: uniq, pin: "1234" } });
    assert.equal(lr.status, 200, lr.text); const lj = jar(lr);
    const learnerId = Number((await db.query("select id from users where family_id=$1 and username=$2", [fam.familyId, uniq])).rows[0].id);

    const c = await db.query("insert into courses (family_id, title, topic, status, learner_id, created_by) values ($1,$2,$3,'published',null,$4) returning id", [fam.familyId, `Course ${Date.now()}`, "vocab", fam.userId]);
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [courseId, "Unit 1"]);
    const uid = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [uid, "Lesson 1"]);
    const lid = Number(ls.rows[0].id);
    const it = await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,'flashcards',0,$2) returning id", [lid, JSON.stringify({ cards: [{ front: "Cat", back: "Katze" }, { front: "Dog", back: "Hund" }] })]);
    const itemId = Number(it.rows[0].id);

    const r0 = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId, questionIndex: 0, answer: "correct" } });
    assert.equal(r0.status, 200, r0.text);
    assert.equal(r0.json.correct, true);

    // recordFlashcardAttempt is fail-open and not awaited in the route, so poll briefly
    async function waitForCards(n) {
      for (let i = 0; i < 20; i++) {
        const q = await db.query("select card_index, interval_days, due_at from flashcard_reviews where learner_id=$1 and item_id=$2 order by card_index", [learnerId, itemId]);
        if (q.rows.length === n) return q;
        await new Promise((r) => setTimeout(r, 50));
      }
      return db.query("select card_index, interval_days, due_at from flashcard_reviews where learner_id=$1 and item_id=$2 order by card_index", [learnerId, itemId]);
    }
    const row0 = await waitForCards(1);
    assert.equal(row0.rows.length, 1);
    assert.equal(Number(row0.rows[0].card_index), 0);
    assert.equal(Number(row0.rows[0].interval_days), 1);

    const r1 = await http(a, "/api/learn/attempt", { cookie: lj, body: { itemId, questionIndex: 1, answer: "again" } });
    assert.equal(r1.status, 200, r1.text);
    assert.equal(r1.json.correct, false);

    async function waitForCards2(n) {
      for (let i = 0; i < 20; i++) {
        const q = await db.query("select card_index, interval_days from flashcard_reviews where learner_id=$1 and item_id=$2 order by card_index", [learnerId, itemId]);
        if (q.rows.length === n) return q;
        await new Promise((r) => setTimeout(r, 50));
      }
      return db.query("select card_index, interval_days from flashcard_reviews where learner_id=$1 and item_id=$2 order by card_index", [learnerId, itemId]);
    }
    const rows = await waitForCards2(2);
    assert.equal(rows.rows.length, 2);
    assert.equal(Number(rows.rows[0].card_index), 0);
    assert.equal(Number(rows.rows[0].interval_days), 1);
    assert.equal(Number(rows.rows[1].card_index), 1);
    assert.equal(Number(rows.rows[1].interval_days), 0);
  });
});
