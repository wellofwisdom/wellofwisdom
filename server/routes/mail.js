// SPDX-License-Identifier: AGPL-3.0-or-later
// Email routes (guide): provider status, family prefs, test send, digest now.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const mail = require("../lib/mail");
const digest = require("../lib/digest");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

router.get("/status", async (_req, res, next) => {
  try {
    res.json(await mail.status());
  } catch (err) {
    next(err);
  }
});

// ---- provider configuration (Trinacle-style: pick provider, paste keys) ----
const PROVIDERS = ["resend", "sparkpost", "ses", "smtp"];
const SECRET_FIELDS = ["resendKey", "sparkpostKey", "sesSecret", "smtpPass"];

function maskSecrets(cfg) {
  if (!cfg) return null;
  const out = { ...cfg };
  for (const f of SECRET_FIELDS) {
    if (out[f]) out[f] = "•••••" + String(out[f]).slice(-4);
  }
  return out;
}

router.get("/config", async (req, res, next) => {
  try {
    const cfg = await mail.resolveConfig();
    const envFallback = {
      resend: Boolean(process.env.RESEND_API_KEY),
      sparkpost: Boolean(process.env.SPARKPOST_API_KEY),
      ses: Boolean(process.env.SES_ACCESS_KEY && process.env.SES_SECRET_KEY),
      smtp: Boolean(process.env.SMTP_HOST),
    };
    res.json({ config: maskSecrets(cfg), envFallback });
  } catch (err) {
    next(err);
  }
});

router.put("/config", async (req, res, next) => {
  try {
    const body = req.body || {};
    const provider = body.provider;
    if (!PROVIDERS.includes(provider)) return bad(res, "provider_invalid");
    const from = String(body.from || "").trim().slice(0, 200) || null;
    const cfg = { provider, from, _fromDb: true };
    if (provider === "resend") cfg.resendKey = String(body.resendKey || "").trim().slice(0, 200) || null;
    if (provider === "sparkpost") cfg.sparkpostKey = String(body.sparkpostKey || "").trim().slice(0, 200) || null;
    if (provider === "ses") {
      cfg.sesKey = String(body.sesKey || "").trim().slice(0, 200) || null;
      cfg.sesSecret = String(body.sesSecret || "").trim().slice(0, 200) || null;
      cfg.sesRegion = String(body.sesRegion || "us-east-1").trim().slice(0, 20);
    }
    if (provider === "smtp") {
      cfg.smtpHost = String(body.smtpHost || "").trim().slice(0, 200) || null;
      cfg.smtpPort = Number(body.smtpPort) || 587;
      cfg.smtpUser = String(body.smtpUser || "").trim().slice(0, 200) || null;
      cfg.smtpPass = String(body.smtpPass || "").slice(0, 200) || null;
    }
    if (!db.configured()) return bad(res, "db_required", 503);
    // merge over previous config so masked-secrets PUTs don't wipe keys
    const prevRow = await db.query("select value from server_settings where key = 'mail'");
    const prev = (prevRow.rows[0] && prevRow.rows[0].value) || {};
    for (const f of SECRET_FIELDS) {
      const incoming = cfg[f];
      if (incoming === null || incoming === undefined || /^•••••/.test(String(incoming))) {
        if (prev[f]) cfg[f] = prev[f];
      }
    }
    await db.query(
      `insert into server_settings (key, value, updated_at) values ('mail', $1, now())
       on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(cfg)]
    );
    mail.invalidateConfigCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Family email prefs: what goes out, and where the guide's copy is sent.
router.get("/prefs", async (req, res, next) => {
  try {
    const { rows } = await db.query("select prefs from families where id = $1", [req.user.familyId]);
    const p = (rows[0] && rows[0].prefs) || {};
    const g = await db.query(
      "select email from users where family_id = $1 and role = 'parent' and email is not null order by id limit 1",
      [req.user.familyId]
    );
    // How many learners opted in (an email on the profile IS the opt-in), so
    // the UI can say whether the learner toggles do anything yet.
    const l = await db.query(
      "select count(*)::int as n from users where family_id = $1 and role = 'learner' and email is not null and email <> ''",
      [req.user.familyId]
    );
    res.json({
      digest: p.digest !== false,
      digestEmail: p.digestEmail || null,
      defaultTo: (g.rows[0] && g.rows[0].email) || null,
      reminders: p.reminders !== false,
      learnerDigest: p.learnerDigest !== false,
      learnerReminders: p.learnerReminders !== false,
      learnersWithEmail: (l.rows[0] && l.rows[0].n) || 0,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/prefs", async (req, res, next) => {
  try {
    const { digestOn, digestEmail, remindersOn, learnerDigestOn, learnerRemindersOn } = req.body || {};
    const { rows } = await db.query("select prefs from families where id = $1", [req.user.familyId]);
    const p = { ...((rows[0] && rows[0].prefs) || {}) };
    if (digestOn !== undefined) p.digest = Boolean(digestOn);
    if (remindersOn !== undefined) p.reminders = Boolean(remindersOn);
    if (learnerDigestOn !== undefined) p.learnerDigest = Boolean(learnerDigestOn);
    if (learnerRemindersOn !== undefined) p.learnerReminders = Boolean(learnerRemindersOn);
    if (digestEmail !== undefined) {
      if (digestEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(digestEmail))) return bad(res, "email_invalid");
      p.digestEmail = digestEmail ? String(digestEmail).slice(0, 200) : null;
    }
    await db.query("update families set prefs = $2 where id = $1", [req.user.familyId, JSON.stringify(p)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/test", async (req, res, next) => {
  try {
    const to = String((req.body && req.body.to) || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return bad(res, "email_invalid");
    const st = await mail.status();
    if (!st.configured) return bad(res, "mail_not_configured", 503);
    const r = await mail.sendMail({
      to,
      subject: "Well of Wisdom — test email",
      html: `<div style="font-family:system-ui,sans-serif"><div style="font-size:28px">🌰</div>
        <h2>It works!</h2><p>Weekly digests and notifications will arrive from this address.</p>
        <p style="color:#5b6875;font-size:13px">Sent by your self-hosted Well of Wisdom.</p></div>`,
      text: "It works! Weekly digests will arrive from this address.",
      familyId: req.user.familyId,
      kind: "test",
    });
    res.json(r);
  } catch (err) {
    next(err);
  }
});

router.post("/digest-now", async (req, res, next) => {
  try {
    const r = await digest.sendNow(req.user.familyId);
    res.json(r);
  } catch (err) {
    next(err);
  }
});

// Send every opted-in learner their weekly note right now. `force` bypasses
// the once-a-week guard so the guide can preview what lands.
router.post("/learner-notes-now", async (req, res, next) => {
  try {
    const st = await mail.status();
    if (!st.configured) return bad(res, "mail_not_configured", 503);
    res.json(await digest.sendLearnerNotes(req.user.familyId, { force: true }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
