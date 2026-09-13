// SPDX-License-Identifier: AGPL-3.0-or-later
// Music: Suno Generate Music on kie.ai, same key as images and voice.
// One loop per chapter at $0.06 per generation, cached in UPLOAD_DIR like
// every other piece of generated media. Silent when not configured.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const store = require("../lib/uploads");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function musicReady() {
  try {
    return require("../lib/providers/kie-music").kieMusicConfigured();
  } catch { return false; }
}

function musicStatus() {
  try { return require("../lib/providers/kie-music").kieMusicStatus(); } catch { return { configured: false, model: null, via: null }; }
}

function musicCacheKey(chapter, mood) {
  const crypto = require("node:crypto");
  const m = String(mood || "calm").trim();
  return crypto.createHash("sha256").update(`music::${m}::${String(chapter || "").slice(0, 120)}`).digest("hex").slice(0, 16);
}

router.get("/status", async (req, res) => {
  res.json({ music: musicStatus() });
});

// GET /api/music/loop?chapter=...&mood=calm
// Returns { uploadId, url }. Cache hit is instant, no spend.
router.get("/loop", auth.authRequired, async (req, res, next) => {
  try {
    if (!musicReady()) return bad(res, "music_not_configured", 503);
    const chapter = String(req.query.chapter || "").trim().slice(0, 120);
    if (!chapter) return bad(res, "chapter_required");
    const mood = String(req.query.mood || "calm").trim().slice(0, 20);
    const hash = musicCacheKey(chapter, mood);
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `music-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    return bad(res, "music_not_cached", 404);
  } catch (err) { next(err); }
});

// POST /api/music/loop { chapter, mood }
// Generate and cache one loop. 202 on new generation, 200 on cache hit.
router.post("/loop", auth.parentOnly, async (req, res, next) => {
  try {
    if (!musicReady()) return bad(res, "music_not_configured", 503);
    const chapter = String((req.body && req.body.chapter) || "").trim().slice(0, 120);
    if (!chapter) return bad(res, "chapter_required");
    const mood = String((req.body && req.body.mood) || "calm").trim().slice(0, 20);
    const hash = musicCacheKey(chapter, mood);
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `music-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    const { generateMusicLoop } = require("../lib/providers/kie-music");
    const r = await generateMusicLoop({ chapter: { title: chapter, hook: "" }, mood, durationSec: 12 });
    const buf = r.buffer || (r.url ? await (async () => { const { fetchT } = require("../http"); const rr = await fetchT(r.url, {}, { timeoutMs: 30000, retries: 1 }); return Buffer.from(await rr.arrayBuffer()); })() : null);
    if (!buf) return bad(res, "music_no_audio", 503);
    const saved = await store.save(req.user.familyId, "audio/mpeg", buf);
    const { rows } = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by) values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6) returning id`,
      [req.user.familyId, saved.bytes, saved.key, `music-${hash}.mp3`, `${chapter} music`, req.user.id]
    );
    res.status(201).json({ uploadId: Number(rows[0].id), url: `/media/${rows[0].id}`, cached: false });
  } catch (err) {
    if (String(err.message).includes("kie_music")) return bad(res, String(err.message).split(":")[0], 503);
    next(err);
  }
});

module.exports = router;
