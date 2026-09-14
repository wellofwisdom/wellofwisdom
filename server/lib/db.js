// SPDX-License-Identifier: AGPL-3.0-or-later
// Postgres access. Two drivers behind the same interface.
//   DB_DRIVER=pg      Postgres via DATABASE_URL (default, existing behaviour)
//   DB_DRIVER=pglite  Embedded PGlite, persisted under DATA_DIR/pglite
// Degrades to "not configured" only when neither driver is active.
// query(sql, params) keeps the exact pg shape: { rows, rowCount }.
const fs = require("node:fs");
const path = require("node:path");

let pool = null;
let pglite = null;
let pgliteReady = null;

function driver() {
  const v = String(process.env.DB_DRIVER || "").trim().toLowerCase();
  return v === "pglite" ? "pglite" : "pg";
}

function pgliteDir() {
  const raw = String(process.env.DATA_DIR || "").trim();
  if (!raw) return null;
  return path.join(raw, "pglite");
}

async function getPGlite() {
  if (pglite) {
    if (pgliteReady) await pgliteReady;
    return pglite;
  }
  let PGlite;
  try {
    PGlite = require("@electric-sql/pglite").PGlite;
  } catch (err) {
    throw new Error("pglite_not_installed: run npm install @electric-sql/pglite");
  }
  const dir = pgliteDir();
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const inst = dir ? new PGlite(dir) : new PGlite();
  pglite = inst;
  pgliteReady = inst.waitReady || Promise.resolve();
  await pgliteReady;
  return pglite;
}

function configured() {
  if (driver() === "pglite") return true;
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool() {
  if (driver() === "pglite") throw new Error("getPool not available under pglite driver");
  if (!configured()) throw new Error("db_not_configured: set DATABASE_URL (see .env.example)");
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

async function query(sql, params) {
  if (driver() === "pglite") {
    const pg = await getPGlite();
    const hasParams = params != null && params.length > 0;
    if (hasParams) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount != null ? r.rowCount : (r.affectedRows || r.rows.length) };
    }
    const s = String(sql || "").trim().toLowerCase();
    const isControl = s === "begin" || s === "commit" || s === "rollback";
    if (isControl) {
      const r = await pg.exec(sql);
      const last = Array.isArray(r) && r.length ? r[r.length - 1] : null;
      if (last && Array.isArray(last.rows)) return { rows: last.rows, rowCount: last.rowCount != null ? last.rowCount : last.affectedRows || 0 };
      return { rows: [], rowCount: 0 };
    }
    const looksMulti = String(sql).includes(";");
    if (looksMulti) {
      try {
        const results = await pg.exec(sql);
        const last = Array.isArray(results) && results.length ? results[results.length - 1] : null;
        if (last && Array.isArray(last.rows)) {
          return { rows: last.rows, rowCount: last.rowCount != null ? last.rowCount : (last.affectedRows || last.rows.length) };
        }
        return { rows: [], rowCount: 0 };
      } catch (err) {
        throw err;
      }
    }
    const r = await pg.query(sql);
    return { rows: r.rows, rowCount: r.rowCount != null ? r.rowCount : (r.affectedRows || r.rows.length) };
  }
  return getPool().query(sql, params);
}

async function health() {
  const d = driver();
  if (d === "pglite") {
    try {
      const pg = await getPGlite();
      await pg.query("select 1");
      return { configured: true, ok: true, driver: "pglite" };
    } catch (err) {
      return { configured: true, ok: false, driver: "pglite", error: err.message };
    }
  }
  if (!configured()) return { configured: false, driver: "pg" };
  try {
    await query("select 1");
    return { configured: true, ok: true, driver: "pg" };
  } catch (err) {
    return { configured: true, ok: false, driver: "pg", error: err.message };
  }
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
  if (pglite) {
    const pg = pglite;
    pglite = null;
    pgliteReady = null;
    try { await pg.close(); } catch {}
  }
}

module.exports = { query, health, configured, getPool, driver, close, getPGlite };
