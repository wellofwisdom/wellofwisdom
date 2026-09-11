// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal Google ID token verification for sign up and sign in.
// No extra dependency: verifies the credential with Google's tokeninfo
// endpoint via the existing fetchT helper, with a tiny cache and rate gate.

const { fetchT } = require("./http");

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const CACHE_TTL_MS = 5 * 60 * 1000; // a credential is one-time; this is just burst dedupe
const cache = new Map(); // id_token -> { sub, email, name, expAt }

function clientId() {
  const v = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  return v || null;
}

function enabled() {
  return Boolean(clientId());
}

/** Return the cached info or null. */
function getCached(token) {
  const hit = cache.get(String(token));
  if (!hit) return null;
  if (hit.expAt && Date.now() > hit.expAt) { cache.delete(String(token)); return null; }
  return hit;
}

function putCached(token, info) {
  cache.set(String(token), { ...info, expAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

/**
 * Verify a Google credential (ID token) using the tokeninfo endpoint.
 * Returns { google_sub, email, name } on success.
 * Throws "google_not_configured", "google_invalid_credential", or "google_verify_failed".
 */
async function verifyCredential(credential) {
  const cid = clientId();
  if (!cid) throw Object.assign(new Error("google_not_configured"), { code: "google_not_configured" });
  const tok = String(credential || "").trim();
  if (!tok || tok.split(".").length !== 3) throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });

  const cached = getCached(tok);
  if (cached) return { google_sub: cached.sub, email: cached.email, name: cached.name };

  let res;
  try {
    const url = `${TOKENINFO_URL}?id_token=${encodeURIComponent(tok)}`;
    res = await fetchT(url, {}, { timeoutMs: 8000, retries: 1 });
  } catch {
    throw Object.assign(new Error("google_verify_failed"), { code: "google_verify_failed" });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }

  if (!res.ok || !data || !data.sub || !data.email) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }

  // aud must be our client, and azp must too when present.
  const aud = String(data.aud || "");
  const azp = String(data.azp || "");
  // Also accept comma-joined aud lists.
  const audList = aud.split(",").map((s) => s.trim());
  if (!audList.includes(cid) && aud !== cid) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }
  if (azp && azp !== cid) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }

  // Expiry and issuer sanity.
  if (data.exp && Number(data.exp) * 1000 < Date.now()) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }
  if (data.iss && !String(data.iss).includes("accounts.google.com") && !String(data.iss).includes("https://accounts.google.com")) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }
  if (String(data.email_verified) === "false") {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }

  const email = String(data.email).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw Object.assign(new Error("google_invalid_credential"), { code: "google_invalid_credential" });
  }

  const name = String((data.name || data.given_name || email.split("@")[0] || "")).trim().slice(0, 80) || "Guide";
  const info = { google_sub: String(data.sub), email, name };
  putCached(tok, { sub: info.google_sub, email: info.email, name: info.name });
  return info;
}

module.exports = { enabled, clientId, verifyCredential, getCached, putCached };
