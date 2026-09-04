// SPDX-License-Identifier: AGPL-3.0-or-later
// Captions for uploaded media. Two ways in: a guide uploads or edits a WebVTT
// track (free, always available), or a speech-to-text pass generates one (a
// job, only when an STT key is configured, so it never spends money silently).
// Either way the result is a WebVTT string on the uploads row.
const CAPTION_MAX_MB = Number(process.env.STT_MAX_MB || 100);

// Accept a WebVTT file, or coerce something close to one into a valid file.
// A caption track is only useful if it carries cue timings, so text with no
// "-->" is rejected rather than saved as a track that would show nothing.
// Returns the normalised VTT string, or null if it is not a caption track.
function normalizeVtt(text) {
  let t = String(text == null ? "" : text)
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!t) return null;
  if (!/^WEBVTT\b/.test(t)) {
    if (!t.includes("-->")) return null; // no cues: not a caption file
    t = "WEBVTT\n\n" + t;
  }
  // Cap the stored size. A real transcript is a few tens of KB; anything past
  // this is a mistake or an attack, not a caption track.
  return t.slice(0, 1000000);
}

function tooLargeForStt(bytes) {
  return Number(bytes) > CAPTION_MAX_MB * 1024 * 1024;
}

// Run the speech-to-text pass for one upload and store the result. Called from
// the job queue, so a slow provider never blocks a request. The job wrapper
// marks the row 'failed' if this throws; here we only write a success.
async function generate({ uploadId, familyId }) {
  const db = require("./db");
  const store = require("./uploads");
  const media = require("./media");
  const fsp = require("node:fs/promises");

  const { rows } = await db.query(
    `select id, family_id, kind, mime, bytes, storage_key, original_name, captions_lang
       from uploads where id = $1 and family_id = $2`,
    [Number(uploadId), familyId]
  );
  const up = rows[0];
  if (!up) throw new Error("upload_not_found");
  if (up.kind !== "video" && up.kind !== "audio") throw new Error("not_media");
  if (tooLargeForStt(up.bytes)) throw new Error(`too_large_for_stt_${CAPTION_MAX_MB}mb`);

  const abs = store.resolveKey(up.storage_key);
  if (!abs) throw new Error("file_missing");
  const buffer = await fsp.readFile(abs).catch(() => null);
  if (!buffer) throw new Error("file_missing");

  const raw = await media.transcribe({
    buffer,
    filename: up.original_name || `upload-${up.id}`,
    mime: up.mime,
    language: up.captions_lang || undefined,
  });
  const vtt = normalizeVtt(raw);
  if (!vtt) throw new Error("stt_empty");

  await db.query(
    `update uploads set captions_vtt = $1, captions_status = 'ready',
       captions_source = 'auto', captions_error = null
      where id = $2 and family_id = $3`,
    [vtt, up.id, familyId]
  );
  return { uploadId: Number(up.id), chars: vtt.length };
}

module.exports = { normalizeVtt, tooLargeForStt, generate, CAPTION_MAX_MB };
