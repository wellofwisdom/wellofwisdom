// SPDX-License-Identifier: AGPL-3.0-or-later
// Media + adventures routes (guide): media config, image/video generation
// (jobs), course covers, and turning courses into Adventures.
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const auth = require("../lib/auth");
const db = require("../lib/db");
const jobs = require("../lib/jobs");
const media = require("../lib/media");
const adventure = require("../lib/adventure");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// ---- config (Trinacle-style settings form) ----
const SECRET_FIELDS = ["kieKey", "openaiKey"];

function mask(cfg) {
  if (!cfg) return null;
  const out = { ...cfg };
  for (const f of SECRET_FIELDS) if (out[f]) out[f] = "•••••" + String(out[f]).slice(-4);
  return out;
}

router.get("/status", async (_req, res, next) => {
  try {
    res.json(await media.status());
  } catch (err) {
    next(err);
  }
});

router.get("/config", async (_req, res, next) => {
  try {
    const cfg = await media.resolveConfig();
    res.json({
      config: mask(cfg),
      imageModels: media.IMAGE_MODELS,
      videoModels: media.VIDEO_MODELS,
      imageSizes: ["1024x1024", "1536x1024", "1024x1536"],
      videoResolutions: ["480p", "720p", "1080p"],
      videoDurations: [4, 6, 8, 10, 12, 15],
    });
  } catch (err) {
    next(err);
  }
});

router.put("/config", async (req, res, next) => {
  try {
    const b = req.body || {};
    const cfg = {};
    for (const k of ["imageProvider", "imageModel", "imageQuality", "imageSize",
      "videoProvider", "videoModel", "videoResolution", "videoDuration", "kieKey", "openaiKey"]) {
      if (b[k] !== undefined && b[k] !== null && b[k] !== "") cfg[k] = b[k];
    }
    if (!db.configured()) return bad(res, "db_required", 503);
    const prevRow = await db.query("select value from server_settings where key = 'media'");
    const prev = (prevRow.rows[0] && prevRow.rows[0].value) || {};
    for (const f of SECRET_FIELDS) {
      if (/^•••••/.test(String(cfg[f] || "")) && prev[f]) cfg[f] = prev[f];
    }
    const merged = { ...prev, ...cfg };
    await db.query(
      `insert into server_settings (key, value, updated_at) values ('media', $1, now())
       on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(merged)]
    );
    media.invalidateCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- generation (jobs) ----
router.post("/image", async (req, res, next) => {
  try {
    const { prompt, size, purpose, refType, refId } = req.body || {};
    if (!String(prompt || "").trim()) return bad(res, "prompt_required");
    const st = await media.status();
    if (!st.canImage) return bad(res, "media_not_configured", 503);
    const jobId = await jobs.enqueue(req.user.familyId, "image", {
      prompt: String(prompt).slice(0, 2000),
      size: size || undefined,
      purpose: purpose || "general",
      refType: refType || "misc",
      refId: refId ? Number(refId) : null,
    }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

router.post("/video", async (req, res, next) => {
  try {
    const { prompt, duration, resolution, purpose, refType, refId } = req.body || {};
    if (!String(prompt || "").trim()) return bad(res, "prompt_required");
    const st = await media.status();
    if (!st.canVideo) return bad(res, "video_not_configured", 503);
    const jobId = await jobs.enqueue(req.user.familyId, "video", {
      prompt: String(prompt).slice(0, 2000),
      duration: Number(duration) || undefined,
      resolution: resolution || undefined,
      purpose: purpose || "cutscene",
      refType: refType || "misc",
      refId: refId ? Number(refId) : null,
    }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

// latest asset for a ref (e.g. course cover)
router.get("/latest", async (req, res, next) => {
  try {
    const { refType, refId, purpose } = req.query;
    const { rows } = await db.query(
      `select url, kind, created_at from media_assets
        where family_id = $1 and ref_type = $2 and ref_id = $3 and purpose = $4
        order by id desc limit 1`,
      [req.user.familyId, String(refType || ""), Number(refId || 0), String(purpose || "")]
    );
    res.json({ asset: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// ---- adventures ----
router.get("/adventures/themes", (_req, res) => {
  res.json({ themes: adventure.listThemes() });
});

// Turn a course into an Adventure (AI builds the world; cover art follows).
router.post("/adventures", async (req, res, next) => {
  try {
    const { courseId, learnerId, themeId } = req.body || {};
    const c = await db.query(
      `select c.id, c.title from courses c where c.id = $1 and c.family_id = $2`,
      [Number(courseId), req.user.familyId]
    );
    if (!c.rows[0]) return bad(res, "course_not_found", 404);
    let learner = null;
    if (learnerId != null) {
      const l = await db.query(
        "select id, name, grade_level, interests from users where id = $1 and family_id = $2 and role = 'learner'",
        [Number(learnerId), req.user.familyId]
      );
      if (!l.rows[0]) return bad(res, "learner_not_found", 404);
      learner = l.rows[0];
    }
    // units for chapter mapping
    const units = await db.query(
      "select title from units where course_id = $1 order by position, id",
      [Number(courseId)]
    );

    const { world, themeTitle } = await adventure.buildWorld({
      themeId: themeId || "custom",
      course: { title: c.rows[0].title, units: units.rows },
      learner,
    });

    const { rows } = await db.query(
      `insert into adventures (family_id, learner_id, course_id, theme_id, world, created_by)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [req.user.familyId, learnerId ? Number(learnerId) : null, Number(courseId),
        String(themeId || "custom"), JSON.stringify(world), req.user.id]
    );
    const adventureId = rows[0].id;

    // kick off the cover image (best-effort)
    const st = await media.status();
    if (st.canImage && world.coverPrompt) {
      jobs.enqueue(req.user.familyId, "image", {
        prompt: world.coverPrompt,
        size: "1536x1024",
        purpose: "adventure-cover",
        refType: "adventure",
        refId: adventureId,
      }, req.user.id).catch(() => {});
    }
    res.status(201).json({ adventureId, world, themeTitle });
  } catch (err) {
    next(err);
  }
});

router.get("/adventures/for-course/:courseId", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select a.*, u.name as learner_name from adventures a
         left join users u on u.id = a.learner_id
        where a.course_id = $1 and a.family_id = $2
        order by a.created_at desc`,
      [Number(req.params.courseId), req.user.familyId]
    );
    res.json({ adventures: rows });
  } catch (err) {
    next(err);
  }
});

router.delete("/adventures/:id", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from adventures where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Generate a course cover (guide button on Course Detail).
router.post("/course-cover/:courseId", async (req, res, next) => {
  try {
    const st = await media.status();
    if (!st.canImage) return bad(res, "media_not_configured", 503);
    const c = await db.query(
      "select title, lens, topic, description from courses where id = $1 and family_id = $2",
      [Number(req.params.courseId), req.user.familyId]
    );
    if (!c.rows[0]) return bad(res, "not_found", 404);
    const row = c.rows[0];
    const prompt =
      (req.body && req.body.prompt) ||
      `Wide dramatic cover illustration for a learning course titled "${row.title}". ${row.lens ? `Theme woven through: ${row.lens}.` : ""} ${row.description || ""} Original art, warm and adventurous, no text, no words, no letters.`;
    const jobId = await jobs.enqueue(req.user.familyId, "image", {
      prompt: prompt.slice(0, 2000),
      size: "1536x1024",
      purpose: "course-cover",
      refType: "course",
      refId: Number(req.params.courseId),
    }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
