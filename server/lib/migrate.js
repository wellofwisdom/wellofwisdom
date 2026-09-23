// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny SQL migration runner: applies server/migrations/*.sql in name order,
// tracking applied files in _migrations. Safe to run on every boot.
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");

let inFlight = null;

// Concurrent callers in one process join the run that is already going. Two
// runs would read the same _migrations snapshot and then apply the same file
// twice: the second one fails on DDL that is already there and on the primary
// key, which turns a boot into a crash for no reason.
function migrate(opts = {}) {
  if (inFlight) return inFlight;
  inFlight = runMigrations(opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runMigrations({ log = console.log } = {}) {
  if (!db.configured()) return { skipped: true, reason: "no_database_url" };
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  await db.query(
    `create table if not exists _migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`
  );
  const { rows } = await db.query("select name from _migrations");
  const applied = new Set(rows.map((r) => r.name));
  const ran = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.query("begin");
    // The file's own SQL first: a unique violation raised by the migration must
    // not be mistaken for the bookkeeping insert racing another process.
    try {
      await db.query(sql);
    } catch (err) {
      await db.query("rollback");
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
    try {
      await db.query("insert into _migrations (name) values ($1)", [file]);
      await db.query("commit");
    } catch (err) {
      await db.query("rollback");
      if (err.code === "23505") {
        // Another process applied this file between our read and our insert.
        log(`[migrate] ${file} was applied by another process`);
        continue;
      }
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
    ran.push(file);
    log(`[migrate] applied ${file}`);
  }
  if (!ran.length) log("[migrate] up to date");
  return { ran: ran.length, applied: ran };
}

module.exports = { migrate };
