// SPDX-License-Identifier: AGPL-3.0-or-later
// Auth routes: parent signup/login, learner PIN login, logout, me.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Public auth config for the signup form (does the server require an invite?).
router.get("/config", (_req, res) => {
  res.json({ inviteRequired: Boolean(process.env.SIGNUP_INVITE_CODE && process.env.SIGNUP_INVITE_CODE.trim()) });
});

router.post("/signup", async (req, res, next) => {
  try {
    const { familyName, name, email, password, inviteCode } = req.body || {};
    if (!String(familyName || "").trim()) return bad(res, "family_name_required");
    if (!String(name || "").trim()) return bad(res, "name_required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) return bad(res, "email_invalid");
    if (String(password || "").length < 8) return bad(res, "password_too_short");

    // Invite gate: when SIGNUP_INVITE_CODE is set, only invited families join
    // (lets an admin safely enable AI on a public instance). Brute-force capped.
    const required = process.env.SIGNUP_INVITE_CODE && process.env.SIGNUP_INVITE_CODE.trim();
    if (required) {
      const limit = auth.loginLimit(`${req.ip || "unknown"}:invite`, { max: 15 });
      if (!limit.ok) return res.status(429).json({ error: "too_many_attempts" });
      if (String(inviteCode || "").trim().toUpperCase() !== required.toUpperCase()) return bad(res, "invite_invalid", 403);
    }

    const existing = await db.query("select 1 from users where email = $1", [email.toLowerCase()]);
    if (existing.rowCount > 0) return bad(res, "email_taken", 409);

    // join codes are unique; retry on the rare collision
    let family;
    for (let i = 0; i < 5; i++) {
      try {
        const inserted = await db.query(
          "insert into families (name, join_code) values ($1, $2) returning id, name, join_code",
          [String(familyName).trim().slice(0, 80), auth.newJoinCode()]
        );
        family = inserted.rows[0];
        break;
      } catch (err) {
        if (i === 4 || !/join_code/.test(String(err.message || ""))) throw err;
      }
    }

    const user = await db.query(
      `insert into users (family_id, role, name, email, password_hash)
       values ($1, 'parent', $2, $3, $4) returning id`,
      [family.id, String(name).trim().slice(0, 80), email.toLowerCase(), auth.hashPassword(password)]
    );

    const { token } = await auth.createSession(user.rows[0].id);
    res.setHeader("set-cookie", auth.sessionCookie(token));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const ip = req.ip || "unknown";
    const limit = auth.loginLimit(ip);
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });

    const { rows } = await db.query("select id, password_hash from users where email = $1", [
      String(email || "").toLowerCase(),
    ]);
    const user = rows[0];
    if (!user || !auth.verifyPassword(String(password || ""), user.password_hash)) {
      return bad(res, "invalid_credentials", 401);
    }
    const { token } = await auth.createSession(user.id);
    res.setHeader("set-cookie", auth.sessionCookie(token));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/learner-login", async (req, res, next) => {
  try {
    const { joinCode, username, pin } = req.body || {};
    const limit = auth.loginLimit(`${req.ip || "unknown"}:learner`);
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });

    const { rows } = await db.query(
      `select u.id, u.pin_hash
         from users u join families f on f.id = u.family_id
        where f.join_code = $1 and u.username = $2 and u.role = 'learner'`,
      [String(joinCode || "").toUpperCase().trim(), String(username || "").trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !auth.verifyPin(String(pin || ""), user.pin_hash)) {
      return bad(res, "invalid_credentials", 401);
    }
    const { token } = await auth.createSession(user.id);
    res.setHeader("set-cookie", auth.sessionCookie(token));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res) => {
  await auth.destroySession(req.cookies[auth.COOKIE_NAME]).catch(() => {});
  res.setHeader("set-cookie", auth.sessionCookie(null, { clear: true }));
  res.json({ ok: true });
});

module.exports = router;
