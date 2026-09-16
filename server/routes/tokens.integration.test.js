// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);
async function app() { return require("../../server/index"); }
async function http(a, path, opts = {}) {
  const m = require("node:http"); const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) }; if (body != null) h["content-type"] = "application/json"; if (opts.cookie) h["cookie"] = opts.cookie;
  if (opts.bearer) h["authorization"] = `Bearer ${opts.bearer}`;
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
  const email = `tok_${tag}_${Date.now()}_${Math.random().toString(36).slice(2,6)}@example.com`;
  const r = await http(a, "/api/auth/signup", { body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" } });
  assert.equal(r.status, 200, r.text); const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0]); return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id), email: email.toLowerCase() };
}

describe("tokens integration", () => {
  before(ctx.setup); after(ctx.teardown);

  it("create, list, bearer auth, revoke, unknown is 401", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const fam = await signup(a, "tokA");

    // create
    const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "mcp", scopes: ["read", "courses:write"] } });
    assert.equal(cr.status, 201, cr.text);
    assert.ok(String(cr.json.token).startsWith("wow_"));
    const token = cr.json.token;
    const tid = cr.json.id;

    // list does not leak token
    const ls = await http(a, "/api/tokens", { method: "GET", cookie: fam.jar });
    assert.equal(ls.status, 200, ls.text);
    assert.ok(ls.json.tokens.some((t) => Number(t.id) === tid));
    assert.ok(!ls.text.includes(token)); // the raw token never comes back
    for (const t of ls.json.tokens) assert.ok(!("token" in t) && !("token_hash" in t));

    // a bearer token can never manage tokens: a leaked token must not be able
    // to mint a full-scope one, list hashes, or revoke its siblings
    const escList = await http(a, "/api/tokens", { method: "GET", bearer: token });
    assert.equal(escList.status, 403, escList.text);
    const escMint = await http(a, "/api/tokens", { bearer: token, body: { name: "escalate", scopes: ["read", "courses:write", "learners:read", "progress:read"] } });
    assert.equal(escMint.status, 403, escMint.text);
    const escDel = await http(a, `/api/tokens/${tid}`, { method: "DELETE", bearer: token });
    assert.equal(escDel.status, 403, escDel.text);

    // bearer auth can read
    const me = await http(a, "/api/me", { method: "GET", bearer: token });
    assert.equal(me.status, 200, me.text);
    assert.ok(me.json.user);

    // bearer with write scope can import/fetch courses
    const exBody = { format: "wellofwisdom-course", title: "Tok Import", units: [{ title: "U1", lessons: [{ title: "L1", items: [{ type: "article", content: { title: "A", body: "hello" } }] }] }] };
    const imp = await http(a, "/api/courses/import", { bearer: token, body: exBody });
    assert.equal(imp.status, 201, imp.text);

    // read-only token cannot write
    const cr2 = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "readOnly", scopes: ["read"] } });
    assert.equal(cr2.status, 201, cr2.text);
    const roTok = cr2.json.token;
    const imp2 = await http(a, "/api/courses/import", { bearer: roTok, body: exBody });
    assert.equal(imp2.status, 403, imp2.text);

    // revoke
    const del = await http(a, `/api/tokens/${tid}`, { method: "DELETE", cookie: fam.jar });
    assert.equal(del.status, 200, del.text);
    const me2 = await http(a, "/api/me", { method: "GET", bearer: token });
    assert.equal(me2.status, 401, me2.text);

    // unknown token is 401
    const fake = "wow_" + "x".repeat(43);
    const me3 = await http(a, "/api/me", { method: "GET", bearer: fake });
    assert.equal(me3.status, 401, me3.text);
  });

  it("even an instance admin's token gets 403 on /api/ai/config", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const fam = await signup(a, "tokAdmin");
    const prev = process.env.INSTANCE_ADMIN_EMAILS;
    process.env.INSTANCE_ADMIN_EMAILS = fam.email;
    try {
      // by cookie this guide really is an instance admin
      const byCookie = await http(a, "/api/ai/config", { method: "GET", cookie: fam.jar });
      assert.equal(byCookie.status, 200, byCookie.text);
      // a token with every scope still cannot read the server's AI config
      const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "admin full", scopes: ["read", "courses:write", "learners:read", "progress:read"] } });
      assert.equal(cr.status, 201, cr.text);
      const byToken = await http(a, "/api/ai/config", { method: "GET", bearer: cr.json.token });
      assert.equal(byToken.status, 403, byToken.text);
      // and the read scope cannot pull the full family export either
      const cr2 = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "admin read", scopes: ["read"] } });
      assert.equal(cr2.status, 201, cr2.text);
      const ex = await http(a, "/api/family/export", { method: "GET", bearer: cr2.json.token });
      assert.equal(ex.status, 403, ex.text);
    } finally {
      if (prev === undefined) delete process.env.INSTANCE_ADMIN_EMAILS;
      else process.env.INSTANCE_ADMIN_EMAILS = prev;
    }
  });

  it("/api/me answers the same user by cookie and by token", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "tokParity");
    // Give the guide non-default values, so the comparison has something to bite on
    await db.query(
      "update users set guide_role = 'guide', grade_level = 4, interests = ARRAY['space','code'], prefs = '{\"theme\":\"dark\"}'::jsonb where id = $1",
      [fam.userId]
    );
    const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "parity", scopes: ["read"] } });
    assert.equal(cr.status, 201, cr.text);
    const byCookie = await http(a, "/api/me", { method: "GET", cookie: fam.jar });
    const byToken = await http(a, "/api/me", { method: "GET", bearer: cr.json.token });
    assert.equal(byCookie.status, 200, byCookie.text);
    assert.equal(byToken.status, 200, byToken.text);
    // same fields, same value shapes (id included: bigint-as-string both ways)
    assert.deepEqual(byToken.json.user, byCookie.json.user);
    assert.deepEqual(byToken.json.learners, byCookie.json.learners);
    assert.equal(byToken.json.user.guideRole, "guide");
    assert.deepEqual(byToken.json.user.prefs, { theme: "dark" });
    assert.deepEqual(byToken.json.user.interests, ["space", "code"]);
    assert.equal(byToken.json.user.gradeLevel, 4);
  });

  it("learner cannot create token", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "tokLearner");
    // create learner in same family
    const { hashPin } = require("../lib/auth");
    const u = await db.query(
      `insert into users (family_id, role, name, username, pin_hash) values ($1,'learner','Kid','kidtok',$2) returning id`,
      [fam.familyId, hashPin("1234")]
    );
    const learnerJar = await (async () => {
      const r = await http(a, "/api/auth/learner-login", { body: { joinCode: (await db.query("select join_code from families where id=$1", [fam.familyId])).rows[0].join_code, username: "kidtok", pin: "1234" } });
      assert.equal(r.status, 200, r.text);
      return jar(r);
    })();
    const cr = await http(a, "/api/tokens", { cookie: learnerJar, body: { name: "bad", scopes: ["read"] } });
    assert.equal(cr.status, 403, cr.text);
  });

  it("observer cannot create a token", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "tokObserver");
    await db.query("update users set guide_role = 'observer' where id = $1", [fam.userId]);
    const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "nope", scopes: ["read"] } });
    assert.equal(cr.status, 403, cr.text);
    assert.equal(cr.json.error, "read_only");
    // management of tokens minted earlier stays possible (revoke needs it)
    const ls = await http(a, "/api/tokens", { method: "GET", cookie: fam.jar });
    assert.equal(ls.status, 200, ls.text);
  });

  it("demo family cannot create a token", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "tokDemo");
    await db.query("update families set is_demo = true where id = $1", [fam.familyId]);
    const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "nope", scopes: ["read"] } });
    assert.equal(cr.status, 403, cr.text);
    assert.equal(cr.json.error, "demo_forbidden");
    // upgrading turns is_demo off, and creation works again
    await db.query("update families set is_demo = false where id = $1", [fam.familyId]);
    const cr2 = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "after upgrade", scopes: ["read"] } });
    assert.equal(cr2.status, 201, cr2.text);
  });

  it("hash at rest, token shown once", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app(); const db = require("../lib/db");
    const fam = await signup(a, "tokHash");
    const cr = await http(a, "/api/tokens", { cookie: fam.jar, body: { name: "hashcheck", scopes: ["read"] } });
    assert.equal(cr.status, 201);
    const tok = cr.json.token;
    const row = await db.query("select token_hash from api_tokens where id=$1", [cr.json.id]);
    assert.ok(row.rows[0]);
    assert.notEqual(row.rows[0].token_hash, tok);
    assert.equal(row.rows[0].token_hash.length, 64);
  });
});
