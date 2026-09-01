// SPDX-License-Identifier: AGPL-3.0-or-later
// Multi-provider email, Trinacle pattern: provider config stored in the DB
// (Settings → Email form) with env-var fallback (RESEND_API_KEY /
// SPARKPOST_API_KEY / SES_ACCESS_KEY+SES_SECRET_KEY+SES_REGION / SMTP_*).
// Providers: Resend, SparkPost, SES (raw SigV4: zero AWS SDK), SMTP.
// Fail-open: nothing configured = a clean no-op, never a crash.
const crypto = require("node:crypto");
const db = require("./db");
const { fetchT } = require("./http");

let cache = { at: 0, config: null }; // 60s TTL; invalidated on save

function fromEnv() {
  if (process.env.RESEND_API_KEY) {
    return { provider: "resend", from: process.env.MAIL_FROM, resendKey: process.env.RESEND_API_KEY };
  }
  if (process.env.SPARKPOST_API_KEY) {
    return { provider: "sparkpost", from: process.env.MAIL_FROM, sparkpostKey: process.env.SPARKPOST_API_KEY };
  }
  if (process.env.SES_ACCESS_KEY && process.env.SES_SECRET_KEY) {
    return {
      provider: "ses", from: process.env.MAIL_FROM,
      sesKey: process.env.SES_ACCESS_KEY, sesSecret: process.env.SES_SECRET_KEY,
      sesRegion: process.env.SES_REGION || "us-east-1",
    };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    return {
      provider: "smtp", from: process.env.MAIL_FROM,
      smtpHost: process.env.SMTP_HOST, smtpPort: Number(process.env.SMTP_PORT) || 587,
      smtpUser: process.env.SMTP_USER || null, smtpPass: process.env.SMTP_PASS || null,
    };
  }
  return null;
}

async function resolveConfig() {
  if (cache.config && Date.now() - cache.at < 60000) return cache.config;
  let cfg = fromEnv();
  if (db.configured()) {
    const row = await db
      .query("select value from server_settings where key = 'mail'")
      .catch(() => ({ rows: [] }));
    const stored = row.rows[0] && row.rows[0].value;
    if (stored && stored.provider) cfg = { ...cfg, ...stored, from: stored.from || (cfg && cfg.from), _fromDb: true };
  }
  cache = { at: Date.now(), config: cfg };
  return cfg;
}

function invalidateConfigCache() {
  cache = { at: 0, config: null };
}

const DEFAULT_FROM = "Well of Wisdom <noreply@wellofwisdom.app>";

async function status() {
  const cfg = await resolveConfig();
  if (!cfg) return { configured: false, provider: null, from: null, source: null };
  return {
    configured: true,
    provider: cfg.provider,
    from: cfg.from || DEFAULT_FROM,
    source: cfg._fromDb ? "settings" : "env",
  };
}

/** Send. `userId` marks mail addressed to one person (learner notes),
 *  which is how those dedupe. Returns {ok, provider, error?}. Never throws. */
async function sendMail({ to, subject, html, text, familyId, userId, kind }) {
  const cfg = await resolveConfig();
  const log = async (status_, error) => {
    if (!db.configured()) return;
    db.query(
      "insert into mail_log (family_id, user_id, kind, to_email, subject, provider, status, error) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [familyId || null, userId || null, kind || "generic", to, subject || null, cfg ? cfg.provider : null, status_, error ? String(error).slice(0, 500) : null]
    ).catch(() => {});
  };
  if (!cfg) {
    await log("error", "no provider configured");
    return { ok: false, error: "mail_not_configured" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to || ""))) {
    await log("error", "invalid address");
    return { ok: false, error: "invalid_to" };
  }
  try {
    const from = cfg.from || DEFAULT_FROM;
    let out;
    if (cfg.provider === "resend") out = await viaResend(cfg, { to, subject, html, text, from });
    else if (cfg.provider === "sparkpost") out = await viaSparkPost(cfg, { to, subject, html, text, from });
    else if (cfg.provider === "ses") out = await viaSes(cfg, { to, subject, html, text, from });
    else out = await viaSmtp(cfg, { to, subject, html, text, from });
    await log("sent", null);
    return { ok: true, provider: cfg.provider, ...out };
  } catch (err) {
    await log("error", err.message);
    return { ok: false, provider: cfg.provider, error: err.message };
  }
}

// ---------- providers ----------

async function viaResend(cfg, { to, subject, html, text, from }) {
  const res = await fetchT("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  }, { timeoutMs: 20000, retries: 1 });
  if (!res.ok) throw new Error(`resend_${res.status}: ${String(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { id: data.id };
}

async function viaSparkPost(cfg, { to, subject, html, text, from }) {
  const res = await fetchT("https://api.sparkpost.com/api/v1/transmissions", {
    method: "POST",
    headers: { authorization: cfg.sparkpostKey, "content-type": "application/json" },
    body: JSON.stringify({ options: {}, content: { from, subject, html, text }, recipients: [{ address: { email: to } }] }),
  }, { timeoutMs: 20000, retries: 1 });
  if (!res.ok) throw new Error(`sparkpost_${res.status}: ${String(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { id: data.results && data.results.id };
}

// Raw SES SendEmail with SigV4. No AWS SDK dependency (Trinacle production pattern).
async function viaSes(cfg, { to, subject, html, text, from }) {
  const region = cfg.sesRegion || "us-east-1";
  const host = `email.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payload = new URLSearchParams({
    Action: "SendEmail",
    Version: "2010-12-01",
    "Destination.ToAddresses.member.1": to,
    "Message.Subject.Data": subject,
    "Message.Body.Html.Data": html || "",
    "Message.Body.Text.Data": text || subject,
    Source: from.replace(/.*<(.*)>/, "$1"),
  }).toString();

  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = [
    "POST", "/", "",
    canonicalHeaders,
    signedHeaders,
    crypto.createHash("sha256").update(payload).digest("hex"),
  ].join("\n");
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const kDate = crypto.createHmac("sha256", `AWS4${cfg.sesSecret}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update("ses").digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const res = await fetchT(`https://${host}/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.sesKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  }, { timeoutMs: 20000, retries: 1 });
  if (!res.ok) throw new Error(`ses_${res.status}: ${String(await res.text()).slice(0, 300)}`);
  const data = await res.text();
  return { id: (data.match(/<MessageId>([^<]+)</) || [])[1] };
}

// Plain SMTP. Loaded lazily so nodemailer stays an optional dependency.
const smtpCache = { transporter: null, loading: null };
async function viaSmtp(cfg, { to, subject, html, text, from }) {
  if (!smtpCache.transporter) {
    if (!smtpCache.loading) {
      smtpCache.loading = (async () => {
        let nodemailer;
        try {
          nodemailer = require("nodemailer");
        } catch {
          throw new Error("smtp_configured_but_nodemailer_missing: npm i nodemailer");
        }
        smtpCache.transporter = nodemailer.createTransport({
          host: cfg.smtpHost,
          port: cfg.smtpPort || 587,
          secure: cfg.smtpPort === 465,
          auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
        });
      })();
    }
    await smtpCache.loading;
  }
  const info = await smtpCache.transporter.sendMail({ from, to, subject, html, text });
  return { id: info.messageId };
}

module.exports = { sendMail, status, resolveConfig, invalidateConfigCache, DEFAULT_FROM };
