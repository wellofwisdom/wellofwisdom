// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");
const ia = require("./instanceAdmin");

const owner = { role: "parent", guideRole: "owner", isDemo: false, email: "kevin@example.org", familyId: 1, firstRealFamilyId: 1 };

test("a demo owner is never an instance admin, whatever else is true", () => {
  assert.equal(ia.decide({ ...owner, isDemo: true }, []), false);
  assert.equal(ia.decide({ ...owner, isDemo: true }, ["kevin@example.org"]), false);
});

test("learners, guides, assistants and observers are never instance admins", () => {
  assert.equal(ia.decide({ ...owner, role: "learner" }, []), false);
  for (const guideRole of ["guide", "assistant", "observer", "typo"]) {
    assert.equal(ia.decide({ ...owner, guideRole }, []), false, guideRole);
  }
});

test("with no list, the owners of the first real family administer the server", () => {
  assert.equal(ia.decide(owner, []), true);
  assert.equal(ia.decide({ ...owner, familyId: 7 }, []), false, "a later family is not the installer");
  assert.equal(ia.decide({ ...owner, firstRealFamilyId: null }, []), false, "no real family yet means nobody");
  assert.equal(ia.decide({ ...owner, guideRole: undefined }, []), true, "a pre-roles parent counts as the owner, as in lib/auth");
});

test("with a list, only listed emails count, case and spaces ignored", () => {
  assert.equal(ia.decide(owner, ["kevin@example.org"]), true);
  assert.equal(ia.decide({ ...owner, email: " Kevin@Example.org " }, ["kevin@example.org"]), true);
  assert.equal(ia.decide({ ...owner, email: "someone@else.org" }, ["kevin@example.org"]), false);
  assert.equal(ia.decide({ ...owner, email: null }, ["kevin@example.org"]), false);
  assert.equal(ia.decide({ ...owner, familyId: 7, email: "kevin@example.org" }, ["kevin@example.org"]), true, "the list overrides first-family");
});

test("INSTANCE_ADMIN_EMAILS parses to a clean list", () => {
  const prev = process.env.INSTANCE_ADMIN_EMAILS;
  try {
    process.env.INSTANCE_ADMIN_EMAILS = " A@b.org , ,c@D.org";
    assert.deepEqual(ia.adminEmails(), ["a@b.org", "c@d.org"]);
    delete process.env.INSTANCE_ADMIN_EMAILS;
    assert.deepEqual(ia.adminEmails(), []);
  } finally {
    if (prev === undefined) delete process.env.INSTANCE_ADMIN_EMAILS; else process.env.INSTANCE_ADMIN_EMAILS = prev;
  }
});

function run(user, row) {
  const saved = { query: db.query, configured: db.configured };
  db.configured = () => true;
  db.query = async () => ({ rows: row ? [row] : [] });
  return new Promise((resolve) => {
    const req = { user };
    const res = { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
    ia.requireInstanceAdmin(req, res, () => resolve({ code: 200 }));
  }).finally(() => { db.query = saved.query; db.configured = saved.configured; });
}

test("the middleware refuses a demo visitor and lets the installer through", async () => {
  const prev = process.env.INSTANCE_ADMIN_EMAILS;
  delete process.env.INSTANCE_ADMIN_EMAILS;
  try {
    const guide = { id: 5, role: "parent", guideRole: "owner" };
    const demo = await run(guide, { email: null, family_id: 9, is_demo: true, first_real_family_id: 1 });
    assert.equal(demo.code, 403);
    assert.equal(demo.body.error, "instance_admin_only");
    const later = await run(guide, { email: "x@y.org", family_id: 4, is_demo: false, first_real_family_id: 1 });
    assert.equal(later.code, 403);
    const installer = await run(guide, { email: "x@y.org", family_id: 1, is_demo: false, first_real_family_id: 1 });
    assert.equal(installer.code, 200);
    const nobody = await run(null, null);
    assert.equal(nobody.code, 401);
  } finally {
    if (prev !== undefined) process.env.INSTANCE_ADMIN_EMAILS = prev;
  }
});

test("every server-wide settings route carries the guard", () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", "routes", f), "utf8");
  const guarded = (file, method, route) => {
    const re = new RegExp(`router\\.${method}\\("${route.replace(/\//g, "\\/")}",[^)]*requireInstanceAdmin`);
    assert.ok(re.test(src(file)), `${file} ${method.toUpperCase()} ${route} must require the instance admin`);
  };
  guarded("ai.js", "get", "/config");
  guarded("ai.js", "put", "/config");
  guarded("ai.js", "put", "/limits");
  guarded("mail.js", "get", "/config");
  guarded("mail.js", "put", "/config");
  guarded("mail.js", "post", "/test");
  guarded("media.js", "get", "/config");
  guarded("media.js", "put", "/config");
  guarded("waitlist.js", "get", "/");
});

test("no route writes server_settings without the guard in the same handler file", () => {
  const dir = path.join(__dirname, "..", "routes");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js") && !n.endsWith(".test.js"))) {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    if (/insert into server_settings/.test(s)) {
      assert.ok(s.includes("requireInstanceAdmin"), `${f} writes server_settings but never checks the instance admin`);
    }
  }
});
