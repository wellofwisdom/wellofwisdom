// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("db driver defaults to pg", () => {
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  assert.equal(db.driver(), "pg");
});

test("db driver reports pglite when set", () => {
  process.env.DB_DRIVER = "pglite";
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  assert.equal(db.driver(), "pglite");
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
});

test("db configured: false without DATABASE_URL on pg driver", () => {
  delete process.env.DB_DRIVER;
  delete process.env.DATABASE_URL;
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  assert.equal(db.configured(), false);
});

test("db configured: true under pglite even without DATABASE_URL", async () => {
  const prevDriver = process.env.DB_DRIVER;
  const prevUrl = process.env.DATABASE_URL;
  process.env.DB_DRIVER = "pglite";
  delete process.env.DATABASE_URL;
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  assert.equal(db.configured(), true);
  const h = await db.health();
  assert.equal(h.configured, true);
  assert.equal(h.driver, "pglite");
  assert.equal(h.ok, true);
  await db.close();
  if (prevDriver != null) process.env.DB_DRIVER = prevDriver; else delete process.env.DB_DRIVER;
  if (prevUrl != null) process.env.DATABASE_URL = prevUrl; else delete process.env.DATABASE_URL;
  delete require.cache[require.resolve("./db")];
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
  process.env.DB_DRIVER = "pglite";
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  const a = await db.query("select 1 as n");
  assert.equal(a.rows[0].n, 1);
  assert.equal(a.rowCount, 1);
  const b = await db.query("select * from (values (1),(2)) as t(n) where n = $1", [1]);
  assert.equal(b.rows.length, 1);
  assert.equal(b.rowCount, 1);
  await db.close();
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
});

test("pglite runs a migration file with multiple statements", async () => {
  process.env.DB_DRIVER = "pglite";
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "001_init.sql"), "utf8");
  await db.query(sql);
  const r = await db.query("select count(*)::int as c from families");
  assert.equal(r.rows[0].c, 0);
  await db.query("insert into families (name, join_code) values ($1, $2)", ["Fam", "ABC123"]);
  const r2 = await db.query("select name from families where join_code = $1", ["ABC123"]);
  assert.equal(r2.rows[0].name, "Fam");
  await db.close();
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
});

test("pglite persists under DATA_DIR and reloads", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-"));
  process.env.DB_DRIVER = "pglite";
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve("./db")];
  const db1 = require("./db");
  await db1.query("create table if not exists t_persist (id int primary key, v text)");
  await db1.query("insert into t_persist values (1, 'hello')");
  await db1.close();
  delete require.cache[require.resolve("./db")];
  const db2 = require("./db");
  const r = await db2.query("select v from t_persist where id = 1");
  assert.equal(r.rows[0].v, "hello");
  await db2.close();
  delete process.env.DB_DRIVER;
  delete process.env.DATA_DIR;
  delete require.cache[require.resolve("./db")];
  fs.rmSync(dir, { recursive: true, force: true });
});

test("getPool throws under pglite", () => {
  process.env.DB_DRIVER = "pglite";
  delete require.cache[require.resolve("./db")];
  const db = require("./db");
  assert.throws(() => db.getPool(), /getPool not available/);
  delete process.env.DB_DRIVER;
  delete require.cache[require.resolve("./db")];
});
