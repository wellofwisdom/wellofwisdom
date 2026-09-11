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
  const google = require("../lib/google");
  res.json({
    inviteRequired: Boolean(process.env.SIGNUP_INVITE_CODE && process.env.SIGNUP_INVITE_CODE.trim()),
    googleEnabled: google.enabled(),
    googleClientId: google.clientId(),
  });
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


/** Accept an invite: join an EXISTING family as a second grown-up.
 *
 *  The token is the credential, so it is rate limited like a login and the
 *  invite is consumed in the same statement that reads it. Two people opening
 *  the same link cannot both get in.
 */
router.post("/join", async (req, res, next) => {
  try {
    const { token, name, email, password } = req.body || {};
    if (!String(name || "").trim()) return bad(res, "name_required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) return bad(res, "email_invalid");
    if (String(password || "").length < 8) return bad(res, "password_too_short");

    const limit = auth.loginLimit(`${req.ip || "unknown"}:join`, { max: 15 });
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts" });

    const { hashToken } = require("./guides");
    // Claim it and read it at once: `used_at is null` in the WHERE makes this
    // single-use even if two people submit the same link together.
    const claimed = await db.query(
      `update invites set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
        returning id, family_id, guide_role, learner_ids`,
      [hashToken(String(token || ""))]
    );
    const invite = claimed.rows[0];
    if (!invite) return bad(res, "invite_invalid", 403);

    const existing = await db.query("select 1 from users where email = $1", [String(email).toLowerCase()]);
    if (existing.rowCount > 0) {
      // Give the invite back rather than burning it on a failed attempt.
      await db.query("update invites set used_at = null where id = $1", [invite.id]).catch(() => {});
      return bad(res, "email_taken", 409);
    }

    const user = await db.query(
      `insert into users (family_id, role, guide_role, name, email, password_hash)
       values ($1, 'parent', $2, $3, $4, $5) returning id`,
      [invite.family_id, invite.guide_role, String(name).trim().slice(0, 80),
        String(email).toLowerCase(), auth.hashPassword(password)]
    );
    const newId = user.rows[0].id;

    // An assistant arrives already scoped to the learners named on the invite.
    for (const learnerId of invite.learner_ids || []) {
      await db.query(
        "insert into guide_learners (guide_id, learner_id) values ($1,$2) on conflict do nothing",
        [newId, learnerId]
      ).catch(() => {});
    }
    await db.query("update invites set used_by = $2 where id = $1", [invite.id, newId]).catch(() => {});

    const { token: sess } = await auth.createSession(newId);
    res.setHeader("set-cookie", auth.sessionCookie(sess));
    res.json({ ok: true, role: invite.guide_role });
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

/**
 * Google credential login / signup.
 * One endpoint, two outcomes:
 *   - known google_sub or known email -> sign in, set google_sub on the row.
 *   - unknown email -> create a new family + owner, set google_sub, sign in.
 * Body: { credential: string, familyName?: string, inviteCode?: string }
 * familyName is used only when creating a new family; inviteCode still applies
 * when the server is invite-gated.
 */
router.post("/google", async (req, res, next) => {
  try {
    const { credential, familyName, inviteCode } = req.body || {};
    const google = require("../lib/google");

    const limit = auth.loginLimit(`${req.ip || "unknown"}:google`, { max: 20, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });

    let info;
    try {
      info = await google.verifyCredential(credential);
    } catch (err) {
      const code = err && err.code ? err.code : "google_invalid_credential";
      // Surface a friendly name when Google is not configured, so the button can hide itself.
      if (code === "google_not_configured") return res.status(503).json({ error: code });
      return res.status(401).json({ error: code });
    }

    const required = process.env.SIGNUP_INVITE_CODE && String(process.env.SIGNUP_INVITE_CODE).trim();
    const needsNewFamily = async () => {
      const bySub = await db.query("select id from users where google_sub = $1", [info.google_sub]);
      if (bySub.rowCount) return false;
      const byEmail = await db.query("select id from users where email = $1", [info.email]);
      if (byEmail.rowCount) return false;
      return true;
    };

    // Invite gate applies to *new* families only. Signing in as an existing user is never invitation-gated.
    if (required && (await needsNewFamily())) {
      const inviteOk = String(inviteCode || "").trim().toUpperCase() === required.toUpperCase();
      if (!inviteOk) return res.status(403).json({ error: "invite_invalid" });
    }

    // 1. By google_sub: straight sign in and refresh the link.
    {
      const { rows } = await db.query("select id from users where google_sub = $1", [info.google_sub]);
      if (rows[0]) {
        const uid = rows[0].id;
        // Keep email/name fresh from the credential when the row still allows it.
        await db.query("update users set email = coalesce(email,$2), name = case when length(trim(name))=0 then $3 else name end where id = $1", [uid, info.email, info.name.slice(0, 80)]).catch(() => {});
        const { token } = await auth.createSession(uid);
        res.setHeader("set-cookie", auth.sessionCookie(token));
        return res.json({ ok: true, mode: "login" });
      }
    }

    // 2. By email: link google_sub on first Google sign in, then sign in.
    //    Password rows keep their password; google-only rows had none.
    {
      const { rows } = await db.query("select id, google_sub from users where email = $1 and role = 'parent'", [info.email]);
      if (rows[0]) {
        const uid = rows[0].id;
        if (!rows[0].google_sub) {
          await db.query("update users set google_sub = $1 where id = $2", [info.google_sub, uid])
            .catch(async () => { /* race: another request linked first */ });
        }
        const { token } = await auth.createSession(uid);
        res.setHeader("set-cookie", auth.sessionCookie(token));
        return res.json({ ok: true, mode: "login" });
      }
    }

    // 3. New family + owner. The family name can be "Foo Family" or "Foo's learners"; never blank.
    const famName = String(familyName || "").trim().slice(0, 80) || `${info.name.split(" ")[0]} Family`;
    let family;
    for (let i = 0; i < 5; i++) {
      try {
        const inserted = await db.query(
          "insert into families (name, join_code) values ($1,$2) returning id",
          [famName, auth.newJoinCode()]
        );
        family = inserted.rows[0];
        break;
      } catch (err) {
        if (i === 4 || !/join_code/.test(String(err.message || ""))) throw err;
      }
    }

    // Dummy password hash so the row is not accidentally password-empty. Letter case matters: scrypt expects hex.
    const dummyHash = `scrypt$${require("node:crypto").randomBytes(16).toString("hex")}$${require("node:crypto").randomBytes(32).toString("hex")}`;
    const created = await db.query(
      "insert into users (family_id, role, name, email, google_sub, password_hash) values ($1,'parent',$2,$3,$4,$5) returning id",
      [family.id, info.name.slice(0, 80), info.email, info.google_sub, dummyHash]
    );
    // Older DBs may have no google_sub column yet: the migration adds it, but do not fail the signup if it is missing.
    if (!created.rows[0]) {
      const fallback = await db.query(
        "insert into users (family_id, role, name, email, password_hash) values ($1,'parent',$2,$3,$4) returning id",
        [family.id, info.name.slice(0, 80), info.email, dummyHash]
      );
      const { token } = await auth.createSession(fallback.rows[0].id);
      res.setHeader("set-cookie", auth.sessionCookie(token));
      return res.json({ ok: true, mode: "signup" });
    }
    const { token } = await auth.createSession(created.rows[0].id);
    res.setHeader("set-cookie", auth.sessionCookie(token));
    res.json({ ok: true, mode: "signup" });
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
