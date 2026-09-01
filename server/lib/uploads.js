// SPDX-License-Identifier: AGPL-3.0-or-later
// File storage for uploaded media — video first (a NotebookLM export, a
// recorded explainer, a boss-fight clip), plus images and audio.
//
// Files go on disk under UPLOAD_DIR, which must be a persistent volume: the
// container filesystem is replaced on every deploy. The database row is the
// index and the permission record; the path on disk is derived here and never
// taken from a request, so a crafted key cannot escape the upload directory.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "data", "uploads"));

// What a browser can actually play back, and nothing else. An allowlist keeps
// the store from becoming a general-purpose file host.
const TYPES = {
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "image/png": { kind: "image", ext: "png" },
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/webm": { kind: "audio", ext: "weba" },
  "audio/wav": { kind: "audio", ext: "wav" },
};

const MAX_BYTES = {
  video: Number(process.env.UPLOAD_MAX_VIDEO_MB || 500) * 1024 * 1024,
  image: Number(process.env.UPLOAD_MAX_IMAGE_MB || 20) * 1024 * 1024,
  audio: Number(process.env.UPLOAD_MAX_AUDIO_MB || 100) * 1024 * 1024,
};

function typeFor(mime) {
  return TYPES[String(mime || "").split(";")[0].trim().toLowerCase()] || null;
}

function acceptedMimes() {
  return Object.keys(TYPES);
}

function maxBytesFor(kind) {
  return MAX_BYTES[kind] || MAX_BYTES.image;
}

/** A key the caller cannot influence: family folder + random name. */
function newKey(familyId, ext) {
  return `${Number(familyId)}/${crypto.randomUUID()}.${ext}`;
}

/** Resolve a stored key to an absolute path, refusing anything that escapes
 *  ROOT. Keys come from our own database, but this is the last line before
 *  the filesystem, so it checks anyway. */
function resolveKey(key) {
  const abs = path.resolve(ROOT, String(key || ""));
  const rel = path.relative(ROOT, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

async function ensureRoot() {
  await fsp.mkdir(ROOT, { recursive: true });
}

/** Write a buffer to a fresh key. Returns { key, bytes }. */
async function save(familyId, mime, buffer) {
  const t = typeFor(mime);
  if (!t) throw new Error("unsupported_type");
  if (!buffer || !buffer.length) throw new Error("empty_body");
  if (buffer.length > maxBytesFor(t.kind)) throw new Error("too_large");

  const key = newKey(familyId, t.ext);
  const abs = resolveKey(key);
  if (!abs) throw new Error("bad_key");
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
  return { key, bytes: buffer.length, kind: t.kind };
}

async function remove(key) {
  const abs = resolveKey(key);
  if (!abs) return;
  await fsp.unlink(abs).catch(() => {});
}

async function statKey(key) {
  const abs = resolveKey(key);
  if (!abs) return null;
  return fsp.stat(abs).catch(() => null);
}

/** Parse a single-range "bytes=start-end" header against a known size.
 *  Returns null for no/!unsatisfiable range, so the caller sends the whole file. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  let start;
  let end;
  if (rawStart === "") {
    // suffix form: last N bytes
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/** Stream a file to a response, honouring Range so video seeking works.
 *  Without this, scrubbing a video does nothing and Safari refuses to play. */
async function stream(res, key, mime, { rangeHeader, download } = {}) {
  const abs = resolveKey(key);
  if (!abs) return false;
  const st = await fsp.stat(abs).catch(() => null);
  if (!st || !st.isFile()) return false;

  res.setHeader("Content-Type", mime || "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (download) res.setHeader("Content-Disposition", `attachment; filename="${download.replace(/[^\w.\-]/g, "_")}"`);

  const range = parseRange(rangeHeader, st.size);
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
    fs.createReadStream(abs, { start: range.start, end: range.end }).pipe(res);
    return true;
  }
  res.setHeader("Content-Length", st.size);
  fs.createReadStream(abs).pipe(res);
  return true;
}

/** Total bytes a family is using — for a quota, and for an honest Settings row. */
async function familyUsage(db, familyId) {
  const { rows } = await db.query(
    "select coalesce(sum(bytes),0)::bigint as bytes, count(*)::int as files from uploads where family_id = $1",
    [familyId]
  );
  return { bytes: Number(rows[0].bytes), files: rows[0].files };
}

module.exports = {
  ROOT, TYPES, typeFor, acceptedMimes, maxBytesFor, newKey, resolveKey,
  ensureRoot, save, remove, statKey, parseRange, stream, familyUsage,
};
