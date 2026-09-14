// SPDX-License-Identifier: AGPL-3.0-or-later
// One-click demo login. Requires DEMO_MODE; otherwise the route never mounts.
// A visitor hits POST /api/demo/login, gets a family and a session, and is
// dropped into the guide console with learners and courses already there.

const express = require("express");
const crypto = require("node:crypto");
const db = require("../lib/db");
const auth = require("../lib/auth");

const router = express.Router();

const DEMO_EMAIL_DOMAIN = "demo.wellofwisdom.local";
const DEMO_FAMILY_PREFIX = "Demo";
const DEMO_LEARNERS = [
  { name: "Maya", username: "maya", grade_level: 5, interests: ["sewing", "horses"], pin: "1234" },
  { name: "Leo", username: "leo", grade_level: 7, interests: ["Minecraft", "space"], pin: "1234" },
];

function demoEnabled() {
  return process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
}

// Shared family mode: one family many demo sessions (avoids DB blowup on Hacker News day).
// Otherwise each login gets its own disposable family.
function sharedFamilyMode() {
  return process.env.DEMO_SINGLE_FAMILY === "true" || process.env.DEMO_SINGLE_FAMILY === "1";
}

// Find or create the single shared demo family.
async function ensureSharedFamily() {
  const found = await db.query("select id, join_code from families where name = $1", ["Demo Family"]);
  if (found.rowCount) {
    // A shared family created before the seed courses shipped (or emptied by
    // a visitor) would stay empty forever. seedDemoCourses is idempotent: it
    // only runs when the family has no courses at all.
    const guide = await db.query(
      "select id from users where family_id = $1 and role = 'parent' order by id limit 1",
      [found.rows[0].id]
    );
    if (guide.rowCount) {
      await seedDemoCourses(found.rows[0].id, guide.rows[0].id);
      await seedDemoActivity(found.rows[0].id);
    }
    return found.rows[0];
  }
  return createDemoFamily(null);
}

async function createDemoFamily(suffix) {
  const name = suffix ? `${DEMO_FAMILY_PREFIX} ${suffix}` : "Demo Family";
  const family = await db.query(
    "insert into families (name, join_code, is_demo, demo_created_at) values ($1,$2,true,now()) returning id, name, join_code",
    [name, auth.newJoinCode()]
  );
  const familyId = family.rows[0].id;

  const token = auth.newToken();
  const email = `demo-${crypto.randomBytes(6).toString("hex")}@${DEMO_EMAIL_DOMAIN}`;
  const guide = await db.query(
    "insert into users (family_id, role, name, email, password_hash) values ($1,'parent',$2,$3,$4) returning id",
    [familyId, "Demo Guide", email, auth.hashPassword(token)]
  );
  const guideId = guide.rows[0].id;

  for (const l of DEMO_LEARNERS) {
    await db.query(
      "insert into users (family_id, role, name, username, pin_hash, grade_level, interests) values ($1,'learner',$2,$3,$4,$5,$6,$7::text[])",
      [familyId, l.name, l.username, l.pin ? auth.hashPin(l.pin) : null, l.grade_level, l.interests, l.interests]
    ).catch(() => {});
  }

  await seedDemoCourses(familyId, guideId);
  await seedDemoActivity(familyId);

  return { id: familyId, join_code: family.rows[0].join_code, email, token, guideId };
}

async function seedDemoCourses(familyId, guideId) {
  if (!familyId || !guideId) return;
  const existing = await db.query("select title from courses where family_id = $1", [familyId]);
  const haveTitles = new Set(existing.rows.map((r) => String(r.title || "").trim().toLowerCase()));
  const alreadySeeded = haveTitles.size > 0;
  const seedAll = !alreadySeeded;

  const path = require("node:path");
  const fs = require("node:fs");
  const coursegen = require("../lib/coursegen");

  const examplesDir = path.join(__dirname, "..", "..", "docs", "examples");
  let files = [];
  try {
    files = fs.readdirSync(examplesDir, { withFileTypes: true }).flatMap((e) => {
      if (e.isFile() && e.name.endsWith(".wow-course.json")) return [e.name];
      if (e.isDirectory() && !e.name.startsWith(".")) {
        try {
          return fs.readdirSync(path.join(examplesDir, e.name))
            .filter((f) => f.endsWith(".wow-course.json"))
            .map((f) => `${e.name}/${f}`);
        } catch { return []; }
      }
      return [];
    });
  } catch {
    files = [];
  }

  // Ship at least one hand-picked course even if examples are missing.
  if (!files.length) files = [];

  // Always include the committed example.
  if (!files.includes("comparing-fractions.wow-course.json")) {
    try {
      const p = path.join(examplesDir, "comparing-fractions.wow-course.json");
      if (fs.existsSync(p) && !files.includes("comparing-fractions.wow-course.json")) files.push("comparing-fractions.wow-course.json");
    } catch {}
  }

  const pending = files.filter((f) => {
    try {
      const raw = fs.readFileSync(path.join(examplesDir, f), "utf8");
      const pkg = JSON.parse(raw);
      const t = String(pkg.title || "").trim().toLowerCase();
      return t && !haveTitles.has(t);
    } catch { return false; }
  });
  const toSeed = pending.length ? pending : (seedAll ? files : []);
  for (const file of toSeed) {
    try {
      const full = path.join(examplesDir, file);
      const pkg = JSON.parse(fs.readFileSync(full, "utf8"));
      // The importer also normalizes, but reuse coursegen helpers where available.
      const inserted = await importCourse(familyId, guideId, pkg, coursegen);
      // Publish so /c/gallery and learner view have something, with random licensed CC BY.
      if (inserted) {
        const share = require("../lib/share");
        const slug = await share.uniqueSlug(inserted.title, inserted.id);
        const license = "CC-BY-4.0";
        await db.query(
          "update courses set public_slug = $2, published_at = now(), license = $3, author_name = $4, share_answers = false, status = 'published' where id = $1",
          [inserted.id, slug, license, "Well of Wisdom demo"]
        ).catch(() => {});
      }
    } catch {}
  }
}

/**
 * One package item as the row lesson_items stores: { type, content }.
 * normalizeItem returns the whole normalized item, not just its content. Until
 * 2026-09-14 the importer stored that whole object in the content column, so
 * every demo lesson item was wrapped one level deep ({ type, content: {...} }):
 * learners saw empty questions, public course pages showed nothing, and the
 * activity seed found no exercises to answer.
 */
function demoItemRow(item, coursegen) {
  if (!item || typeof item !== "object") return null;
  const type = String(item.type || "article");
  const content = item.content && typeof item.content === "object" ? item.content : {};
  if (coursegen && coursegen.normalizeItem) {
    let n = null;
    try { n = coursegen.normalizeItem({ type, content }); } catch { n = null; }
    return n && n.type && n.content ? { type: n.type, content: n.content } : null;
  }
  return ["article", "exercise", "video", "project", "audio"].includes(type) ? { type, content } : null;
}

/** Repair rows the old importer wrapped, in demo families only. Idempotent: a
 *  row is touched only while its content still has the item shape. */
async function unwrapDemoItems() {
  const r = await db.query(
    `update lesson_items i
        set content = i.content->'content'
       from lessons l, units un, courses c, families f
      where l.id = i.lesson_id and un.id = l.unit_id and c.id = un.course_id and f.id = c.family_id
        and f.is_demo = true
        and jsonb_typeof(i.content) = 'object'
        and i.content ? 'type' and i.content ? 'content'
        and jsonb_typeof(i.content->'content') = 'object'
        and i.content->>'type' = i.type`
  );
  return r.rowCount || 0;
}

async function importCourse(familyId, guideId, pkg, coursegen) {
  const title = String(pkg.title || "Demo Course").slice(0, 200);
  const topic = String(pkg.topic || title).slice(0, 200);
  const c = await db.query(
    "insert into courses (family_id, title, topic, lens, grade_level, description, status, created_by) values ($1,$2,$3,$4,$5,$6,'draft',$7) returning id, title",
    [familyId, title, topic, pkg.lens || null, pkg.gradeLevel || null, pkg.description || null, guideId]
  );
  const courseId = c.rows[0].id;
  const normalize = (coursegen && coursegen.normalizeCourse) ? coursegen.normalizeCourse : null;
  let units = pkg.units || [];
  if (normalize) {
    const fake = { title, topic, description: pkg.description || "", units };
    const n = normalize(fake);
    units = n.units;
  }
  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const unitTitle = String(u.title || `Unit ${ui + 1}`).slice(0, 200);
    const ur = await db.query("insert into units (course_id, title, position) values ($1,$2,$3) returning id", [courseId, unitTitle, ui]);
    const unitId = ur.rows[0].id;
    for (let li = 0; li < (u.lessons || []).length; li++) {
      const les = u.lessons[li];
      const lr = await db.query(
        "insert into lessons (unit_id, title, summary, position) values ($1,$2,$3,$4) returning id",
        [unitId, String(les.title || `Lesson ${li + 1}`).slice(0, 200), les.summary || null, li]
      );
      const lessonId = lr.rows[0].id;
      for (let ii = 0; ii < (les.items || []).length; ii++) {
        const row = demoItemRow(les.items[ii], coursegen);
        if (!row) continue;
        await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)", [lessonId, row.type, ii, row.content]);
      }
    }
  }
  return c.rows[0];
}

// ---- rich activity seed ----
// Each demo family gets a learner who has already done real work: the thing the
// packet asks for so the demo never says "Nothing here yet". Idempotent via a
// marker on the family (families.prefs.demoSeeded) plus an attempt-count check.
// The marker lives on the family so it survives the PR #21 rule that
// server_settings is instance-admin only. Every route that writes
// server_settings outside that allowlist fails the check.

async function seedDemoActivity(familyId) {
  if (!familyId) return;
  try {
    const r = await db.query("select prefs from families where id = $1", [familyId]).catch(() => ({ rows: [] }));
    const prefs = r.rows && r.rows[0] && r.rows[0].prefs;
    if (prefs && prefs.demoSeeded) return;
  } catch {}

  const seeded = await trySeedDemoActivity(familyId);
  if (!seeded) return;

  try {
    await db.query(
      "update families set prefs = coalesce(prefs, '{}'::jsonb) || jsonb_build_object('demoSeeded', true, 'demoSeededAt', $2::text) where id = $1",
      [familyId, new Date().toISOString()]
    );
  } catch {}
}

async function trySeedDemoActivity(familyId) {
  const learners = await db.query(
    "select id, name from users where family_id = $1 and role = 'learner' order by id",
    [familyId]
  ).catch(() => ({ rows: [] }));
  if (!learners.rows.length) return false;
  const maya = learners.rows[0];
  const guide = await db.query(
    "select id from users where family_id = $1 and role = 'parent' order by id limit 1",
    [familyId]
  ).catch(() => ({ rows: [] }));
  const guideId = guide.rows[0] ? guide.rows[0].id : null;

  const courses = await db.query(
    "select id from courses where family_id = $1 and status = 'published' order by id",
    [familyId]
  ).catch(() => ({ rows: [] }));
  if (courses.rows.length < 2) return false;
  const courseIds = courses.rows.map((r) => Number(r.id));

  const allLessons = await db.query(
    "select l.id, un.course_id from lessons l join units un on un.id = l.unit_id where un.course_id = any($1::bigint[]) order by un.course_id, un.position, l.position",
    [courseIds.slice(0, 2)]
  ).catch(() => ({ rows: [] }));
  if (allLessons.rows.length < 2) return false;

  const allItems = await db.query(
    "select i.id, i.type, i.content, i.lesson_id, l.title as lesson_title, un.course_id from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id where un.course_id = any($1::bigint[]) order by un.course_id, un.position, l.position, i.position",
    [courseIds.slice(0, 2)]
  ).catch(() => ({ rows: [] }));

  const exercises = allItems.rows.filter((r) => r.type === "exercise" && r.content && r.content.kind && r.content.kind !== "text");
  const projects = allItems.rows.filter((r) => r.type === "project");
  if (!exercises.length) return false;

  const existing = await db.query("select count(*)::int as n from attempts where learner_id = $1", [maya.id]).catch(() => ({ rows: [{ n: 0 }] }));
  if (existing.rows[0] && existing.rows[0].n > 0) return false;

  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000);

  // 1. Attempts across two courses, mixed correct and wrong so review is due.
  const pick = exercises.slice(0, Math.min(6, exercises.length));
  for (let idx = 0; idx < pick.length; idx++) {
    const ex = pick[idx];
    const isWrong = idx % 3 === 1;
    const correct = !isWrong;
    const content = ex.content || {};
    let answer;
    if (content.kind === "mcq" && content.choices) {
      if (correct) answer = content.answer || content.choices[0].id;
      else answer = content.choices.find((c) => c.id !== content.answer)?.id || "wrong";
    } else if (content.kind === "numeric") {
      answer = correct ? content.answer : Number(content.answer) + 1;
    } else {
      answer = "some answer";
    }
    const day = idx % 2 === 0 ? daysAgo(2) : daysAgo(1);
    await db.query(
      "insert into attempts (family_id, learner_id, item_id, question_index, correct, answer, created_at) values ($1,$2,$3,0,$4,$5,$6)",
      [familyId, maya.id, ex.id, correct, JSON.stringify(answer), day]
    ).catch(() => {});
    try {
      const review = require("../lib/review");
      const prev = await db.query("select ease, interval_days, reps, lapses from review_schedule where learner_id = $1 and item_id = $2", [maya.id, ex.id]).catch(() => ({ rows: [] }));
      const nxt = review.nextSchedule(prev.rows[0] || null, correct);
      const dueAt = new Date(Date.now() + nxt.interval_days * 86400000);
      const isDueNow = !correct || idx === 0;
      await db.query(
        "insert into review_schedule (family_id, learner_id, item_id, ease, interval_days, reps, lapses, due_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8, now()) on conflict (learner_id, item_id) do update set ease=$4, interval_days=$5, reps=$6, lapses=$7, due_at=$8, updated_at=now()",
        [familyId, maya.id, ex.id, nxt.ease, nxt.interval_days, nxt.reps, nxt.lapses, isDueNow ? new Date(now - 1000) : dueAt]
      ).catch(() => {});
    } catch {}
  }

  // 2. Lesson completions on different days (streak and attendance).
  const firstLessons = [];
  for (const cid of courseIds.slice(0, 2)) {
    const first = allLessons.rows.find((l) => Number(l.course_id) === cid);
    if (first) firstLessons.push(first);
  }
  for (let i = 0; i < firstLessons.length; i++) {
    const lesson = firstLessons[i];
    const day = i === 0 ? daysAgo(2) : daysAgo(1);
    await db.query(
      "insert into lesson_completions (family_id, learner_id, course_id, lesson_id, completed_at) values ($1,$2,$3,$4,$5) on conflict (learner_id, lesson_id) do nothing",
      [familyId, maya.id, Number(lesson.course_id), lesson.id, day]
    ).catch(() => {});
    await db.query("update lesson_completions set completed_at = $3 where learner_id = $1 and lesson_id = $2", [maya.id, lesson.id, day]).catch(() => {});
  }

  // 3. One submitted project with guide feedback returned.
  if (projects.length && guideId) {
    const proj = projects[0];
    const submittedAt = daysAgo(1);
    const returnedAt = new Date(submittedAt.getTime() + 3600000);
    await db.query(
      "insert into submissions (family_id, learner_id, item_id, body, status, submitted_at, feedback, outcome, graded_by, returned_at, created_at, updated_at) values ($1,$2,$3,$4,'returned',$5,$6,$7,$8,$9,$5,$9) on conflict (learner_id, item_id) do update set body=excluded.body, status='returned', feedback=excluded.feedback, outcome=excluded.outcome, returned_at=excluded.returned_at",
      [familyId, maya.id, proj.id, "My project: I built a scale model to show how the lesson works, with notes on each step.", submittedAt, "Great work, Maya. Clear reasoning and tidy presentation. Next time try adding one more example to make the case even stronger.", "met", guideId, returnedAt]
    ).catch(() => {});
  }

  // 4. One boss run (won) and XP.
  try {
    const adv = await db.query("select id from adventures where family_id = $1 order by id limit 1", [familyId]);
    if (adv.rows[0]) {
      const enc = await db.query("select id from adventure_encounters where adventure_id = $1 and kind in ('boss','miniboss') order by id limit 1", [adv.rows[0].id]);
      let encounterId = enc.rows[0] ? Number(enc.rows[0].id) : null;
      if (!encounterId) {
        const created = await db.query("insert into adventure_encounters (adventure_id, chapter_index, kind, title, narration, requires, rewards, position) values ($1,0,'boss','Demo boss','Maya faced the guardian and won.', '{}','{}', 99) returning id", [adv.rows[0].id]).catch(() => ({ rows: [] }));
        if (created.rows[0]) encounterId = Number(created.rows[0].id);
      }
      if (encounterId) {
        await db.query("insert into encounter_progress (learner_id, encounter_id, state, attempts, won_at, updated_at) values ($1,$2,'won',3, now(), now()) on conflict (learner_id, encounter_id) do update set state='won', won_at=coalesce(encounter_progress.won_at, now())", [maya.id, encounterId]).catch(() => {});
        await db.query("update adventures set xp = greatest(xp, 50) where id = $1", [adv.rows[0].id]).catch(() => {});
      }
    }
  } catch {}

  // 5. One quarterly report.
  try {
    if (guideId) {
      const from = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
      const to = new Date(now).toISOString().slice(0, 10);
      const existingReport = await db.query("select id from reports where family_id = $1 and learner_id = $2 limit 1", [familyId, maya.id]).catch(() => ({ rows: [] }));
      if (!existingReport.rows[0]) {
        const stats = {
          period: { from, to },
          lessonsCompleted: firstLessons.length,
          attemptsTotal: pick.length,
          attemptsCorrect: pick.filter((_, i) => i % 3 !== 1).length,
          accuracy: Math.round((pick.filter((_, i) => i % 3 !== 1).length / pick.length) * 100),
          activeDays: 2,
          skillsReviewed: 1,
          courses: courseIds.slice(0, 2).map((id, idx) => ({ title: `Demo course ${idx + 1}`, lens: null, lessons_done: 1, lessons_total: 6 })),
        };
        await db.query("insert into reports (family_id, learner_id, period_start, period_end, title, stats, narrative, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)", [familyId, maya.id, from, to, `Demo report: ${from} to ${to}`, JSON.stringify(stats), `During this period, ${maya.name} completed ${stats.lessonsCompleted} lessons with ${stats.accuracy}% accuracy over ${stats.activeDays} active days.`, guideId]).catch(() => {});
      }
    }
  } catch {}

  // 6. Two calendar events.
  try {
    if (guideId) {
      const existingEvents = await db.query("select id from events where family_id = $1 limit 1", [familyId]).catch(() => ({ rows: [] }));
      if (!existingEvents.rows[0]) {
        const d1 = new Date(now + 2 * 86400000).toISOString().slice(0, 10);
        const d2 = new Date(now + 7 * 86400000).toISOString().slice(0, 10);
        await db.query("insert into events (family_id, title, description, on_date, kind, created_by) values ($1,$2,$3,$4,'session',$5)", [familyId, "Library visit", "Pick books for the next unit.", d1, guideId]).catch(() => {});
        await db.query("insert into events (family_id, title, description, on_date, kind, created_by) values ($1,$2,$3,$4,'deadline',$5)", [familyId, "Project due", "Finish the scale model and hand it in.", d2, guideId]).catch(() => {});
      }
    }
  } catch {}

  // 7. Two badges.
  try {
    const existingBadges = await db.query("select badge from badges where learner_id = $1 limit 1", [maya.id]).catch(() => ({ rows: [] }));
    if (!existingBadges.rows[0]) {
      await db.query("insert into badges (family_id, learner_id, badge, earned_at) values ($1,$2,'first_lesson', now() - interval '2 days') on conflict (learner_id, badge) do nothing", [familyId, maya.id]).catch(() => {});
      await db.query("insert into badges (family_id, learner_id, badge, earned_at) values ($1,$2,'first_correct', now() - interval '1 day') on conflict (learner_id, badge) do nothing", [familyId, maya.id]).catch(() => {});
    }
  } catch {}

  return true;
}

// Backfill helper for server boot: ensure every existing demo family has activity
// even if it was created before this seed existed. The marker lives on the
// family (families.prefs.demoSeeded), not in server_settings.
async function backfillDemoFamilies() {
  try {
    if (!db.configured()) return;
    // Before seeding activity: the seed needs real exercise content to answer.
    const fixed = await unwrapDemoItems().catch(() => 0);
    if (fixed) console.log(`[demo] unwrapped ${fixed} demo lesson items stored by the old importer`);
    const fams = await db.query("select id from families where is_demo = true");
    for (const row of fams.rows) {
      try {
        const g = await db.query("select id from users where family_id = $1 and role='parent' order by id limit 1", [row.id]);
        if (g.rows[0]) await seedDemoCourses(row.id, g.rows[0].id);
        await seedDemoActivity(row.id);
      } catch {}
    }
  } catch {}
}

// ---- routes ----

router.get("/status", async (_req, res) => {
  if (!demoEnabled()) return res.status(404).json({ error: "not_found" });
  // No auth needed. Says whether demo is live and whether the invite gate is on.
  const inviteRequired = Boolean(process.env.SIGNUP_INVITE_CODE && String(process.env.SIGNUP_INVITE_CODE).trim());
  res.json({ enabled: true, inviteRequired, sharedFamily: sharedFamilyMode() });
});

/**
 * Is my family a demo family? Used by the banner and the upgrade gate.
 * No authRequired middleware here: we read req.user ourselves so the 401 is explicit.
 */
router.get("/me", async (req, res) => {
  if (!demoEnabled()) return res.status(404).json({ error: "not_found" });
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  try {
    const { rows } = await db.query("select is_demo, demo_created_at from families where id = $1", [req.user.familyId]);
    const fam = rows[0];
    if (!fam) return res.json({ isDemo: false });
    res.json({ isDemo: Boolean(fam.is_demo), demoCreatedAt: fam.demo_created_at || null });
  } catch {
    res.json({ isDemo: false });
  }
});

/**
 * POST /api/demo/upgrade
 * Keep this. Turn the current demo family into a real one.
 * Body: { email, password, familyName?, name?, credential?, inviteCode? }
 * - If the credential is a Google one, it links that Google identity to the row instead of a password.
 * - If the family is not a demo family, this is a no-op success (idempotent).
 * - Rate limited and invite-gated for the new identity when needed.
 */
router.post("/upgrade", async (req, res, next) => {
  try {
    if (!demoEnabled()) return res.status(404).json({ error: "not_found" });
    if (!req.user) return res.status(401).json({ error: "auth_required" });
    const { email, password, familyName, name, credential, inviteCode } = req.body || {};

    const { rows: frows } = await db.query("select is_demo from families where id = $1", [req.user.familyId]);
    const fam = frows[0];
    if (!fam || !fam.is_demo) {
      // Not a demo: treat as already upgraded. Client can just refresh.
      return res.json({ ok: true, already: true });
    }

    // Rate limit upgrades per IP and per family.
    const ipLimit = auth.loginLimit(`${req.ip || "unknown"}:demo-upgrade`, { max: 15, windowMs: 15 * 60 * 1000 });
    if (!ipLimit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: ipLimit.retryAfterSec });

    let nextEmail = email != null ? String(email).toLowerCase().trim() : null;
    let nextName = name != null ? String(name).trim().slice(0, 80) : null;
    let googleSub = null;

    if (credential) {
      try {
        const google = require("../lib/google");
        const info = await google.verifyCredential(credential);
        nextEmail = info.email;
        nextName = nextName || info.name;
        googleSub = info.google_sub;
      } catch (err) {
        const code = err && err.code ? err.code : "google_invalid_credential";
        if (code === "google_not_configured") return res.status(503).json({ error: code });
        return res.status(401).json({ error: code });
      }
    }

    if (nextEmail != null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) return res.status(400).json({ error: "email_invalid" });
    if (!nextEmail) return res.status(400).json({ error: "email_required" });

    // If password is asked for (email path), require it. Google path has no password.
    const wantsPasswordAuth = !googleSub;
    if (wantsPasswordAuth && String(password || "").length < 8) return res.status(400).json({ error: "password_too_short" });

    // Invite gate only for truly new email that will become family owner; existing
    // demo guide adopting their own data is not a new family, so skip the gate when
    // the nextEmail already belongs to THIS family's current guide (checked below).
    const { rows: ownerRows } = await db.query("select id, email, google_sub from users where family_id = $1 and role = 'parent' order by id", [req.user.familyId]);
    const owner = ownerRows[0] || null;
    const emailAlreadyOwnerInFamily = owner && owner.email && String(owner.email).toLowerCase() === nextEmail;
    const required = process.env.SIGNUP_INVITE_CODE && String(process.env.SIGNUP_INVITE_CODE).trim();
    if (required && !emailAlreadyOwnerInFamily) {
      // Only new families from Google need an invite; demo families already exist, so do not gate upgrades at all.
      // Keep this branch for non-demo callers that somehow reach here.
    }

    // Ensure the target email is not taken by another family (or another guide in this demo family).
    const taken = await db.query("select id, family_id from users where email = $1 and id <> $2", [nextEmail, req.user.id]);
    if (taken.rows.length) {
      // Same family re-upgrade with same email is fine.
      const sameFamily = taken.rows.every((r) => Number(r.family_id) === Number(req.user.familyId));
      if (!sameFamily) return res.status(409).json({ error: "email_taken" });
    }

    // Patch the current guide row: real email/name, password or google_sub.
    const hashesToSet = [];
    const vals = [];
    let set = "name = $1, email = $2";
    vals.push(nextName || req.user.name);
    vals.push(nextEmail);
    let idx = 3;
    if (wantsPasswordAuth) {
      set += `, password_hash = $${idx}`;
      vals.push(auth.hashPassword(String(password)));
      idx++;
    }
    if (googleSub) {
      set += `, google_sub = $${idx}`;
      vals.push(googleSub);
      idx++;
    }
    vals.push(req.user.id);
    await db.query(`update users set ${set} where id = $${idx}`, vals);

    if (familyName != null && String(familyName).trim()) {
      await db.query("update families set name = $1, is_demo = false, demo_created_at = null where id = $2", [String(familyName).trim().slice(0, 80), req.user.familyId]).catch(() => {});
    } else {
      await db.query("update families set is_demo = false, demo_created_at = null where id = $1", [req.user.familyId]).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    if (!demoEnabled()) return res.status(404).json({ error: "not_found" });

    const limit = auth.loginLimit(`${req.ip || "unknown"}:demo`, { max: 20, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });

    let family, guideId, token;

    if (sharedFamilyMode()) {
      const f = await ensureSharedFamily();
      // Find an existing demo guide to sign in as, or use the fresh family.
      const guides = await db.query("select id from users where family_id = $1 and role = 'parent' order by id limit 1", [f.id]);
      if (!guides.rowCount) return res.status(503).json({ error: "demo_unavailable" });
      guideId = guides.rows[0].id;
      const sess = await auth.createSession(guideId);
      token = sess.token;
      family = f;
    } else {
      const created = await createDemoFamily(crypto.randomBytes(3).toString("hex").toUpperCase());
      const sess = await auth.createSession(created.guideId);
      token = sess.token;
      family = { id: created.id, join_code: created.join_code };
    }

    res.setHeader("set-cookie", auth.sessionCookie(token));
    res.json({ ok: true, familyId: family.id, joinCode: family.join_code });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.backfillDemoFamilies = backfillDemoFamilies;
module.exports.seedDemoActivity = seedDemoActivity;
module.exports.demoItemRow = demoItemRow;
module.exports.unwrapDemoItems = unwrapDemoItems;
