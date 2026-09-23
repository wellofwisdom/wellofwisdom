// SPDX-License-Identifier: AGPL-3.0-or-later
// Postgres access. Two drivers behind the same interface.
//   DB_DRIVER=pg      Postgres via DATABASE_URL (default, existing behaviour)
//   DB_DRIVER=pglite  Embedded PGlite, persisted under DATA_DIR/pglite
// Degrades to "not configured" only when neither driver is active.
// query(sql, params) keeps the exact pg shape: { rows, rowCount }.
//
// PGlite is a single connection and can hold one transaction at a time. Two
// callers that both send begin/commit would commit or discard each other's
// work, and a plain query sent mid-transaction would land inside it. Under the
// pg driver the pool gives callers that isolation for free; here it comes from
// a checkout lease on the one connection:
//   getPool().connect()  takes the connection until release() is called
//   transaction(fn)      the same, and q.query inside fn runs on that
//                        connection, so a nested transaction() scopes itself
//                        with a savepoint instead of a second begin
//   query()              waits while someone holds the lease, so it can never
//                        join another caller's transaction
// A waiter gives up after PGLITE_ACQUIRE_TIMEOUT_MS (default 30000) with a
// pglite_busy error instead of hanging forever on an unreleased checkout.
//
// PGlite in memory when DATA_DIR is unset: it works, but every restart starts
// from an empty database. health() reports persistent: false in that mode and
// the first open warns once.
const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30000;

let pool = null;
let pglite = null;
let pgliteReady = null;
let warnedInMemory = false;
let savepointSeq = 0;

// Single connection lease for the pglite driver.
let lease = null; // { refs } while the connection is checked out
const waiters = []; // queued waiters for the connection
const txContext = new AsyncLocalStorage();

function driver() {
  const v = String(process.env.DB_DRIVER || "").trim().toLowerCase();
  return v === "pglite" ? "pglite" : "pg";
}

function pgliteDir() {
  const raw = String(process.env.DATA_DIR || "").trim();
  if (!raw) return null;
  return path.join(raw, "pglite");
}

function acquireTimeoutMs() {
  const raw = Number(process.env.PGLITE_ACQUIRE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ACQUIRE_TIMEOUT_MS;
}

function busyError(ms) {
  const err = new Error(
    `pglite_busy: the embedded connection stayed checked out for ${ms}ms. ` +
      "Another caller is inside a transaction, or a checkout was never released. " +
      "Inside a transaction use the client you checked out, or db.transaction(fn)."
  );
  err.code = "pglite_busy";
  return err;
}

function closedError() {
  const err = new Error("pglite_closed: the database was closed while this query waited for the connection");
  err.code = "pglite_closed";
  return err;
}

function wakeNext() {
  const next = waiters.shift();
  if (!next) return;
  clearTimeout(next.timer);
  next.resolve();
}

function waitForConnection(ms) {
  return new Promise((resolve, reject) => {
    const entry = { resolve, reject, timer: null };
    // Deliberately not unref'd: a waiter must always get its error or its turn,
    // even when nothing else is keeping the process alive.
    entry.timer = setTimeout(() => {
      const i = waiters.indexOf(entry);
      if (i >= 0) waiters.splice(i, 1);
      reject(busyError(ms));
    }, ms);
    waiters.push(entry);
  });
}

async function awaitConnection() {
  if (!lease) return;
  const ms = acquireTimeoutMs();
  const deadline = Date.now() + ms;
  while (lease) {
    const left = deadline - Date.now();
    if (left <= 0) throw busyError(ms);
    await waitForConnection(left);
  }
}

async function acquireConnection() {
  await awaitConnection();
  lease = { refs: 1 };
  return lease;
}

function releaseConnection(l) {
  if (!l || l.refs <= 0) return;
  l.refs -= 1;
  if (l.refs > 0) return;
  if (lease === l) lease = null;
  wakeNext();
}

async function openPGlite() {
  let PGlite;
  try {
    PGlite = require("@electric-sql/pglite").PGlite;
  } catch (err) {
    throw new Error("pglite_not_installed: run npm install @electric-sql/pglite");
  }
  const dir = pgliteDir();
  if (!dir && !warnedInMemory) {
    warnedInMemory = true;
    console.warn(
      "[db] DB_DRIVER=pglite without DATA_DIR: PGlite is running in memory, so every restart starts from an empty database"
    );
  }
  let inst;
  try {
    if (dir) fs.mkdirSync(dir, { recursive: true });
    inst = dir ? new PGlite(dir) : new PGlite();
  } catch (err) {
    throw new Error(`pglite_open_failed: ${dir ? `DATA_DIR=${dir} (${err.message})` : err.message}`);
  }
  pglite = inst;
  pgliteReady = (async () => {
    try {
      await (inst.waitReady || Promise.resolve());
    } catch (err) {
      // A failed open must not poison every later query with the same error.
      if (pglite === inst) {
        pglite = null;
        pgliteReady = null;
      }
      throw new Error(`pglite_open_failed: ${dir ? `DATA_DIR=${dir} (${err.message})` : err.message}`);
    }
  })();
  await pgliteReady;
  return pglite;
}

async function getPGlite() {
  if (pglite) {
    if (pgliteReady) await pgliteReady;
    return pglite;
  }
  return openPGlite();
}

function configured() {
  if (driver() === "pglite") return true;
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool() {
  if (driver() === "pglite") return pglitePool();
  if (!configured()) throw new Error("db_not_configured: set DATABASE_URL (see .env.example)");
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return pool;
}

// Pool-shaped view of the one embedded connection. connect() hands out the
// connection to one caller at a time, which is what a transaction needs, so
// callers written against the pg pool work unchanged under pglite.
function pglitePool() {
  return {
    driver: "pglite",
    async connect() {
      const l = await acquireConnection();
      let released = false;
      return {
        query: (sql, params) => queryPGlite(sql, params),
        release() {
          if (released) return;
          released = true;
          releaseConnection(l);
        },
      };
    },
    query: (sql, params) => query(sql, params),
    end: () => close(),
  };
}

async function queryPGlite(sql, params) {
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
    const results = await pg.exec(sql);
    const last = Array.isArray(results) && results.length ? results[results.length - 1] : null;
    if (last && Array.isArray(last.rows)) {
      return { rows: last.rows, rowCount: last.rowCount != null ? last.rowCount : (last.affectedRows || last.rows.length) };
    }
    return { rows: [], rowCount: 0 };
  }
  const r = await pg.query(sql);
  return { rows: r.rows, rowCount: r.rowCount != null ? r.rowCount : (r.affectedRows || r.rows.length) };
}

async function query(sql, params) {
  const held = txContext.getStore();
  if (held && held.query) return held.query(sql, params);
  if (driver() === "pglite") {
    // Behind a lease the query takes its own turn, and releasing that turn is
    // what wakes the next waiter. Waiting without taking one would leave every
    // other queued query to run out its timeout.
    if (lease) {
      const l = await acquireConnection();
      try {
        return await queryPGlite(sql, params);
      } finally {
        releaseConnection(l);
      }
    }
    return queryPGlite(sql, params);
  }
  return getPool().query(sql, params);
}

// Run fn inside a transaction. fn receives a client whose query() is bound to
// that transaction, and db.query() inside fn is routed to it as well. Nested
// calls keep the same transaction and scope themselves with a savepoint.
async function transaction(fn) {
  if (typeof fn !== "function") throw new Error("transaction(fn) needs a function");
  const outer = txContext.getStore();
  if (outer && outer.sql) return nestedTransaction(outer, fn);
  const store = {};
  return txContext.run(store, async () => {
    if (driver() === "pglite") {
      const l = await acquireConnection();
      const client = {
        // release() is a no-op here on purpose: transaction() owns the lease and
        // frees it in its own finally, so an early release cannot hand the
        // connection to another caller mid-transaction.
        query: (sql, params) => queryPGlite(sql, params),
        release() {},
      };
      store.sql = client.query;
      store.query = client.query;
      try {
        await client.query("begin");
        const out = await fn(client);
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        releaseConnection(l);
      }
    }
    const client = await getPool().connect();
    store.sql = (sql, params) => client.query(sql, params);
    store.query = store.sql;
    try {
      await client.query("begin");
      const out = await fn(client);
      await client.query("commit");
      return out;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}

async function nestedTransaction(outer, fn) {
  const name = `wow_sp_${++savepointSeq}`;
  await outer.sql(`savepoint ${name}`);
  try {
    const out = await fn({ query: outer.sql, release() {} });
    await outer.sql(`release savepoint ${name}`);
    return out;
  } catch (err) {
    await outer.sql(`rollback to savepoint ${name}`).catch(() => {});
    throw err;
  }
}

async function health() {
  const d = driver();
  if (d === "pglite") {
    const dir = pgliteDir();
    const base = { configured: true, driver: "pglite", dataDir: dir, persistent: Boolean(dir) };
    try {
      const pg = await getPGlite();
      await pg.query("select 1");
      return { ...base, ok: true };
    } catch (err) {
      return { ...base, ok: false, error: err.message };
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
  // Let an in-flight open finish, then close the instance it produced.
  if (pgliteReady) await pgliteReady.catch(() => {});
  if (pglite) {
    const pg = pglite;
    pglite = null;
    pgliteReady = null;
    try {
      await pg.close();
    } catch {}
  }
  lease = null;
  while (waiters.length) {
    const w = waiters.shift();
    clearTimeout(w.timer);
    w.reject(closedError());
  }
}

module.exports = { query, transaction, health, configured, getPool, driver, close, getPGlite };
