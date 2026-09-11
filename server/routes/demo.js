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
  if (found.rowCount) return found.rows[0];
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

  return { id: familyId, join_code: family.rows[0].join_code, email, token, guideId };
}

async function seedDemoCourses(familyId, guideId) {
  if (!familyId || !guideId) return;
  // Idempotency: do not seed twice for the same family.
  const has = await db.query("select 1 from courses where family_id = $1 limit 1", [familyId]);
  if (has.rowCount) return;

  const path = require("node:path");
  const fs = require("node:fs");
  const coursegen = require("../lib/coursegen");

  const examplesDir = path.join(__dirname, "..", "..", "docs", "examples");
  let files = [];
  try {
    files = fs.readdirSync(examplesDir).filter((f) => f.endsWith(".wow-course.json"));
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

  for (const file of files.slice(0, 5)) {
    try {
      const full = path.join(examplesDir, file);
      const pkg = JSON.parse(fs.readFileSync(full, "utf8"));
      const norm = file === "comparing-fractions.wow-course.json" ? pkg : pkg;
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

async function importCourse(familyId, guideId, pkg, coursegen) {
  const title = String(pkg.title || "Demo Course").slice(0, 200);
  const topic = String(pkg.topic || title).slice(0, 200);
  const c = await db.query(
    "insert into courses (family_id, title, topic, lens, grade_level, description, status, created_by) values ($1,$2,$3,$4,$5,$6,'draft',$7) returning id, title",
    [familyId, title, topic, pkg.lens || null, pkg.gradeLevel || null, pkg.description || null, guideId]
  );
  const courseId = c.rows[0].id;
  const text = require("../lib/text");
  // Use the real normalizer if present, otherwise persist the package's shape directly.
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
    // Avoid relying on helper that enforces exact shape, insert raw then normalize per lesson.
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
        const it = les.items[ii];
        let type = String(it.type || "article");
        if (!["article", "exercise", "video", "project"].includes(type)) type = "article";
        let content = it.content || {};
        if (coursegen && coursegen.normalizeItem) {
          try { content = coursegen.normalizeItem({ type, content }); } catch { content = it.content || {}; }
        }
        // stripTags is used by importer to keep inequalities intact.
        await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)", [lessonId, type, ii, content]);
      }
    }
  }
  // If any question lacks an answer, the published course will show "No answer yet".
  // Our example is fully keyed, so this is mainly for drift.
  return c.rows[0];
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
