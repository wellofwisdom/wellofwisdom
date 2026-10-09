// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal zip reader for the family import. Pairs with the archiver-based
// export in routes/family.js without adding a dependency: the repo keeps
// production deps to a short list, and node:zlib's inflateRaw covers the
// deflate method archiver writes. Supports the zip shapes our own export
// produces (store + deflate, no encryption, no zip64, no split archives).
//
// Safety: a zip arrives from a client, so it is hostile until proven
// otherwise. Entry and total size caps bound the classic deflate bomb, the
// central directory is walked with bounds checks, and every stored file's
// CRC32 is verified against the directory before the data is handed out.

const zlib = require("node:zlib");

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

// Ceiling for one decompressed entry and for the whole archive. The request
// body limit already bounds the compressed bytes; these bound what inflate
// can produce from them.
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 192 * 1024 * 1024;
const MAX_ENTRIES = 5000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  throw err;
}

// Standard CRC-32 (IEEE 802.3), same polynomial zip uses.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Find the End Of Central Directory record: scan back over a possible comment.
function findEOCD(buf) {
  const min = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

// Parse a zip buffer. Returns { files: Map<name, Buffer> }.
// Throws with a .code of zip_invalid or zip_too_big on anything unexpected.
function parse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) fail("zip_invalid", "not a zip file");
  const eocd = findEOCD(buf);
  if (eocd < 0) fail("zip_invalid", "zip end record not found");
  const entryCount = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (!entryCount) fail("zip_invalid", "zip has no entries");
  if (entryCount > MAX_ENTRIES) fail("zip_too_big", `zip has ${entryCount} entries, over the cap of ${MAX_ENTRIES}`);

  const files = new Map();
  let totalOut = 0;
  for (let n = 0; n < entryCount; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== SIG_CENTRAL) {
      fail("zip_invalid", "corrupt central directory");
    }
    const flags = buf.readUInt16LE(pos + 8);
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;
    if (pos > buf.length) fail("zip_invalid", "corrupt central directory");

    if (name.endsWith("/")) continue; // directory marker, no data
    if (files.has(name)) fail("zip_invalid", `duplicate entry: ${name}`);
    if (flags & 0x0001) fail("zip_invalid", `encrypted entry: ${name}`);
    if (flags & 0x0008) {
      // Data descriptor: sizes live after the data, not in the local header.
      // The central directory copies are authoritative, which is what we use.
    }
    if (uncompSize > MAX_ENTRY_BYTES) fail("zip_too_big", `entry too large: ${name}`);
    totalOut += uncompSize;
    if (totalOut > MAX_TOTAL_BYTES) fail("zip_too_big", "decompressed zip is over the total size cap");

    // Local header: its name and extra lengths can differ from the central
    // copies, so the data offset must come from the local record itself.
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      fail("zip_invalid", `corrupt local header for ${name}`);
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) fail("zip_invalid", `truncated entry: ${name}`);
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = Buffer.from(raw); // store: copy out so the caller's buffer can go away
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch {
        fail("zip_invalid", `entry does not inflate: ${name}`);
      }
    } else {
      fail("zip_invalid", `unsupported compression method ${method} for ${name}`);
    }
    if (data.length !== uncompSize) fail("zip_invalid", `size mismatch for ${name}`);
    if (crc32(data) !== crc) fail("zip_invalid", `checksum mismatch for ${name}`);
    files.set(name, data);
  }
  return { files };
}

function text(zip, name) {
  const data = zip.files.get(name);
  return data == null ? null : data.toString("utf8");
}

// JSON entry or null. Throws shape_invalid with the entry name when it does
// not parse, so the caller reports one consistent error code.
function json(zip, name) {
  const raw = text(zip, name);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(`entry is not valid JSON: ${name}`);
    err.code = "shape_invalid";
    throw err;
  }
}

module.exports = { parse, text, json, crc32, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, MAX_ENTRIES };
