// SPDX-License-Identifier: AGPL-3.0-or-later
// Public, unauthenticated course pages. This is the only part of the app that
// answers without a session, so it is deliberately narrow: published courses
// only, read-only, answer keys stripped, and rate limited.
//
// It exists so a course can be linked, crawled, cited, fed to a research tool,
// and imported by any other instance — without anyone signing up for anything.
const express = require("express");
const db = require("../lib/db");
const share = require("../lib/share");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Simple in-process limiter. Public endpoints are cacheable and cheap, but an
// open door still gets knocked on.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
function limit(req, res, next) {
  const key = req.ip || "anon";
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    hits.set(key, { n: 1, reset: now + WINDOW_MS });
    return next();
  }
  if (++rec.n > MAX_PER_WINDOW) return bad(res, "rate_limited", 429);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, WINDOW_MS).unref();

router.use(limit);
router.use((_req, res, next) => {
  // Safe to cache and to embed in a citation; never varies by user.
  res.set("Cache-Control", "public, max-age=300");
  res.set("Access-Control-Allow-Origin", "*"); // another instance may import
  next();
});

/** Published course tree by slug — no family scoping, that is the point. */
async function publicTree(slug) {
  const c = await db.query(
    `select id, title, topic, lens, grade_level, description, public_slug,
            published_at, license, author_name, share_answers
       from courses where public_slug = $1 and published_at is not null`,
    [slug]
  );
  if (!c.rows[0]) return null;
  const courseId = c.rows[0].id;
  const units = await db.query(
    "select id, title, position from units where course_id = $1 order by position, id",
    [courseId]
  );
  const lessons = await db.query(
    `select l.id, l.unit_id, l.title, l.summary, l.position
       from lessons l join units un on un.id = l.unit_id
      where un.course_id = $1 order by l.position, l.id`,
    [courseId]
  );
  const items = await db.query(
    `select i.id, i.lesson_id, i.type, i.position, i.content
       from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
      where un.course_id = $1 order by i.position, i.id`,
    [courseId]
  );
  return {
    ...c.rows[0],
    units: units.rows.map((u) => ({
      ...u,
      lessons: lessons.rows
        .filter((l) => l.unit_id === u.id)
        .map((l) => ({ ...l, items: items.rows.filter((i) => i.lesson_id === l.id) })),
    })),
  };
}

/** Everything this instance has published. */
router.get("/courses", async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `select c.public_slug, c.title, c.topic, c.lens, c.grade_level, c.description,
              c.license, c.author_name, c.published_at,
              (select count(*) from units u where u.course_id = c.id)::int as units,
              (select count(*) from lessons l join units u on u.id = l.unit_id where u.course_id = c.id)::int as lessons
         from courses c
        where c.published_at is not null
        order by c.published_at desc limit 200`
    );
    res.json({
      courses: rows.map((r) => ({
        ...share.courseMeta(r),
        units: r.units,
        lessons: r.lessons,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** One course, answer keys stripped. */
router.get("/courses/:slug", async (req, res, next) => {
  try {
    const tree = await publicTree(String(req.params.slug));
    if (!tree) return bad(res, "not_found", 404);
    res.json({ course: share.publicCourse(tree), stats: share.courseStats(tree) });
  } catch (err) {
    next(err);
  }
});

/** The portable package — this is what another instance imports. */
router.get("/courses/:slug/export", async (req, res, next) => {
  try {
    const tree = await publicTree(String(req.params.slug));
    if (!tree) return bad(res, "not_found", 404);
    res.set("Content-Disposition", `attachment; filename="${tree.public_slug}.wow-course.json"`);
    res.json(share.coursePackage(tree));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.publicTree = publicTree;
