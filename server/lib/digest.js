// SPDX-License-Identifier: AGPL-3.0-or-later
// Weekly guide digest: what happened, what's due, what's coming. One email.
// Deduped per family per ISO week via mail_log.
const db = require("./db");
const mail = require("./mail");
const badges = require("./badges");

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Where a family's guide mail goes: the override address, else the first
 *  parent account with an email. */
async function guideRecipient(familyId, prefs) {
  if (prefs && prefs.digestEmail) return prefs.digestEmail;
  const { rows } = await db.query(
    "select email from users where family_id = $1 and role = 'parent' and email is not null order by id limit 1",
    [familyId]
  );
  return (rows[0] && rows[0].email) || null;
}

/** Learners who opted in by having an email on their profile. Email is never
 *  required to use the app, having one IS the opt-in. */
async function learnersWithEmail(familyId) {
  const { rows } = await db.query(
    "select id, name, email from users where family_id = $1 and role = 'learner' and email is not null and email <> '' order by name",
    [familyId]
  );
  return rows;
}

/** Gather + send the digest for one family. Returns status info. */
async function sendDigest(familyId) {
  const week = isoWeekKey();
  const fam = await db.query("select name, prefs from families where id = $1", [familyId]);
  if (!fam.rows[0]) return { skipped: "no_family" };
  const prefs = fam.rows[0].prefs || {};
  if (prefs.digest === false) return { skipped: "disabled" };

  // dedupe: one digest per family per week
  // One digest per family per week. (This used to compare mail_log.subject to
  // the ISO week, but the logged subject is the human one. So it never
  // matched and a restart inside the send window could double-send.)
  const already = await db.query(
    "select 1 from mail_log where family_id = $1 and kind = 'digest' and status = 'sent' and created_at > now() - interval '6 days' limit 1",
    [familyId]
  );
  if (already.rowCount) return { skipped: "already_sent" };

  // guide recipient: override or the parent account's email
  const to = await guideRecipient(familyId, prefs);
  if (!to) return { skipped: "no_recipient" };

  const html = await buildDigestHtml(familyId, fam.rows[0].name, week);
  if (!html) return { skipped: "no_content" };

  return mail.sendMail({
    to,
    subject: `Your week at a glance: ${fam.rows[0].name}`,
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
        .map((m) => `<li><b>${esc(m.title)}</b>, ${m.target_date}${m.plan_title ? ` · ${esc(m.plan_title)}` : ""}</li>`)
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

// ---------- learner note (the learner's own weekly mail) ----------
//
// A learner's email is optional and never used for login: having one on the
// profile IS the opt-in. The note is addressed to the learner, so it reports
// only their own work: no sibling comparisons, no family-wide stats.

/** Everything the weekly learner note needs. */
async function learnerWeek(learnerId, familyId) {
  const stats = await db.query(
    `select
      (select count(*) from lesson_completions where learner_id = $1 and completed_at > now() - interval '7 days')::int as lessons,
      (select count(*) from attempts where learner_id = $1 and created_at > now() - interval '7 days')::int as answers,
      (select count(*) from attempts where learner_id = $1 and created_at > now() - interval '7 days' and correct)::int as correct,
      (select count(*) from review_schedule where learner_id = $1 and due_at <= now())::int as reviews_due`,
    [learnerId]
  );
  const fresh = await db.query(
    "select badge from badges where learner_id = $1 and earned_at > now() - interval '7 days' order by earned_at",
    [learnerId]
  );
  const upcoming = await db.query(
    `(select m.title, m.target_date as on_date from plan_milestones m
        join term_plans p on p.id = m.plan_id
        join plan_enrollments e on e.plan_id = p.id and e.learner_id = $1
       where p.family_id = $2 and p.status = 'active'
         and m.target_date between current_date and current_date + 14)
     union all
     (select ev.title, ev.on_date from events ev
       where ev.family_id = $2 and ev.on_date between current_date and current_date + 14)
     order by on_date limit 3`,
    [learnerId, familyId]
  );
  const streak = await badges.computeStreak(learnerId).catch(() => ({ current: 0, best: 0 }));
  return {
    ...stats.rows[0],
    newBadges: fresh.rows.map((r) => badges.badgeById(r.badge)).filter(Boolean),
    upcoming: upcoming.rows,
    streak,
  };
}

/** Is there anything worth mailing a learner about? Silence beats a nag: a
 *  learner who has not started yet gets nothing, but reviews waiting or a date
 *  coming up is worth a note even after a quiet week. */
function shouldSendLearnerNote(w) {
  if (!w) return false;
  return Boolean(w.lessons || w.answers || w.reviews_due ||
    (w.newBadges && w.newBadges.length) || (w.upcoming && w.upcoming.length));
}

function learnerNoteHtml(learner, w, appUrl) {
  const acc = w.answers ? Math.round((w.correct / w.answers) * 100) : null;
  const bits = [];
  if (w.lessons) bits.push(`<li>${w.lessons} lesson${w.lessons === 1 ? "" : "s"} finished</li>`);
  if (w.answers) {
    bits.push(`<li>${w.answers} question${w.answers === 1 ? "" : "s"} answered${acc !== null ? `: ${acc}% right` : ""}</li>`);
  }
  if (w.streak.current >= 2) bits.push(`<li>🔥 ${w.streak.current}-day streak</li>`);

  const badgeHtml = w.newBadges.length
    ? `<h3 style="color:#0f7d5c;margin-bottom:4px">New badges</h3><p style="margin-top:0">${w.newBadges
        .map((b) => `<span style="display:inline-block;background:#fdf3d7;border-radius:999px;padding:4px 10px;margin:2px 4px 2px 0">${b.icon} <b>${esc(b.label)}</b></span>`)
        .join("")}</p>`
    : "";

  const reviewHtml = w.reviews_due
    ? `<p style="background:#eef7f2;border-left:3px solid #0f7d5c;padding:10px 12px;border-radius:4px">
         <b>${w.reviews_due} review${w.reviews_due === 1 ? "" : "s"} ready.</b> A few minutes of practice keeps them from slipping away.</p>`
    : "";

  const upcomingHtml = w.upcoming.length
    ? `<h3 style="color:#0f7d5c;margin-bottom:4px">Coming up</h3><ul style="margin-top:0">${w.upcoming
        .map((u) => `<li><b>${esc(u.title)}</b>: ${u.on_date}</li>`).join("")}</ul>`
    : "";

  const weekHtml = bits.length
    ? `<h3 style="color:#0f7d5c;margin-bottom:4px">Your week</h3><ul style="margin-top:0">${bits.join("")}</ul>`
    : "<p>Nothing logged this past week. An easy one to restart is waiting whenever you are.</p>";

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1c2430">
    <div style="font-size:28px">🌰</div>
    <h2 style="margin:6px 0 2px">Hi ${esc(firstName(learner.name))}</h2>
    <p style="color:#5b6875;margin:0 0 16px">Here is your week at the well.</p>
    ${weekHtml}
    ${badgeHtml}
    ${reviewHtml}
    ${upcomingHtml}
    <p style="margin-top:20px"><a href="${appUrl}" style="background:#0f7d5c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Open Well of Wisdom</a></p>
    <p style="margin-top:18px;font-size:13px;color:#5b6875">
      You are getting this because your guide added your email to your profile.
      Ask them to remove it to stop these.
    </p>
  </div>`;
}

/** Send one learner their weekly note. `force` skips the once-a-week guard
 *  (for the guide's "send now" button). */
async function sendLearnerNote(learner, familyId, { force = false } = {}) {
  if (!learner || !learner.email) return { skipped: "no_email" };
  if (!force) {
    const already = await db.query(
      "select 1 from mail_log where user_id = $1 and kind = 'learner-note' and status = 'sent' and created_at > now() - interval '6 days' limit 1",
      [learner.id]
    );
    if (already.rowCount) return { skipped: "already_sent" };
  }
  const w = await learnerWeek(learner.id, familyId);
  if (!shouldSendLearnerNote(w)) return { skipped: "no_content" };
  const appUrl = process.env.APP_URL || "https://wellofwisdom.app";
  return mail.sendMail({
    to: learner.email,
    subject: `Your week at the well, ${firstName(learner.name)}`,
    html: learnerNoteHtml(learner, w, appUrl),
    text: `Hi ${firstName(learner.name)}: ${w.lessons} lessons and ${w.answers} questions this week.` +
      (w.reviews_due ? ` ${w.reviews_due} reviews are ready.` : "") + ` ${appUrl}`,
    familyId,
    userId: learner.id,
    kind: "learner-note",
  });
}

/** Every opted-in learner in a family. */
async function sendLearnerNotes(familyId, { force = false } = {}) {
  const fam = await db.query("select prefs from families where id = $1", [familyId]);
  if (!fam.rows[0]) return { skipped: "no_family" };
  const prefs = fam.rows[0].prefs || {};
  if (prefs.learnerDigest === false) return { skipped: "disabled" };
  const learners = await learnersWithEmail(familyId);
  if (!learners.length) return { skipped: "no_learner_emails" };
  const results = [];
  for (const l of learners) {
    const r = await sendLearnerNote(l, familyId, { force });
    results.push({ learner: l.name, ...r });
  }
  return { ok: results.some((r) => r.ok), results };
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
  log("[digest] weekly window open: sending");
  const families = await db.query("select id from families").catch(() => ({ rows: [] }));
  for (const f of families.rows) {
    const r = await sendDigest(f.id);
    if (r && (r.ok || (r.skipped && r.skipped !== "disabled" && r.skipped !== "already_sent"))) {
      log(`[digest] family ${f.id}: ${r.ok ? "sent" : r.skipped || r.error}`);
    }
    const ln = await sendLearnerNotes(f.id).catch((err) => ({ skipped: err.message }));
    for (const one of (ln && ln.results) || []) {
      if (one.ok) log(`[digest] learner note sent: ${one.learner}`);
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
    const to = await guideRecipient(ev.family_id, prefs);
    const learners = prefs.learnerReminders === false ? [] : await learnersWithEmail(ev.family_id);
    if (!to && !learners.length) { await markNotified(ev.id); continue; }
    const when = `${ev.on_date}${ev.at_time ? " · " + esc(ev.at_time) : ""}`;
    const body = (greeting) => `<div style="font-family:system-ui,sans-serif"><div style="font-size:28px">🌰</div>
        ${greeting}
        <h2>Tomorrow: ${esc(ev.title)}</h2>
        <p>${esc(ev.description || "")}</p>
        <p style="color:#5b6875">${when} · ${esc(ev.family_name)}</p></div>`;

    // The guide gets the family-wide copy; each learner with an email gets
    // their own, addressed to them.
    const recipients = [];
    if (to) recipients.push({ to, userId: null, greeting: "" });
    for (const l of learners) {
      recipients.push({
        to: l.email,
        userId: l.id,
        greeting: `<p style="margin:0;color:#5b6875">Hi ${esc(firstName(l.name))},</p>`,
      });
    }

    let sent = 0;
    for (const r of recipients) {
      const out = await mail.sendMail({
        to: r.to,
        subject: `Tomorrow: ${ev.title}`,
        html: body(r.greeting),
        text: `Tomorrow: ${ev.title}: ${when}`,
        familyId: ev.family_id,
        userId: r.userId,
        kind: "event-reminder",
      });
      if (out.ok) sent++;
    }
    if (sent) log(`[reminders] event ${ev.id} "${ev.title}" reminded (${sent} recipient${sent === 1 ? "" : "s"})`);
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
  const to = await guideRecipient(familyId, prefs);
  if (!to) return { skipped: "no_recipient" };
  const html = await buildDigestHtml(familyId, fam.rows[0].name, week);
  if (!html) return { skipped: "no_content" };
  return mail.sendMail({ to, subject: `Your week at a glance: ${fam.rows[0].name}`, html, text: "Weekly digest", familyId, kind: "digest-manual" });
}

module.exports = {
  startDigestSchedule, sendDigest, sendNow, isoWeekKey,
  sendLearnerNote, sendLearnerNotes, shouldSendLearnerNote, learnerNoteHtml, firstName,
};
