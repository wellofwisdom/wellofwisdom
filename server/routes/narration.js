// SPDX-License-Identifier: AGPL-3.0-or-later
// Narration: server TTS cache. The world should speak without paying twice.
// A scene is rendered once via Google Cloud TTS (when configured), cached as
// an audio file in UPLOAD_DIR, row in uploads, streamed from /media/:id.
// Browser speechSynthesis remains the fallback. Cost per chapter, fail soft
// per track, same posture as kie images.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const store = require("../lib/uploads");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Hash the text + voice so the same scene does not generate twice. The row
// is the cache key: title + hash + voice, family-scoped.
function ttsCacheKey(text, voice) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(`${voice}::${String(text).slice(0, 4000)}`).digest("hex").slice(0, 16);
}

function ttsReady() {
  try {
    return require("../lib/providers/google-tts").ttsConfigured();
  } catch {
    return false;
  }
}

router.get("/status", async (req, res) => {
  const tts = (() => {
    try { return require("../lib/providers/google-tts").ttsStatus(); } catch { return { configured: false, via: null }; }
  })();
  res.json({ tts });
});

// POST /api/narration/synthesize { text, voice, title }
// Returns { uploadId, url }. Cache hit returns immediately, no AI call.
router.post("/synthesize", auth.parentOnly, async (req, res, next) => {
  try {
    if (!ttsReady()) return bad(res, "tts_not_configured", 503);
    const text = String((req.body && req.body.text) || "").trim().slice(0, 4000);
    if (!text) return bad(res, "text_required");
    const { voiceFor } = require("../lib/providers/google-tts");
    const voice = String((req.body && req.body.voice) || voiceFor("narrator")).slice(0, 80);
    const title = String((req.body && req.body.title) || text.slice(0, 80)).slice(0, 160);
    const hash = ttsCacheKey(text, voice);

    // Cache hit: same family, same hash + voice, most recent.
    const hit = await db.query(
      `select id from uploads where family_id = $1 and kind = 'audio' and title = $2 and storage_key like $3 || '%' order by created_at desc limit 1`,
      [req.user.familyId, hash, hash]
    ).catch(() => ({ rows: [] }));
    // Simpler: look up by known cache title pattern.
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `tts-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) {
      return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    }

    const { synthesize } = require("../lib/providers/google-tts");
    const buf = await synthesize({ text, voice });
    const saved = await store.save(req.user.familyId, "audio/mpeg", buf);
    const { rows } = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by)
       values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6)
       returning id`,
      [req.user.familyId, saved.bytes, saved.key, `tts-${hash}.mp3`, `${title} narration`, req.user.id]
    );
    res.status(201).json({ uploadId: Number(rows[0].id), url: `/media/${rows[0].id}`, cached: false });
  } catch (err) {
    if (String(err.message).includes("tts_not_configured")) return bad(res, "tts_not_configured", 503);
    if (String(err.message).startsWith("tts_")) return bad(res, String(err.message).split(":")[0], 503);
    next(err);
  }
});

// GET /api/narration/for-encounter/:id
// Convenience: produce or return a cached clip for one encounter's narration text.
router.get("/for-encounter/:id", auth.authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { rows } = await db.query(
      `select e.id, e.narration, e.title, a.family_id from adventure_encounters e join adventures a on a.id = e.adventure_id where e.id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) return bad(res, "not_found", 404);
    if (Number(row.family_id) !== Number(req.user.familyId)) return bad(res, "forbidden", 403);
    const text = String(row.narration || "").trim();
    if (!text) return bad(res, "no_narration", 404);
    const tts = (() => { try { return require("../lib/providers/google-tts").ttsStatus(); } catch { return { configured: false }; }})();
    if (!tts.configured) return bad(res, "tts_not_configured", 503);
    const { voiceFor, synthesize, ttsConfigured } = require("../lib/providers/google-tts");
    if (!ttsConfigured()) return bad(res, "tts_not_configured", 503);
    const voice = voiceFor("narrator");
    const hash = ttsCacheKey(text, voice);
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `tts-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    const buf = await synthesize({ text, voice });
    const saved = await store.save(req.user.familyId, "audio/mpeg", buf);
    const ins = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by)
       values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6) returning id`,
      [req.user.familyId, saved.bytes, saved.key, `tts-${hash}.mp3`, `${String(row.title).slice(0, 80)} narration`, req.user.id]
    );
    res.json({ uploadId: Number(ins.rows[0].id), url: `/media/${ins.rows[0].id}`, cached: false });
  } catch (err) {
    if (String(err.message).includes("tts_not_configured")) return bad(res, "tts_not_configured", 503);
    next(err);
  }
});

module.exports = router;
