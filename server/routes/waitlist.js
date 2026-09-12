// SPDX-License-Identifier: AGPL-3.0-or-later
// Hosted waitlist: public form on the marketing site that lands as a row the
// guide can export. Spam-throttled, deduped, validated.

const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

const INTERESTS = new Set(["hosting", "coop", "pilot", "updates"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Simple in-memory throttle for the public endpoint (the DB limiter needs auth).
const recent = new Map(); // ipOrEmail -> timestamp ms
function throttled(key) {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < 30 * 1000) return true;
  recent.set(key, now);
  // prune occasionally
  if (recent.size > 1000) {
    for (const [k, t] of recent) if (now - t > 120000) recent.delete(k);
  }
  return false;
}

// POST /api/waitlist  public: { email, interest?, note? }
router.post("/", async (req, res, next) => {
  try {
    const email = String(req.body && req.body.email || "").trim().slice(0, 200);
    if (!EMAIL_RE.test(email)) return bad(res, "email_invalid");
    const key = (req.ip || "") + ":" + email.toLowerCase();
    if (throttled(key)) return bad(res, "too_many_attempts", 429);
    let interest = String(req.body && req.body.interest || "hosting").trim().toLowerCase();
    if (!INTERESTS.has(interest)) interest = "hosting";
    const note = String(req.body && req.body.note || "").trim().slice(0, 600) || null;
    const source = String(req.body && req.body.source || "landing").trim().slice(0, 40) || "landing";
    const norm = email.toLowerCase();

    // Upsert: don't error on duplicate, just update interest/note
    await db.query(
      `insert into waitlist (email, interest, note, source)
       values ($1, $2, $3, $4)
       on conflict (lower(email)) do update
         set interest = excluded.interest,
             note = coalesce(excluded.note, waitlist.note),
             created_at = waitlist.created_at`,
      [norm, interest, note, source]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/waitlist  guides only: list + count (CSV via ?format=csv)
router.get("/", auth.parentOnly, async (req, res, next) => {
  try {
    if (req.query.format === "csv") {
      const { rows } = await db.query("select email, interest, note, source, created_at from waitlist order by created_at desc");
      const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
      let csv = "email,interest,note,source,created_at\n";
      for (const r of rows) {
        csv += [esc(r.email), esc(r.interest), esc(r.note || ""), esc(r.source || ""), esc(new Date(r.created_at).toISOString())].join(",") + "\n";
      }
      res.type("text/csv").set("Content-Disposition", "attachment; filename=waitlist.csv").send(csv);
      return;
    }
    const { rows } = await db.query("select email, interest, note, source, created_at from waitlist order by created_at desc limit 500");
    res.json({ entries: rows.map((r) => ({ ...r, email: String(r.email) })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/waitlist/count  public-ish: let the landing show honest numbers
router.get("/count", async (_req, res, next) => {
  try {
    const { rows } = await db.query("select count(*)::int as n from waitlist");
    res.json({ count: rows[0] ? rows[0].n : 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
