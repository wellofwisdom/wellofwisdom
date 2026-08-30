// SPDX-License-Identifier: AGPL-3.0-or-later
// Postgres access. Degrades to "not configured" when DATABASE_URL is absent.
const { Pool } = require("pg");

let pool = null;

function configured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool() {
  if (!configured()) throw new Error("db_not_configured: set DATABASE_URL (see .env.example)");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}

async function query(sql, params) {
  return getPool().query(sql, params);
}

async function health() {
  if (!configured()) return { configured: false };
  try {
    await query("select 1");
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

module.exports = { query, health, configured };
