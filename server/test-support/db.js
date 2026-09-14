// SPDX-License-Identifier: AGPL-3.0-or-later
// Throwaway-schema harness for integration tests: real Postgres, no fixtures
// leaking across files.
// Each test file gets its own isolated Postgres schema, migrations run inside
// it, and the schema is dropped when the file finishes. Reads
// TEST_DATABASE_URL (never plain DATABASE_URL) so the job queue and digest
// timers on server/index.js never start when the harness is skipped, and the
// suite exits even when some other code has installed intervals.
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

let harnessPool = null;
let schemaName = null;
let activeCount = 0;

function testUrl() {
  return String(process.env.TEST_DATABASE_URL || "").trim();
}

function configured() {
  return Boolean(testUrl());
}

function getHarnessPool() {
  if (!harnessPool) harnessPool = new Pool({ connectionString: testUrl(), max: 2 });
  return harnessPool;
}

async function runMigrations(client) {
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  await client.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())"
  );
  const { rows } = await client.query("select name from _migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into _migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
}

function randomSchema(testFile) {
  const base = path.basename(testFile || "test", ".test.js").replace(/[^a-z0-9]/gi, "_").slice(0, 18).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 7);
  return `wow_test_${base}_${rand}_${Date.now().toString(36)}`.toLowerCase();
}

function prepare(testFile) {
  const baseSkip = !configured();
  const schema = baseSkip ? null : randomSchema(testFile);
  let appPool = null;
  let setupFailed = false;

  async function setup() {
    if (baseSkip) return;
    activeCount++;
    try {
      const hp = getHarnessPool();
      await hp.query(`create schema if not exists "${schema}"`);
      const client = await hp.connect();
      try {
        await client.query(`set search_path to "${schema}", public`);
        await runMigrations(client);
      } finally {
        client.release();
      }
    } catch (err) {
      setupFailed = true;
      console.log(`# skip: Postgres not reachable (${err.code || err.message})`);
      try { if (harnessPool) { await harnessPool.end(); harnessPool = null; } } catch {}
      return;
    }
    schemaName = schema;
    appPool = new Pool({ connectionString: testUrl(), max: 6 });
    try { delete require.cache[require.resolve("../lib/db")]; } catch {}
    const db = require("../lib/db");
    async function query(sql, params) {
      const conn = await appPool.connect();
      try {
        await conn.query(`set search_path to "${schema}", public`);
        return await conn.query(sql, params);
      } finally {
        conn.release();
      }
    }
    db.query = query;
    db.getPool = () => appPool;
    db.configured = () => true;
    db.health = async () => {
      try { await query("select 1"); return { configured: true, ok: true }; }
      catch (err) { return { configured: true, ok: false, error: err.message }; }
    };
    db.__testPool = appPool;
    db.__testSchema = schema;
  }

  async function teardown() {
    if (baseSkip || setupFailed) return;
    try {
      const jobs = require("../lib/jobs");
      if (jobs.stopJobs) jobs.stopJobs();
    } catch {}
    try {
      const digest = require("../lib/digest");
      if (digest.stopDigestSchedule) digest.stopDigestSchedule();
    } catch {}
    try {
      const db = require("../lib/db");
      const pool = db.__testPool || appPool;
      if (pool) {
        try { await pool.end(); } catch {}
        try { delete db.__testPool; } catch {}
        try { delete db.__testSchema; } catch {}
      }
      try { delete require.cache[require.resolve("../lib/db")]; } catch {}
      await getHarnessPool().query(`drop schema if exists "${schema}" cascade`);
    } catch {}
    schemaName = null;
    activeCount--;
    if (activeCount <= 0 && harnessPool) {
      try { await harnessPool.end(); } catch {}
      harnessPool = null;
      activeCount = 0;
    }
  }

  return { get skip() { return baseSkip || setupFailed; }, get schema() { return schemaName || schema; }, setup, teardown };
}

async function closeHarness() {
  if (harnessPool) {
    try { await harnessPool.end(); } catch {}
    harnessPool = null;
  }
}

module.exports = { configured, prepare, randomSchema, closeHarness, testUrl };
