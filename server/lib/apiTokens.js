// SPDX-License-Identifier: AGPL-3.0-or-later
// API tokens: bearer wow_... tokens, one per guide, stored as SHA-256 hash.
const crypto = require("node:crypto");
const db = require("./db");

const PREFIX = "wow_";
const VALID_SCOPES = ["read", "courses:write", "learners:read", "progress:read"];
const VALID_SET = new Set(VALID_SCOPES);

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function newRawToken() {
  return PREFIX + crypto.randomBytes(32).toString("base64url");
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  const out = [];
  const seen = new Set();
  for (const s of scopes) {
    const v = String(s || "").trim();
    if (!v) continue;
    if (!VALID_SET.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function validateName(name) {
  const n = String(name || "").trim();
  if (!n) return "name_required";
  if (n.length > 80) return "name_too_long";
  return null;
}

function validateScopes(scopes) {
  const norm = normalizeScopes(scopes);
  if (!norm.length) return "scopes_required";
  return null;
}

async function createToken({ familyId, userId, name, scopes }) {
  const nameErr = validateName(name);
  if (nameErr) {
    const e = new Error(nameErr);
    e.code = nameErr;
    throw e;
  }
  const norm = normalizeScopes(scopes);
  if (!norm.length) {
    const e = new Error("scopes_required");
    e.code = "scopes_required";
    throw e;
  }
  const raw = newRawToken();
  const h = hashToken(raw);
  const { rows } = await db.query(
    `insert into api_tokens (family_id, user_id, name, token_hash, scopes)
     values ($1,$2,$3,$4,$5) returning id, family_id, user_id, name, scopes, last_used_at, created_at, revoked_at`,
    [familyId, userId, String(name).trim().slice(0, 80), h, norm]
  );
  const row = rows[0];
  return { ...row, token: raw };
}

async function listTokens({ familyId, userId }) {
  const { rows } = await db.query(
    `select id, family_id, user_id, name, scopes, last_used_at, created_at, revoked_at
       from api_tokens where family_id = $1 and user_id = $2 order by created_at desc`,
    [familyId, userId]
  );
  return rows;
}

async function revokeToken({ id, familyId, userId }) {
  const { rows } = await db.query(
    `update api_tokens set revoked_at = now() where id = $1 and family_id = $2 and user_id = $3 and revoked_at is null returning id`,
    [Number(id), familyId, userId]
  );
  return rows[0] || null;
}

async function lookupToken(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith(PREFIX)) return null;
  const h = hashToken(raw);
  const { rows } = await db.query(
    `select t.id as token_id, t.family_id, t.user_id, t.name, t.scopes, t.revoked_at,
            u.id, u.role, u.name as user_name, u.family_id as u_family_id, u.guide_role, u.prefs, u.grade_level, u.interests,
            f.name as family_name, f.join_code
       from api_tokens t
       join users u on u.id = t.user_id
       join families f on f.id = t.family_id
      where t.token_hash = $1`,
    [h]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  return {
    tokenId: Number(row.token_id),
    tokenHash: h,
    familyId: Number(row.family_id),
    userId: Number(row.user_id),
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    user: {
      id: Number(row.id),
      role: row.role,
      name: row.user_name,
      familyId: Number(row.u_family_id),
      familyName: row.family_name,
      joinCode: row.join_code,
      prefs: row.prefs || {},
      gradeLevel: row.grade_level,
      interests: row.interests || [],
      guideRole: row.role === "parent" ? (row.guide_role || "owner") : null,
    },
  };
}

async function touchLastUsed(tokenId) {
  await db.query("update api_tokens set last_used_at = now() where id = $1", [Number(tokenId)]).catch(() => {});
}

// Rate limit per token hash, 120 per minute.
const tokenHits = new Map();
function tokenLimit(tokenHash, { max = 120, windowMs = 60 * 1000 } = {}) {
  const now = Date.now();
  const rec = tokenHits.get(tokenHash);
  if (!rec || now > rec.reset) {
    tokenHits.set(tokenHash, { n: 1, reset: now + windowMs });
    return { ok: true };
  }
  if (++rec.n > max) return { ok: false, retryAfterSec: Math.ceil((rec.reset - now) / 1000) };
  return { ok: true };
}

function tokenAllows(req, scopes) {
  const rawPath = String(req.path || req.originalUrl || req.url || "").split("?")[0];
  const p = rawPath.split("?")[0];
  const method = String(req.method || "GET").toUpperCase();
  // Token management is session-only. A bearer token must never reach
  // /api/tokens: a leaked read-only token could otherwise mint a full-scope
  // one and escalate itself.
  if (p === "/api/tokens" || p.startsWith("/api/tokens/")) return false;
  // Always allow health and public: they answer without a session anyway
  if (p === "/api/health" || p.startsWith("/api/public")) return true;
  // GET /api/me is session bootstrap, allow read scopes
  if (p === "/api/me" && method === "GET") {
    if (scopes.includes("read") || scopes.includes("learners:read") || scopes.includes("progress:read")) return true;
    // also allow any read for me
    return scopes.includes("read");
  }
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    if (scopes.includes("read")) return true;
    if (p.startsWith("/api/family/learners") && scopes.includes("learners:read")) return true;
    if ((p.startsWith("/api/progress") || p.startsWith("/api/reports")) && scopes.includes("progress:read")) return true;
    if (p.startsWith("/api/courses") && scopes.includes("courses:write")) return true;
    // public courses via authenticated endpoint? treat as read
    return false;
  }
  // writes
  if (p.startsWith("/api/courses") && scopes.includes("courses:write")) return true;
  return false;
}

module.exports = {
  PREFIX,
  VALID_SCOPES,
  hashToken,
  newRawToken,
  normalizeScopes,
  validateName,
  validateScopes,
  createToken,
  listTokens,
  revokeToken,
  lookupToken,
  touchLastUsed,
  tokenLimit,
  tokenAllows,
};
