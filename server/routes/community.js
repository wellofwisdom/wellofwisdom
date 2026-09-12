// SPDX-License-Identifier: AGPL-3.0-or-later
// In-app community library proxy: browse without GitHub, add with one tap.
// Fetches from wellofwisdom/community-courses (or COMMUNITY_COURSES_URL env).
// Teachers never touch git; the server fetches, the client shows cards.

const express = require("express");
const auth = require("../lib/auth");
const { fetchT } = require("../lib/http");

const router = express.Router();

// Where the library lives on GitHub. Overridable for tests / forks.
function repoBase() {
  const raw = String(process.env.COMMUNITY_COURSES_URL || "https://github.com/wellofwisdom/community-courses").trim();
  // Normalize to https://github.com/<owner>/<repo>
  if (raw.includes("github.com")) {
    const m = raw.match(/github\.com\/([^/]+\/[^/]+)/);
    if (m) return `https://github.com/${m[1].replace(/\/$/, "").replace(/\.git$/, "")}`;
  }
  return "https://github.com/wellofwisdom/community-courses";
}

function rawBase() {
  const base = repoBase();
  const m = base.match(/github\.com\/([^/]+\/[^/]+)/);
  const repo = m ? m[1] : "wellofwisdom/community-courses";
  return `https://raw.githubusercontent.com/${repo}/main`;
}

// Cache for 5 minutes.
let cache = { at: 0, list: null };
const TTL_MS = 5 * 60 * 1000;

// List courses from the community repo by enumerating courses/<slug>/course.wow-course.json
// via GitHub API (trees) or by fetching a prebuilt index if the repo publishes one.
async function fetchCommunityList() {
  const now = Date.now();
  if (cache.list && now - cache.at < TTL_MS) return cache.list;

  // Prefer a prebuilt index if it exists (faster, no API rate limit).
  try {
    const idxUrl = `${rawBase()}/courses/index.json`;
    const idxRes = await fetchT(idxUrl, {}, { timeoutMs: 8000, retries: 1 });
    if (idxRes.ok) {
      const idx = await idxRes.json().catch(() => null);
      if (idx && Array.isArray(idx.courses) && idx.courses.length) {
        cache = { at: now, list: idx.courses.slice(0, 50) };
        return cache.list;
      }
    }
  } catch {}

  // Fallback: GitHub trees API, no token needed for public repo (60/h anonymous).
  // Try fetching course list by probing known slugs? Instead use GitHub tree.
  const m = repoBase().match(/github\.com\/([^/]+)\/([^/]+)/);
  const owner = m ? m[1] : "wellofwisdom";
  const repo = m ? m[2] : "community-courses";
  const apiKey = process.env.GITHUB_TOKEN || "";
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : { accept: "application/vnd.github+json" };

  let tree = null;
  try {
    const res = await fetchT(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, { headers }, { timeoutMs: 8000, retries: 1 });
    if (res.ok) {
      const j = await res.json().catch(() => null);
      tree = j && j.tree;
    }
  } catch {}

  if (!tree) {
    // No community repo yet or unreachable: return empty, not an error.
    cache = { at: now, list: [] };
    return [];
  }

  const paths = tree.filter((n) => n.path.endsWith("/course.wow-course.json")).map((n) => n.path).slice(0, 50);
  const list = [];
  for (const p of paths) {
    try {
      const raw = `${rawBase()}/${p}`;
      const res = await fetchT(raw, {}, { timeoutMs: 5000, retries: 0 });
      if (!res.ok) continue;
      const pkg = await res.json().catch(() => null);
      if (!pkg || !pkg.title) continue;
      const slug = p.split("/")[1] || pkg.title;
      list.push({
        slug,
        title: String(pkg.title).slice(0, 120),
        description: String(pkg.description || "").slice(0, 300),
        topic: pkg.topic || null,
        lens: pkg.lens || null,
        gradeLevel: pkg.gradeLevel ?? null,
        license: pkg.license || "CC-BY-4.0",
        units: Array.isArray(pkg.units) ? pkg.units.length : 0,
        lessons: Array.isArray(pkg.units) ? pkg.units.reduce((n, u) => n + (u.lessons || []).length, 0) : 0,
        rawUrl: raw,
      });
    } catch {}
  }
  cache = { at: now, list };
  return list;
}

// Fallback when community repo not yet live: serve local examples so the UI is never empty.
function localExamples() {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "..", "..", "docs", "examples");
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wow-course.json"));
    return files.map((f) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return {
        slug: f.replace(".wow-course.json", ""),
        title: pkg.title,
        description: String(pkg.description || "").slice(0, 300),
        topic: pkg.topic || null,
        lens: pkg.lens || null,
        gradeLevel: pkg.gradeLevel ?? null,
        license: pkg.license || "CC-BY-4.0",
        units: (pkg.units || []).length,
        lessons: (pkg.units || []).reduce((n, u) => n + (u.lessons || []).length, 0),
        rawUrl: null,
        local: true,
      };
    });
  } catch {
    return [];
  }
}

// GET /api/community  (authenticated: inside the app)
router.get("/", auth.parentOnly, async (_req, res, next) => {
  try {
    let list = await fetchCommunityList().catch(() => []);
    if (!list.length) list = localExamples();
    res.json({ courses: list, source: list.length && list[0].local ? "local" : "community" });
  } catch (err) {
    next(err);
  }
});

// POST /api/community/import  body: { rawUrl } or { slug }  -> imports as draft
router.post("/import", auth.parentOnly, async (req, res, next) => {
  try {
    let rawUrl = String(req.body && req.body.rawUrl || "").trim();
    const slug = String(req.body && req.body.slug || "").trim();
    if (!rawUrl && slug) rawUrl = `${rawBase()}/courses/${slug}/course.wow-course.json`;
    if (!rawUrl) return res.status(400).json({ error: "rawUrl_or_slug_required" });

    // Reuse the same import path as Courses -> Import course -> Paste link.
    // Call the existing import-url logic inline to avoid URL SSRF dance for raw github.
    const pkgRes = await fetchT(rawUrl, {}, { timeoutMs: 10000, retries: 1 });
    if (!pkgRes.ok) return res.status(400).json({ error: "fetch_failed" });
    const pkg = await pkgRes.json().catch(() => null);
    if (!pkg || !pkg.title) return res.status(400).json({ error: "not_a_course" });

    const coursegen = require("../lib/coursegen");
    const db = require("../lib/db");
    const normalize = coursegen.normalizeCourse;
    // Use parent identity from auth
    const familyId = req.user.familyId;
    const guideId = req.user.id;
    const fake = { title: pkg.title, topic: pkg.topic || pkg.title, description: pkg.description || "", units: pkg.units || [] };
    const norm = normalize ? normalize(fake) : null;
    const units = norm ? norm.units : (pkg.units || []);

    // Insert like seedDemoCourses does: minimal, via coursegen helpers if available
    const title = String(pkg.title).slice(0, 200);
    const c = await db.query(
      "insert into courses (family_id, title, topic, lens, grade_level, description, status, created_by) values ($1,$2,$3,$4,$5,$6,'draft',$7) returning id, title",
      [familyId, title, String(pkg.topic || title).slice(0, 200), pkg.lens || null, pkg.gradeLevel || null, String(pkg.description || "").slice(0, 1000) || null, guideId]
    );
    const courseId = c.rows[0].id;
    for (let ui = 0; ui < units.length; ui++) {
      const u = units[ui];
      const un = await db.query("insert into units (course_id, title, position) values ($1,$2,$3) returning id", [courseId, String(u.title || "Unit").slice(0, 200), ui]);
      const lessons = u.lessons || [];
      for (let li = 0; li < lessons.length; li++) {
        const l = lessons[li];
        const ln = await db.query("insert into lessons (unit_id, title, summary, position) values ($1,$2,$3,$4) returning id", [un.rows[0].id, String(l.title || "Lesson").slice(0, 200), String(l.summary || "").slice(0, 600) || null, li]);
        const items = l.items || [];
        for (let ii = 0; ii < items.length; ii++) {
          const it = items[ii];
          await db.query("insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)", [ln.rows[0].id, it.type || "article", ii, JSON.stringify(it.content || {})]);
        }
      }
    }
    res.json({ ok: true, courseId, title });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
