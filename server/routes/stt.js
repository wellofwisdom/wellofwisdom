// SPDX-License-Identifier: AGPL-3.0-or-later
// Speech input. A learner holds a button (or the space bar), a short answer
// is recorded, and this turns it into text through an OpenAI-compatible
// transcription endpoint. The transcript goes back to the client, which shows
// it and waits for the learner to confirm before anything is graded.
//
// Two rules shape the file:
//   1. Audio is never written to disk unless the family turned recordings on.
//      This is a child's voice; the default is that it exists for one request.
//   2. The provider is optional. Without one the client falls back to the
//      browser's own recogniser (see web/src/components/PushToTalk.tsx) and
//      /status says so, rather than showing a control that cannot work.
//
// The body is the audio itself (raw), the same trick as /api/uploads: no
// multipart library, no new dependency. A multipart body is also accepted so
// curl and the browser's FormData work, parsed here for one file part.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const aiusage = require("../lib/aiusage");
const aiConfig = require("../lib/aiConfig");
const aiLimits = require("../lib/aiLimits");
const speech = require("../lib/speech");
const store = require("../lib/uploads");
const sttProvider = require("../lib/providers/stt-openai");

const router = express.Router();

// An answer is seconds long. 8 MB is generous for 16 kHz mono and keeps a
// runaway recording from filling memory.
const MAX_MB = Number(process.env.STT_MAX_UPLOAD_MB || 8);

// The loudest thing a short answer should ever produce. Guards the answer box
// and the tutor composer against a provider that returns a wall of text.
const MAX_CHARS = 4000;

const KINDS = ["text", "numeric", "mcq"];

const rawAudio = express.raw({
  type: (req) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    return ct.startsWith("audio/") || ct.startsWith("video/webm") || ct.startsWith("multipart/form-data") || ct.startsWith("application/octet-stream");
  },
  limit: `${MAX_MB}mb`,
});

const EXT = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function extFor(mime) {
  const clean = String(mime || "").split(";")[0].trim().toLowerCase();
  return EXT[clean] || "webm";
}

/**
 * The mime the audio really is. Chrome labels an audio-only MediaRecorder
 * file audio/webm, Safari says audio/mp4, Firefox says audio/ogg, and a raw
 * client may say nothing at all. A video/webm label shows up when a recorder
 * was started with a video track, which is still playable as audio.
 */
function cleanMime(mime) {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("audio/")) return base;
  if (base === "video/webm") return "audio/webm";
  if (base === "video/mp4") return "audio/mp4";
  if (base === "video/ogg") return "audio/ogg";
  return "audio/webm";
}

function pickKind(...candidates) {
  for (const c of candidates) {
    const v = String(c == null ? "" : c).trim().toLowerCase();
    if (KINDS.includes(v)) return v;
  }
  return "text";
}

/**
 * One file part out of a multipart/form-data body, plus any text fields.
 * Written here rather than pulled in as a dependency: the app takes exactly
 * one file per request and never needs the rest of the specification.
 */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ""));
  const boundary = m && String(m[1] || m[2] || "").trim();
  const fields = {};
  let file = null;
  if (!boundary) return { fields, file };
  const delim = Buffer.from(`--${boundary}`);
  let at = buffer.indexOf(delim);
  while (at !== -1) {
    let start = at + delim.length;
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break; // closing "--"
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
    const next = buffer.indexOf(delim, start);
    if (next === -1) break;
    let end = next;
    if (buffer[end - 2] === 0x0d && buffer[end - 1] === 0x0a) end -= 2;
    const headEnd = buffer.indexOf("\r\n\r\n", start);
    if (headEnd !== -1 && headEnd < end) {
      const headers = buffer.toString("utf8", start, headEnd);
      const body = buffer.subarray(headEnd + 4, end);
      const name = /name="([^"]*)"/i.exec(headers);
      const filename = /filename="([^"]*)"/i.exec(headers);
      const type = /content-type:\s*([^\r\n]+)/i.exec(headers);
      if (filename) {
        if (!file) {
          file = {
            buffer: body,
            filename: String(filename[1] || "").slice(0, 120) || "answer",
            mime: type ? type[1].trim() : "application/octet-stream",
          };
        }
      } else if (name && name[1]) {
        fields[String(name[1])] = body.toString("utf8").trim().slice(0, 200);
      }
    }
    at = next;
  }
  return { fields, file };
}

/**
 * Keep this recording? The family's own switch wins when it is set, so a
 * household can turn recordings off (or on) for itself; otherwise the
 * instance setting in the vault decides. Off by default: a child's voice
 * should not pile up on a disk because nobody chose anything.
 */
async function keepRecordingsFor(familyId) {
  if (db.configured()) {
    const r = await db.query("select prefs from families where id = $1", [familyId]).catch(() => ({ rows: [] }));
    const prefs = (r.rows[0] && r.rows[0].prefs) || {};
    if (typeof prefs.keepRecordings === "boolean") return prefs.keepRecordings;
  }
  const cfg = await aiConfig.resolveConfig().catch(() => null);
  return Boolean(cfg && cfg.sttKeepRecordings);
}

/** Enough for the client to choose between the server and the browser. */
router.get("/status", auth.authRequired, async (req, res, next) => {
  try {
    const st = await sttProvider.status();
    const lim = await aiLimits.limits();
    res.json({ configured: st.configured, provider: st.configured ? st.provider : null, model: st.model, dailyCap: lim.sttDaily || 0 });
  } catch (err) {
    next(err);
  }
});

/** The guide's vault card: the settings, with the key masked like every other. */
router.get("/config", auth.parentOnly, async (req, res, next) => {
  try {
    const cfg = (await aiConfig.resolveConfig()) || {};
    const st = await sttProvider.status();
    res.json({
      configured: st.configured,
      config: aiConfig.mask({
        sttBaseUrl: cfg.sttBaseUrl || "",
        sttApiKey: cfg.sttApiKey || "",
        sttModel: cfg.sttModel || "",
        aiSttDailyCap: cfg.aiSttDailyCap || 0,
        sttKeepRecordings: Boolean(cfg.sttKeepRecordings),
      }),
    });
  } catch (err) {
    next(err);
  }
});
router.put("/config", auth.parentOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const fields = {};
    for (const key of ["sttBaseUrl", "sttApiKey", "sttModel"]) {
      if (b[key] !== undefined && b[key] !== null) fields[key] = String(b[key]).trim().slice(0, 300);
    }
    if (b.aiSttDailyCap !== undefined && b.aiSttDailyCap !== null && String(b.aiSttDailyCap).trim() !== "") {
      const n = Number(b.aiSttDailyCap);
      if (!Number.isFinite(n) || n < 0) return bad(res, "stt_cap_invalid");
      fields.aiSttDailyCap = n;
    }
    if (b.sttKeepRecordings !== undefined) fields.sttKeepRecordings = Boolean(b.sttKeepRecordings);
    const saved = await aiConfig.saveStt(fields);
    if (!saved.ok) return bad(res, saved.error, saved.code || 400);
    res.json({ ok: true, configured: Boolean(fields.sttBaseUrl || (await sttProvider.status()).configured) });
  } catch (err) {
    next(err);
  }
});

router.post("/", auth.authRequired, rawAudio, async (req, res, next) => {
  try {
    const ct = String(req.get("content-type") || "");
    let audio = null;
    let mime = null;
    let filename = null;
    let fields = {};
    if (ct.toLowerCase().startsWith("multipart/form-data")) {
      const parsed = parseMultipart(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), ct);
      fields = parsed.fields;
      if (parsed.file) {
        audio = parsed.file.buffer;
        mime = parsed.file.mime;
        filename = parsed.file.filename;
      }
    } else if (Buffer.isBuffer(req.body) && req.body.length) {
      audio = req.body;
      mime = ct.split(";")[0].trim() || "audio/webm";
      filename = String(req.get("x-stt-name") || "").slice(0, 120) || `answer.${extFor(mime)}`;
    }
    if (!audio || !audio.length) return bad(res, "no_audio");
    mime = cleanMime(mime);

    // Only a family member may spend the family's speech budget. Observers
    // are stopped earlier, by the read-only guard on every non-GET /api call.
    if (!req.user.familyId) return bad(res, "auth_required", 401);
    const st = await sttProvider.status();
    if (!st.configured) return bad(res, "stt_not_configured", 503);

    const kind = pickKind(fields.kind, req.query.kind, req.get("x-stt-kind"));
    const count = Math.max(0, Math.min(26, Number(fields.choices || req.query.choices || req.get("x-stt-choices") || 0) || 0));
    const language = String(fields.language || req.query.language || req.get("x-stt-language") || "").trim().slice(0, 12) || null;

    const lim = await aiLimits.checkStt(req.user.familyId);
    if (!lim.ok) return bad(res, lim.reason, 429);

    const out = await sttProvider.transcribe({ buffer: audio, mime, filename, language });
    const raw = String(out.text).slice(0, MAX_CHARS).trim();
    const norm = speech.normalizeForKind(raw, kind, count);

    // The call is logged even when a provider reports no tokens: a guide sees
    // "stt" in the spend list, and the daily call cap counts it. Speech is
    // priced per minute by every provider, so the cost stays unset rather than
    // invented from a token count that does not exist.
    aiusage.logUsage({
      familyId: req.user.familyId,
      task: "stt",
      model: out.model,
      tokensIn: 0,
      tokensOut: 0,
      note: `speech ${kind}${out.durationSec ? ` ${Math.round(out.durationSec)}s` : ""}`,
    });

    let kept = false;
    if (await keepRecordingsFor(req.user.familyId)) {
      // Only a mime the upload store accepts can be kept. Anything else is
      // transcribed and dropped, which is better than a failed answer.
      if (store.typeFor(mime)) {
        try {
          const saved = await store.save(req.user.familyId, mime, audio);
          await db.query(
            `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by)
             values ($1,'audio',$2,$3,$4,$5,$6,$7)`,
            [req.user.familyId, mime.split(";")[0], saved.bytes, saved.key, filename, `Spoken answer (${kind})`, req.user.id]
          );
          kept = true;
        } catch (err) {
          console.error(`[stt] recording not kept (ignored): ${err.message}`);
        }
      }
    }

    res.json({
      text: norm.text,
      transcript: norm.transcript,
      kind: norm.kind,
      choiceIndex: norm.choiceIndex,
      language: out.language || null,
      confidence: out.confidence,
      kept,
    });
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("stt_not_configured")) return bad(res, "stt_not_configured", 503);
    if (msg.includes("stt_no_speech")) return bad(res, "stt_no_speech", 422);
    if (msg.includes("stt_empty_audio")) return bad(res, "no_audio");
    if (msg.startsWith("stt_http_")) {
      // The provider's own status is useful, their body is not: it can name
      // the account. Keep the number, drop the text.
      const found = msg.match(/stt_http_(\d{3})/);
      const status = found ? Number(found[1]) : 502;
      console.error(`[stt] provider error ${status}`);
      return bad(res, "stt_provider_error", status === 429 ? 429 : 502);
    }
    next(err);
  }
});

module.exports = router;
module.exports.parseMultipart = parseMultipart;
module.exports.keepRecordingsFor = keepRecordingsFor;
