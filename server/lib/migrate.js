// SPDX-License-Identifier: AGPL-3.0-or-later
// Tiny SQL migration runner: applies server/migrations/*.sql in name order,
// tracking applied files in _migrations. Safe to run on every boot.
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");

async function migrate({ log = console.log } = {}) {
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

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.query("begin");
    try {
      await db.query(sql);
      await db.query("insert into _migrations (name) values ($1)", [file]);
      await db.query("commit");
      ran++;
      log(`[migrate] applied ${file}`);
    } catch (err) {
      await db.query("rollback");
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
  if (!ran) log("[migrate] up to date");
  return { ran };
}

module.exports = { migrate };
