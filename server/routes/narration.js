// SPDX-License-Identifier: AGPL-3.0-or-later
// Narration: server TTS cache. The world should speak without paying twice.
// A scene is rendered once via kie.ai Gemini 3.1 Flash TTS (same kie key as
// images), cached as an audio file in UPLOAD_DIR, row in uploads, streamed
// from /media/:id. Also accepts Google Cloud TTS as fallback. Browser
// speechSynthesis remains the client fallback. Fail soft per track, same
// posture as kie images.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const storage = require("../lib/storage");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function ttsCacheKey(text, voice) {
  const crypto = require("node:crypto");
  return crypto.createHash("sha256").update(`${voice}::${String(text).slice(0, 4000)}`).digest("hex").slice(0, 16);
}

function ttsReady() {
  try {
    const kv = require("../lib/providers/kie-voice");
    if (kv.kieVoiceConfigured()) return true;
  } catch {}
  try {
    return require("../lib/providers/google-tts").ttsConfigured();
  } catch { return false; }
}

function ttsStatus() {
  try {
    const kv = require("../lib/providers/kie-voice");
    const s = kv.kieVoiceStatus();
    if (s.configured) return s;
  } catch {}
  try { return require("../lib/providers/google-tts").ttsStatus(); } catch { return { configured: false, via: null }; }
}

function voiceForNarrator() {
  try {
    const kv = require("../lib/providers/kie-voice");
    if (kv.kieVoiceConfigured()) return kv.voiceFor("narrator");
  } catch {}
  try { return require("../lib/providers/google-tts").voiceFor("narrator"); } catch { return "narrator"; }
}

async function synthesizeWithCache(text, voice) {
  try {
    const kv = require("../lib/providers/kie-voice");
    if (kv.kieVoiceConfigured()) {
      const r = await kv.synthesizeOnKie({ text, voice });
      if (r.buffer) return r.buffer;
      if (r.url) return await kv.fetchAudioBuffer(r.url);
    }
  } catch (e) {
    if (String(e.message || "").includes("kie_voice_no_url")) throw e;
    // fall through to Google TTS
  }
  const gv = require("../lib/providers/google-tts");
  return await gv.synthesize({ text, voice });
}

router.get("/status", async (req, res) => {
  res.json({ tts: ttsStatus() });
});

router.post("/synthesize", auth.parentOnly, async (req, res, next) => {
  try {
    if (!ttsReady()) return bad(res, "tts_not_configured", 503);
    const text = String((req.body && req.body.text) || "").trim().slice(0, 4000);
    if (!text) return bad(res, "text_required");
    const voice = String((req.body && req.body.voice) || voiceForNarrator()).slice(0, 80);
    const title = String((req.body && req.body.title) || text.slice(0, 80)).slice(0, 160);
    const hash = ttsCacheKey(text, voice);
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `tts-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    const buf = await synthesizeWithCache(text, voice);
    const saved = await storage.put(req.user.familyId, "audio/mpeg", buf);
    const { rows } = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by) values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6) returning id`,
      [req.user.familyId, saved.bytes, saved.key, `tts-${hash}.mp3`, `${title} narration`, req.user.id]
    );
    res.status(201).json({ uploadId: Number(rows[0].id), url: `/media/${rows[0].id}`, cached: false });
  } catch (err) {
    if (String(err.message).includes("tts_not_configured")) return bad(res, "tts_not_configured", 503);
    if (String(err.message).startsWith("tts_")) return bad(res, String(err.message).split(":")[0], 503);
    if (String(err.message).startsWith("kie_voice_")) return bad(res, String(err.message).split(":")[0], 503);
    next(err);
  }
});

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
    if (!ttsStatus().configured) return bad(res, "tts_not_configured", 503);
    const voice = voiceForNarrator();
    const hash = ttsCacheKey(text, voice);
    const cached = await db.query(
      `select id from uploads where family_id = $1 and original_name = $2 limit 1`,
      [req.user.familyId, `tts-${hash}.mp3`]
    ).catch(() => ({ rows: [] }));
    if (cached.rows[0]) return res.json({ uploadId: Number(cached.rows[0].id), url: `/media/${cached.rows[0].id}`, cached: true });
    const buf = await synthesizeWithCache(text, voice);
    const saved = await storage.put(req.user.familyId, "audio/mpeg", buf);
    const ins = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by) values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6) returning id`,
      [req.user.familyId, saved.bytes, saved.key, `tts-${hash}.mp3`, `${String(row.title).slice(0, 80)} narration`, req.user.id]
    );
    res.json({ uploadId: Number(ins.rows[0].id), url: `/media/${ins.rows[0].id}`, cached: false });
  } catch (err) {
    if (String(err.message).includes("tts_not_configured")) return bad(res, "tts_not_configured", 503);
    next(err);
  }
});

module.exports = router;
