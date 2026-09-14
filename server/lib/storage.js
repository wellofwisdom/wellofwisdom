// SPDX-License-Identifier: AGPL-3.0-or-later
// Storage adapter: local (UPLOAD_DIR) or s3 (any S3-compatible endpoint).
// Selected by STORAGE_DRIVER. Callers use the same four methods regardless
// of which driver is active, so uploads.js never knows where the bytes live.

const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");

// Reuse the same type table so the storage layer cannot accept a kind the
// HTTP layer rejected. Import lazily to avoid a cycle with uploads.js.
function typeInfo(mime) {
  try {
    const ups = require("./uploads");
    return ups.typeFor(mime);
  } catch {
    return null;
  }
}

// --- local driver ---------------------------------------------------------

const LOCAL_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "data", "uploads"));

function localResolveKey(key) {
  const abs = path.resolve(LOCAL_ROOT, String(key || ""));
  const rel = path.relative(LOCAL_ROOT, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

function localNewKey(familyId, ext) {
  return `${Number(familyId)}/${crypto.randomUUID()}.${ext}`;
}

const localDriver = {
  name: "local",
  // Put a buffer under a fresh key. Returns { key, bytes }.
  async put(familyId, mime, buffer) {
    const ups = require("./uploads");
    const t = ups.typeFor(mime);
    if (!t) throw new Error("unsupported_type");
    if (!buffer || !buffer.length) throw new Error("empty_body");
    const key = localNewKey(familyId, t.ext);
    const abs = localResolveKey(key);
    if (!abs) throw new Error("bad_key");
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buffer);
    return { key, bytes: buffer.length };
  },
  // Get a readable stream for a key, with optional byte range.
  // Returns { stream, size, mime } or null when missing.
  async get(key, { range } = {}) {
    const abs = localResolveKey(key);
    if (!abs) return null;
    const st = await fsp.stat(abs).catch(() => null);
    if (!st || !st.isFile()) return null;
    let stream;
    let size = st.size;
    let statusCode = 200;
    let contentRange = null;
    if (range) {
      const ups = require("./uploads");
      const parsed = ups.parseRange(range, st.size);
      if (parsed) {
        stream = fs.createReadStream(abs, { start: parsed.start, end: parsed.end });
        size = parsed.end - parsed.start + 1;
        statusCode = 206;
        contentRange = `bytes ${parsed.start}-${parsed.end}/${st.size}`;
      } else {
        stream = fs.createReadStream(abs);
      }
    } else {
      stream = fs.createReadStream(abs);
    }
    return { stream, size, statusCode, contentRange };
  },
  // Read the whole object into a buffer. Convenience for export.
  async getBuffer(key) {
    const abs = localResolveKey(key);
    if (!abs) return null;
    return fsp.readFile(abs).catch(() => null);
  },
  async delete(key) {
    const abs = localResolveKey(key);
    if (!abs) return;
    await fsp.unlink(abs).catch(() => {});
  },
  async exists(key) {
    const abs = localResolveKey(key);
    if (!abs) return false;
    const st = await fsp.stat(abs).catch(() => null);
    return Boolean(st && st.isFile());
  },
};

// --- s3 driver ------------------------------------------------------------
// Uses @aws-sdk/client-s3. That is the one new dependency this packet allows.
// The driver is lazy-loaded so the server boots fine when the package is not
// installed yet (local mode).

function s3Config() {
  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "us-east-1",
    accessKey: process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.S3_SECRET_KEY || "",
  };
}

function getS3Client() {
  let S3Client;
  try {
    ({ S3Client } = require("@aws-sdk/client-s3"));
  } catch {
    throw new Error("s3_not_installed: run npm install @aws-sdk/client-s3");
  }
  const cfg = s3Config();
  const opts = { region: cfg.region };
  if (cfg.endpoint) {
    opts.endpoint = cfg.endpoint;
    opts.forcePathStyle = true;
  }
  if (cfg.accessKey) {
    opts.credentials = { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey };
  }
  return new S3Client(opts);
}

function s3NewKey(familyId, ext) {
  return `${Number(familyId)}/${crypto.randomUUID()}.${ext}`;
}

const s3Driver = {
  name: "s3",
  async put(familyId, mime, buffer) {
    const ups = require("./uploads");
    const t = ups.typeFor(mime);
    if (!t) throw new Error("unsupported_type");
    if (!buffer || !buffer.length) throw new Error("empty_body");
    const key = s3NewKey(familyId, t.ext);
    const cfg = s3Config();
    if (!cfg.bucket) throw new Error("s3_bucket_missing");
    const client = getS3Client();
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    }));
    return { key, bytes: buffer.length };
  },
  async get(key, { range } = {}) {
    const cfg = s3Config();
    if (!cfg.bucket) return null;
    const client = getS3Client();
    const { GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
    // Use Head to get size when a range was requested, so we can build Content-Range.
    let totalSize = null;
    let parsedRange = null;
    if (range) {
      const ups = require("./uploads");
      // We need the object size to parse the range. Try Head first.
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        totalSize = Number(head.ContentLength);
        parsedRange = ups.parseRange(range, totalSize);
      } catch {
        parsedRange = null;
      }
    }
    const getParams = { Bucket: cfg.bucket, Key: key };
    if (parsedRange) {
      getParams.Range = `bytes=${parsedRange.start}-${parsedRange.end}`;
    } else if (range) {
      // Pass through raw range header even if we could not parse locally.
      getParams.Range = String(range);
    }
    try {
      const out = await client.send(new GetObjectCommand(getParams));
      const stream = out.Body;
      // out.ContentLength is the returned slice length when ranged, full size otherwise.
      const size = out.ContentLength != null ? Number(out.ContentLength) : totalSize;
      const statusCode = parsedRange ? 206 : 200;
      let contentRange = out.ContentRange || null;
      if (parsedRange && !contentRange && totalSize != null) {
        contentRange = `bytes ${parsedRange.start}-${parsedRange.end}/${totalSize}`;
      }
      return { stream, size, statusCode, contentRange };
    } catch (err) {
      if (err.name === "NoSuchKey" || err.$metadata && err.$metadata.httpStatusCode === 404) return null;
      throw err;
    }
  },
  async getBuffer(key) {
    const cfg = s3Config();
    if (!cfg.bucket) return null;
    const client = getS3Client();
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    try {
      const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      const chunks = [];
      for await (const chunk of out.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.name === "NoSuchKey" || err.$metadata && err.$metadata.httpStatusCode === 404) return null;
      throw err;
    }
  },
  async delete(key) {
    const cfg = s3Config();
    if (!cfg.bucket) return;
    const client = getS3Client();
    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })).catch(() => {});
  },
  async exists(key) {
    const cfg = s3Config();
    if (!cfg.bucket) return false;
    const client = getS3Client();
    const { HeadObjectCommand } = require("@aws-sdk/client-s3");
    try {
      await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
      return true;
    } catch (err) {
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata && err.$metadata.httpStatusCode === 404) return false;
      throw err;
    }
  },
};

// --- driver selection -----------------------------------------------------

function driverName() {
  const raw = String(process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
  if (raw === "s3" || raw === "minio" || raw === "r2") return "s3";
  return "local";
}

function getDriver() {
  return driverName() === "s3" ? s3Driver : localDriver;
}

// Convenience wrappers that dispatch to the active driver. uploads.js calls
// these so it never imports the S3 SDK directly.

async function put(familyId, mime, buffer) {
  return getDriver().put(familyId, mime, buffer);
}

async function get(key, opts) {
  return getDriver().get(key, opts);
}

async function getBuffer(key) {
  return getDriver().getBuffer(key);
}

async function del(key) {
  return getDriver().delete(key);
}

async function exists(key) {
  return getDriver().exists(key);
}

module.exports = {
  driverName, getDriver, localDriver, s3Driver,
  put, get, getBuffer, delete: del, exists,
  LOCAL_ROOT, s3Config,
};
