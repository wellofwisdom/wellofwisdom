// SPDX-License-Identifier: AGPL-3.0-or-later
// Weekly guide digest: what happened, what's due, what's coming — one email.
// Deduped per family per ISO week via mail_log.
const db = require("./db");
const mail = require("./mail");

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Gather + send the digest for one family. Returns status info. */
async function sendDigest(familyId) {
  const week = isoWeekKey();
  const fam = await db.query("select name, prefs from families where id = $1", [familyId]);
  if (!fam.rows[0]) return { skipped: "no_family" };
  const prefs = fam.rows[0].prefs || {};
  if (prefs.digest === false) return { skipped: "disabled" };

  // dedupe: one digest per family per week
  const already = await db.query(
    "select 1 from mail_log where family_id = $1 and kind = 'digest' and subject = $2 and status = 'sent' and created_at > now() - interval '6 days' limit 1",
    [familyId, week]
  );
  if (already.rowCount) return { skipped: "already_sent" };

  // guide recipient: override or the parent account's email
  let to = prefs.digestEmail || null;
  if (!to) {
    const g = await db.query(
      "select email from users where family_id = $1 and role = 'parent' and email is not null order by id limit 1",
      [familyId]
    );
    to = g.rows[0] && g.rows[0].email;
  }
  if (!to) return { skipped: "no_recipient" };

  const html = await buildDigestHtml(familyId, fam.rows[0].name, week);
  if (!html) return { skipped: "no_content" };

  return mail.sendMail({
    to,
    subject: `Your week at a glance — ${fam.rows[0].name}`,
    html,
    text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000),
    familyId,
    kind: "digest",
  });
}

async function buildDigestHtml(familyId, familyName, week) {
  const learners = await db.query(
    `select u.id, u.name,
            (select count(*) from lesson_completions lc where lc.learner_id = u.id and lc.completed_at > now() - interval '7 days')::int as lessons_week,
            (select count(*) from attempts a where a.learner_id = u.id and a.created_at > now() - interval '7 days')::int as answers_week,
            (select count(*) from attempts a where a.learner_id = u.id and a.created_at > now() - interval '7 days' and a.correct)::int as correct_week,
            (select count(*) from review_schedule rs where rs.learner_id = u.id and rs.due_at <= now())::int as reviews_due
       from users u where u.family_id = $1 and u.role = 'learner' order by u.name`,
    [familyId]
  );
  const upcoming = await db.query(
    `select m.title, m.target_date, p.title as plan_title
       from plan_milestones m join term_plans p on p.id = m.plan_id
      where p.family_id = $1 and p.status = 'active'
        and m.target_date between current_date and current_date + 14
      order by m.target_date limit 5`,
    [familyId]
  );

  const anyActivity = learners.rows.some((l) => l.lessons_week + l.answers_week > 0);
  if (!anyActivity && upcoming.rows.length === 0) return null; // nothing to say

  const rows = learners.rows
    .map((l) => {
      const acc = l.answers_week ? Math.round((l.correct_week / l.answers_week) * 100) : null;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${esc(l.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.lessons_week} lessons</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.answers_week} answers${acc !== null ? ` · ${acc}%` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.reviews_due ? `<b>${l.reviews_due} reviews due</b>` : "review clear ✓"}</td>
      </tr>`;
    })
    .join("");

  const upcomingHtml = upcoming.rows.length
    ? `<h3 style="color:#0f7d5c">Coming up (next 2 weeks)</h3><ul>${upcoming.rows
        .map((m) => `<li><b>${esc(m.title)}</b> — ${m.target_date}${m.plan_title ? ` · ${esc(m.plan_title)}` : ""}</li>`)
        .join("")}</ul>`
    : "";

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1c2430">
    <div style="font-size:28px">🌰</div>
    <h2 style="margin:6px 0 2px">Your week at a glance</h2>
    <p style="color:#5b6875;margin:0 0 16px">${esc(familyName)} · week ${week}</p>
    ${anyActivity ? `<h3 style="color:#0f7d5c">This past week</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>` : ""}
    ${upcomingHtml}
    <p style="margin-top:20px;font-size:13px;color:#5b6875">
      Sent by your self-hosted Well of Wisdom · <a href="${process.env.APP_URL || "https://wellofwisdom.app"}" style="color:#0f7d5c">open the app</a> ·
      turn digests off in Settings → Email
    </p>
  </div>`;
}

/** Weekly sweep: Monday ~13:00 UTC. Also started at boot (dedupe makes it safe). */
let timer = null;
async function sweepAll({ log = console.log } = {}) {
  const st = await mail.status().catch(() => ({ configured: false }));
  if (!db.configured() || !st.configured) return;
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isDigestHour = now.getUTCHours() === 13;
  if (!isMonday || !isDigestHour) return;
  log("[digest] weekly window open — sending");
  const families = await db.query("select id from families").catch(() => ({ rows: [] }));
  for (const f of families.rows) {
    const r = await sendDigest(f.id);
    if (r && (r.ok || (r.skipped && r.skipped !== "disabled" && r.skipped !== "already_sent"))) {
      log(`[digest] family ${f.id}: ${r.ok ? "sent" : r.skipped || r.error}`);
    }
  }
}

// Manual trigger (Settings → "Send digest now"): ignores the weekly window.
async function sendNow(familyId) {
  return sendDigestManual(familyId);
}

/** Tomorrow-reminder sweep: events happening tomorrow get one email
 *  (notified_at guards double-sends). Runs daily in the 13:00 UTC window. */
async function sweepEventReminders({ log = console.log } = {}) {
  const st = await mail.status().catch(() => ({ configured: false }));
  if (!db.configured() || !st.configured) return;
  const now = new Date();
  if (now.getUTCHours() !== 13) return;
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const { rows } = await db.query(
    `select e.*, f.name as family_name from events e join families f on f.id = e.family_id
      where e.on_date = $1 and e.notified_at is null`,
    [tomorrow]
  ).catch(() => ({ rows: [] }));
  for (const ev of rows) {
    const fam = await db.query("select prefs from families where id = $1", [ev.family_id]);
    const prefs = (fam.rows[0] && fam.rows[0].prefs) || {};
    if (prefs.reminders === false) { await markNotified(ev.id); continue; }
    let to = prefs.digestEmail || null;
    if (!to) {
      const g = await db.query(
        "select email from users where family_id = $1 and role = 'parent' and email is not null order by id limit 1",
        [ev.family_id]
      );
      to = g.rows[0] && g.rows[0].email;
    }
    if (!to) { await markNotified(ev.id); continue; }
    const r = await mail.sendMail({
      to,
      subject: `Tomorrow: ${ev.title}`,
      html: `<div style="font-family:system-ui,sans-serif"><div style="font-size:28px">🌰</div>
        <h2>Tomorrow: ${esc(ev.title)}</h2>
        <p>${esc(ev.description || "")}</p>
        <p style="color:#5b6875">${ev.on_date}${ev.at_time ? " · " + esc(ev.at_time) : ""} · ${esc(ev.family_name)}</p></div>`,
      text: `Tomorrow: ${ev.title}`,
      familyId: ev.family_id,
      kind: "event-reminder",
    });
    if (r.ok) log(`[reminders] event ${ev.id} "${ev.title}" reminded`);
    await markNotified(ev.id);
  }
}

async function markNotified(id) {
  await db.query("update events set notified_at = now() where id = $1", [id]).catch(() => {});
}

/** Weekly + daily sweeps on one hourly timer. */
function startDigestSchedule({ log = console.log } = {}) {
  const timer = setInterval(() => {
    sweepAll({ log }).catch(() => {});
    sweepEventReminders({ log }).catch(() => {});
  }, 60 * 60 * 1000);
  timer.unref();
}

async function sendDigestManual(familyId) {
  const week = isoWeekKey();
  const fam = await db.query("select name, prefs from families where id = $1", [familyId]);
  if (!fam.rows[0]) return { skipped: "no_family" };
  const prefs = fam.rows[0].prefs || {};
  if (prefs.digest === false) return { skipped: "disabled" };
  let to = prefs.digestEmail || null;
  if (!to) {
    const g = await db.query(
      "select email from users where family_id = $1 and role = 'parent' and email is not null order by id limit 1",
      [familyId]
    );
    to = g.rows[0] && g.rows[0].email;
  }
  if (!to) return { skipped: "no_recipient" };
  const html = await buildDigestHtml(familyId, fam.rows[0].name, week);
  if (!html) return { skipped: "no_content" };
  return mail.sendMail({ to, subject: `Your week at a glance — ${fam.rows[0].name}`, html, text: "Weekly digest", familyId, kind: "digest-manual" });
}

module.exports = { startDigestSchedule, sendDigest, sendNow, isoWeekKey };
