// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function freshDb() {
  delete require.cache[require.resolve("./db")];
  return require("./db");
}

// Each pglite test opens its own temp dir so nothing leaks between tests.
function pgliteEnv(dir) {
  const prev = { DB_DRIVER: process.env.DB_DRIVER, DATA_DIR: process.env.DATA_DIR, DATABASE_URL: process.env.DATABASE_URL };
  process.env.DB_DRIVER = "pglite";
  delete process.env.DATABASE_URL;
  if (dir) process.env.DATA_DIR = dir;
  else delete process.env.DATA_DIR;
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v != null) process.env[k] = v;
      else delete process.env[k];
    }
    delete require.cache[require.resolve("./db")];
    delete require.cache[require.resolve("./migrate")];
  };
}

test("db driver defaults to pg", () => {
  delete process.env.DB_DRIVER;
  const db = freshDb();
  assert.equal(db.driver(), "pg");
});

test("db driver reports pglite when set", () => {
  process.env.DB_DRIVER = "pglite";
  const db = freshDb();
  assert.equal(db.driver(), "pglite");
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
});

test("db configured: false without DATABASE_URL on pg driver", () => {
  delete process.env.DB_DRIVER;
  delete process.env.DATABASE_URL;
  const db = freshDb();
  assert.equal(db.configured(), false);
});

test("db configured: true under pglite even without DATABASE_URL", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  assert.equal(db.configured(), true);
  const h = await db.health();
  assert.equal(h.configured, true);
  assert.equal(h.driver, "pglite");
  assert.equal(h.ok, true);
  await db.close();
  restore();
});

test("db health without DATABASE_URL reports pg and not configured", async () => {
  delete process.env.DB_DRIVER;
  delete process.env.DATABASE_URL;
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  const h = await db.health();
  assert.equal(h.configured, false);
  assert.equal(h.driver, "pg");
});

test("pglite query keeps pg shape: rows and rowCount", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  const a = await db.query("select 1 as n");
  assert.equal(a.rows[0].n, 1);
  assert.equal(a.rowCount, 1);
  const b = await db.query("select * from (values (1),(2)) as t(n) where n = $1", [1]);
  assert.equal(b.rows.length, 1);
  assert.equal(b.rowCount, 1);
  await db.close();
  restore();
});

test("pglite runs a migration file with multiple statements", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "001_init.sql"), "utf8");
  await db.query(sql);
  const r = await db.query("select count(*)::int as c from families");
  assert.equal(r.rows[0].c, 0);
  await db.query("insert into families (name, join_code) values ($1, $2)", ["Fam", "ABC123"]);
  const r2 = await db.query("select name from families where join_code = $1", ["ABC123"]);
  assert.equal(r2.rows[0].name, "Fam");
  await db.close();
  restore();
});

test("pglite persists under DATA_DIR and reloads", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-"));
  const restore = pgliteEnv(dir);
  const db1 = freshDb();
  const h1 = await db1.health();
  assert.equal(h1.persistent, true, "a DATA_DIR means the database is on disk");
  assert.equal(h1.dataDir, path.join(dir, "pglite"), "health says where it lives");
  await db1.query("create table if not exists t_persist (id int primary key, v text)");
  await db1.query("insert into t_persist values (1, 'hello')");
  await db1.close();
  const db2 = freshDb();
  const r = await db2.query("select v from t_persist where id = 1");
  assert.equal(r.rows[0].v, "hello");
  await db2.close();
  restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("health says so when there is no DATA_DIR, because memory means no persistence", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  const mem = await db.health();
  assert.equal(mem.persistent, false, "no DATA_DIR means an in-memory database");
  assert.equal(mem.dataDir, null);
  await db.close();
  restore();
});

test("running in memory warns once and says what it costs", async () => {
  const restore = pgliteEnv(null);
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const db = freshDb();
    await db.query("select 1");
    await db.query("select 2");
    assert.equal(warnings.length, 1, "one warning, not one per query");
    assert.match(warnings[0], /in memory/);
    assert.match(warnings[0], /DATA_DIR/);
    await db.close();
  } finally {
    console.warn = origWarn;
    restore();
  }
});

test("a failed open names DATA_DIR and does not poison later queries", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-bad-"));
  const blocker = path.join(dir, "pglite");
  fs.writeFileSync(blocker, "not a directory");
  const restore = pgliteEnv(dir);
  try {
    const db = freshDb();
    await assert.rejects(() => db.query("select 1"), (err) => {
      assert.match(err.message, /pglite_open_failed/);
      assert.match(err.message, /DATA_DIR/);
      return true;
    });
    fs.rmSync(blocker, { force: true });
    const r = await db.query("select 1 as ok");
    assert.equal(r.rows[0].ok, 1, "the same module opens the database after the cause is fixed");
    await db.close();
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("getPool under pglite checks out the one connection, one caller at a time", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  await db.query("create table lease (v text)");
  const pool = db.getPool();
  assert.equal(pool.driver, "pglite");

  const order = [];
  const client = await pool.connect();
  await client.query("begin");
  await client.query("insert into lease values ('held')");
  const waited = db.query("select count(*)::int as c from lease").then((r) => {
    order.push("query");
    return r;
  });
  await new Promise((r) => setTimeout(r, 100));
  order.push("release");
  await client.query("rollback");
  client.release();

  assert.deepEqual(order, ["release"], "a plain query waits for the lease instead of joining the transaction");
  const after = await waited;
  assert.deepEqual(order, ["release", "query"], "it runs once the lease is back");
  assert.equal(after.rows[0].c, 0, "the transaction rolled back cleanly");
  await db.close();
  restore();
});

test("every query queued behind a lease gets a turn, not only the first", async () => {
  const restore = pgliteEnv(null);
  process.env.PGLITE_ACQUIRE_TIMEOUT_MS = "2000";
  try {
    const db = freshDb();
    await db.query("create table queue (v int)");
    const client = await db.getPool().connect();
    await client.query("begin");
    await client.query("insert into queue values (1)");
    const queued = [1, 2, 3].map(() => db.query("select count(*)::int as c from queue"));
    await new Promise((r) => setTimeout(r, 50));
    await client.query("commit");
    client.release();
    const results = await Promise.all(queued);
    assert.equal(results.length, 3);
    for (const r of results) assert.equal(r.rows[0].c, 1, "each queued query ran on its own turn");
    await db.close();
  } finally {
    delete process.env.PGLITE_ACQUIRE_TIMEOUT_MS;
    restore();
  }
});

test("an unreleased checkout fails fast with pglite_busy instead of hanging", async () => {
  const restore = pgliteEnv(null);
  process.env.PGLITE_ACQUIRE_TIMEOUT_MS = "150";
  try {
    const db = freshDb();
    const client = await db.getPool().connect();
    await assert.rejects(() => db.query("select 1"), (err) => {
      assert.equal(err.code, "pglite_busy");
      assert.match(err.message, /never released|inside a transaction/);
      return true;
    });
    client.release();
    const r = await db.query("select 1 as ok");
    assert.equal(r.rows[0].ok, 1, "releasing the lease lets the next query through");
    await db.close();
  } finally {
    delete process.env.PGLITE_ACQUIRE_TIMEOUT_MS;
    restore();
  }
});

test("transaction commits, rolls back, and nests with a savepoint", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  await db.query("create table txlog (v text)");

  await db.transaction(async (q) => {
    await q.query("insert into txlog values ('committed')");
  });
  await assert.rejects(
    () =>
      db.transaction(async (q) => {
        await q.query("insert into txlog values ('rolled-back')");
        throw new Error("boom");
      }),
    /boom/
  );
  const rows = await db.query("select v from txlog order by v");
  assert.deepEqual(rows.rows.map((r) => r.v), ["committed"], "the failed transaction left nothing behind");

  await db.transaction(async (q) => {
    await q.query("insert into txlog values ('outer')");
    await assert.rejects(
      () =>
        db.transaction(async (q2) => {
          await q2.query("insert into txlog values ('inner')");
          throw new Error("inner");
        }),
      /inner/
    );
    await q.query("insert into txlog values ('outer-2')");
  });
  const rows2 = await db.query("select v from txlog where v like 'outer%' order by v");
  assert.deepEqual(rows2.rows.map((r) => r.v), ["outer", "outer-2"], "the inner failure did not take the outer work with it");

  await db.close();
  restore();
});

test("db.query inside transaction runs on that transaction, not beside it", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  await db.query("create table innerq (v text)");
  const seen = await db.transaction(async () => {
    await db.query("insert into innerq values ('routed')");
    const r = await db.query("select count(*)::int as c from innerq");
    return r.rows[0].c;
  });
  assert.equal(seen, 1, "the uncommitted row is visible inside its own transaction");
  const after = await db.query("select count(*)::int as c from innerq");
  assert.equal(after.rows[0].c, 1, "and committed with it");
  await db.close();
  restore();
});

test("close rejects a query that is still waiting for the connection", async () => {
  const restore = pgliteEnv(null);
  const db = freshDb();
  const client = await db.getPool().connect();
  let caught = null;
  const waiting = db.query("select 1").catch((err) => {
    caught = err;
  });
  await new Promise((r) => setTimeout(r, 30));
  await db.close();
  await waiting;
  assert.equal(caught && caught.code, "pglite_closed");
  client.release();
  restore();
});

test("migrate at boot applies each file once, and a second concurrent call joins the run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-migrate-"));
  const restore = pgliteEnv(dir);
  try {
    const db = freshDb();
    delete require.cache[require.resolve("./migrate")];
    const { migrate } = require("./migrate");
    const first = migrate({ log() {} });
    const second = migrate({ log() {} });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ran > 0, true, "a fresh database gets every migration");
    assert.equal(a.applied.length, a.ran);
    assert.deepEqual(b, a, "the concurrent call joins the run in flight");
    const again = await migrate({ log() {} });
    assert.equal(again.ran, 0, "a second boot has nothing to do");
    assert.deepEqual(again.applied, []);
    await db.close();
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("first run: under PGlite an empty database has no families and makes the first owner the instance admin", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-first-"));
  const restore = pgliteEnv(dir);
  delete require.cache[require.resolve("./instanceAdmin")];
  try {
    const db = freshDb();
    const { migrate } = require("./migrate");
    const ia = require("./instanceAdmin");
    await migrate({ log() {} });
    const before = await db.query("select count(*)::int as c from families");
    assert.equal(before.rows[0].c, 0, "fresh PGlite has no families");
    assert.equal(ia.decide({ role: "parent", guideRole: "owner", isDemo: false, email: "a@example.org", familyId: 1, firstRealFamilyId: null }, []), false, "nobody is admin before the first family exists");
    const fam = await db.query("insert into families (name, join_code) values ($1,$2) returning id", ["First Family", "AAAAAA"]);
    const familyId = fam.rows[0].id;
    const user = await db.query("insert into users (family_id, role, name, email, password_hash) values ($1,'parent',$2,$3,$4) returning id", [familyId, "Alex", "a@example.org", "hash"]);
    const userId = user.rows[0].id;
    const isAdmin = await ia.isInstanceAdmin({ id: userId, role: "parent", guideRole: "owner" });
    assert.equal(isAdmin, true, "the owner of the first real family is the instance admin under PGlite");
    await db.close();
  } finally {
    restore();
    delete require.cache[require.resolve("./instanceAdmin")];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
