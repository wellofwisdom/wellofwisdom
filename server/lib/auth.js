// SPDX-License-Identifier: AGPL-3.0-or-later
// Auth: scrypt passwords, DB-backed sessions (stateless web tier rule),
// cookie handling without extra deps, and a tiny per-IP login rate limiter.
const crypto = require("node:crypto");
const db = require("./db");

const COOKIE_NAME = "wow_session";
const SESSION_DAYS = 30;

// ---- passwords (parents) ----

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(hashHex, "hex");
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// ---- PINs (learners): same scheme, kept in a separate column ----

const hashPin = hashPassword;
const verifyPin = verifyPassword;

// ---- sessions ----

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createSession(userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.query(
    "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
    [tokenHash(token), userId, expires]
  );
  return { token, expires };
}

async function destroySession(token) {
  if (!token) return;
  await db.query("delete from sessions where token_hash = $1", [tokenHash(token)]);
}

/**
 * The user object every authenticated request carries, session or API token
 * alike. lookupToken in lib/apiTokens builds its user with this same
 * function, so /api/me answers identically by cookie and by bearer token:
 * same fields, same value shapes.
 */
function buildUser(row) {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    familyId: row.family_id,
    familyName: row.family_name,
    joinCode: row.join_code,
    prefs: row.prefs || {},
    gradeLevel: row.grade_level,
    interests: row.interests || [],
    // A parent with no guide_role predates roles entirely. Treat them as an
    // owner: nobody who could do something yesterday loses it today.
    guideRole: row.role === "parent" ? (row.guide_role || "owner") : null,
  };
}

/** Resolve a session token to its user (or null). Joins family for convenience. */
async function userForToken(token) {
  if (!token) return null;
  const { rows } = await db.query(
    `select u.id, u.role, u.name, u.family_id, u.prefs, u.grade_level, u.interests, u.guide_role,
            f.name as family_name, f.join_code,
            (u.email is not null) as has_email,
            (s.expires_at > now()) as valid
       from sessions s
       join users u on u.id = s.user_id
       join families f on f.id = u.family_id
      where s.token_hash = $1`,
    [tokenHash(token)]
  );
  const row = rows[0];
  if (!row || !row.valid) return null;
  return buildUser(row);
}

// ---- cookies (no extra dependency) ----

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionCookie(token, { clear = false } = {}) {
  const base = `${COOKIE_NAME}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`;
  // Cloud sets COOKIE_SECURE=true behind TLS; plain-HTTP self-host stays usable.
  return process.env.COOKIE_SECURE === "true" ? `${base}; Secure` : base;
}

// ---- middleware ----

function cookies(req, _res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  next();
}

async function attachUser(req, res, next) {
  try {
    const bearer = String(req.headers.authorization || "").trim();
    const m = /^Bearer\s+(.+)$/i.exec(bearer);
    if (m) {
      const raw = m[1].trim();
      // wow_ tokens are API tokens (MCP/integrations), not session tokens
      if (raw.startsWith("wow_")) {
        const at = require("./apiTokens");
        const found = await at.lookupToken(raw);
        if (!found) return res.status(401).json({ error: "auth_required" });
        const lim = at.tokenLimit(found.tokenHash);
        if (!lim.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: lim.retryAfterSec });
        if (!at.tokenAllows(req, found.scopes)) return res.status(403).json({ error: "not_allowed" });
        req.user = found.user;
        req.apiToken = { id: found.tokenId, scopes: found.scopes, hash: found.tokenHash };
        at.touchLastUsed(found.tokenId);
        return next();
      }
    }
    req.user = await userForToken(req.cookies[COOKIE_NAME]);
  } catch (err) {
    req.user = null; // db down / not configured → treated as logged out
  }
  next();
}

function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  next();
}

/** Gate one route on a named permission from lib/perm. */
function requirePerm(action) {
  const perm = require("./perm");
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "auth_required" });
    if (!perm.can(req.user, action)) {
      return res.status(403).json({ error: "not_allowed", action });
    }
    next();
  };
}

/** Blocks an observer from anything that changes state, whatever the route. */
function denyReadOnly(req, res, next) {
  const perm = require("./perm");
  if (req.user && perm.isReadOnly(req.user) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return res.status(403).json({ error: "read_only" });
  }
  next();
}

function parentOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  if (req.user.role !== "parent") return res.status(403).json({ error: "parent_only" });
  next();
}

// ---- login rate limiting (per IP, in-memory; cloud swaps for Redis) ----

const attempts = new Map(); // ip -> { count, resetAt }, insertion ordered

// Bounded: past maxEntries the oldest addresses are dropped one at a time.
// Clearing the whole map instead (the old behaviour) reset every counter at
// once, so a burst of fresh addresses would unlock an address being brute
// forced. Expired entries are swept first so a busy but honest server does not
// evict live counters while stale ones sit in the map.
function loginLimit(ip, { max = 10, windowMs = 15 * 60 * 1000, maxEntries = 10000 } = {}) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.delete(ip); // re-insert at the end so eviction stays oldest-first
    if (attempts.size >= maxEntries) {
      for (const [k, v] of attempts) {
        if (v.resetAt < now) attempts.delete(k);
        if (attempts.size < maxEntries) break;
      }
      while (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value);
    }
    attempts.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  entry.count++;
  return entry.count <= max
    ? { ok: true, remaining: max - entry.count }
    : { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
}

// ---- family join codes ----

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1

function newJoinCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  newToken,
  tokenHash,
  createSession,
  destroySession,
  buildUser,
  userForToken,
  sessionCookie,
  parseCookies,
  cookies,
  attachUser,
  authRequired,
  parentOnly,
  requirePerm,
  denyReadOnly,
  loginLimit,
  newJoinCode,
};
