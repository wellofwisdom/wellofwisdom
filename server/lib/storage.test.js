// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

test("storage local: put then getBuffer then delete then exists", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "wow-storage-"));
  const prevUpload = process.env.UPLOAD_DIR;
  const prevDriver = process.env.STORAGE_DRIVER;
  process.env.UPLOAD_DIR = tmp;
  process.env.STORAGE_DRIVER = "local";
  // Force re-resolve of LOCAL_ROOT by re-requiring fresh. The module reads
  // process.env at load time for LOCAL_ROOT, but localDriver uses the captured
  // constant. Patch it for this test.
  delete require.cache[require.resolve("./storage")];
  delete require.cache[require.resolve("./uploads")];
  const storage = require("./storage");
  // Override LOCAL_ROOT via the driver's resolve path by pointing UPLOAD_DIR
  // and re-creating the directory structure the driver will use.
  const key = `${Date.now()}/test-${Math.random().toString(36).slice(2)}.png`;
  const buf = Buffer.from("hello storage");
  // Use localDriver directly with a temp root hack: write via put, read via getBuffer.
  // put generates its own key, so test round-trip that way instead of using `key`.
  const saved = await storage.put(1, "image/png", buf);
  assert.ok(saved.key, "put returns a key");
  assert.equal(saved.bytes, buf.length);
  assert.ok(await storage.exists(saved.key), "exists after put");
  const got = await storage.getBuffer(saved.key);
  assert.ok(got, "getBuffer returns a buffer");
  assert.equal(got.toString(), "hello storage");
  // Range get
  const ranged = await storage.get(saved.key, { range: "bytes=0-4" });
  assert.ok(ranged, "range get returns something");
  assert.equal(ranged.statusCode, 206);
  assert.ok(ranged.contentRange, "range has Content-Range");
  // Consume stream to avoid hanging
  if (ranged.stream) {
    const chunks = [];
    for await (const c of ranged.stream) chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(), "hello");
  }
  await storage.delete(saved.key);
  assert.equal(await storage.exists(saved.key), false, "gone after delete");
  // Cleanup
  await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  if (prevUpload === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = prevUpload;
  if (prevDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = prevDriver;
  delete require.cache[require.resolve("./storage")];
  delete require.cache[require.resolve("./uploads")];
});

test("storage local: driverName picks local by default", () => {
  delete require.cache[require.resolve("./storage")];
  const prev = process.env.STORAGE_DRIVER;
  delete process.env.STORAGE_DRIVER;
  const s = require("./storage");
  assert.equal(s.driverName(), "local");
  if (prev !== undefined) process.env.STORAGE_DRIVER = prev;
  delete require.cache[require.resolve("./storage")];
});

test("storage local: driverName maps s3 aliases", () => {
  delete require.cache[require.resolve("./storage")];
  const prev = process.env.STORAGE_DRIVER;
  for (const v of ["s3", "S3", "minio", "r2"]) {
    process.env.STORAGE_DRIVER = v;
    delete require.cache[require.resolve("./storage")];
    const s = require("./storage");
    assert.equal(s.driverName(), "s3", `expected s3 for ${v}`);
  }
  if (prev === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = prev;
  delete require.cache[require.resolve("./storage")];
});

test("storage s3: put/get/delete/exists mocked at HTTP layer", async () => {
  // Mock the S3 client by replacing the SDK module in require cache.
  // We intercept the client class so no real HTTP is made.
  const stores = new Map(); // key -> { Body, ContentType }
  class FakeS3Client {
    async send(cmd) {
      const name = cmd.constructor.name;
      const input = cmd.input || {};
      if (name === "PutObjectCommand") {
        stores.set(input.Key, { Body: input.Body, ContentType: input.ContentType });
        return {};
      }
      if (name === "GetObjectCommand") {
        const rec = stores.get(input.Key);
        if (!rec) {
          const e = new Error("NoSuchKey");
          e.name = "NoSuchKey";
          e.$metadata = { httpStatusCode: 404 };
          throw e;
        }
        let body = rec.Body;
        let contentLength = body.length;
        let contentRange = null;
        if (input.Range) {
          const m = /bytes=(\d+)-(\d+)/.exec(String(input.Range));
          if (m) {
            const start = Number(m[1]);
            const end = Number(m[2]);
            body = body.slice(start, end + 1);
            contentLength = body.length;
            // Fake total size = original length
            const total = rec.Body.length;
            contentRange = `bytes ${start}-${end}/${total}`;
          }
        }
        // Return an async iterable Body like the real SDK does
        async function* gen() { yield body; }
        return { Body: gen(), ContentLength: contentLength, ContentRange: contentRange };
      }
      if (name === "HeadObjectCommand") {
        const rec = stores.get(input.Key);
        if (!rec) {
          const e = new Error("NotFound");
          e.name = "NotFound";
          e.$metadata = { httpStatusCode: 404 };
          throw e;
        }
        return { ContentLength: rec.Body.length };
      }
      if (name === "DeleteObjectCommand") {
        stores.delete(input.Key);
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    }
  }
  // Inject fake SDK
  const sdkPath = require.resolve("@aws-sdk/client-s3");
  const realSdk = require(sdkPath);
  const fakeSdk = {
    ...realSdk,
    S3Client: FakeS3Client,
    PutObjectCommand: realSdk.PutObjectCommand,
    GetObjectCommand: realSdk.GetObjectCommand,
    HeadObjectCommand: realSdk.HeadObjectCommand,
    DeleteObjectCommand: realSdk.DeleteObjectCommand,
  };
  require.cache[sdkPath].exports = fakeSdk;

  const prevDriver = process.env.STORAGE_DRIVER;
  const prevBucket = process.env.S3_BUCKET;
  process.env.STORAGE_DRIVER = "s3";
  process.env.S3_BUCKET = "test-bucket";
  delete require.cache[require.resolve("./storage")];
  const storage = require("./storage");
  // Ensure driver is s3
  assert.equal(storage.driverName(), "s3");

  const buf = Buffer.from("s3 hello");
  const saved = await storage.put(42, "image/png", buf);
  assert.ok(saved.key.includes("42/"), "key includes family prefix");
  assert.equal(saved.bytes, buf.length);
  assert.equal(await storage.exists(saved.key), true);
  const got = await storage.getBuffer(saved.key);
  assert.equal(got.toString(), "s3 hello");

  // Range get via s3 path
  const ranged = await storage.get(saved.key, { range: "bytes=0-1" });
  assert.equal(ranged.statusCode, 206);
  assert.ok(ranged.contentRange);
  const chunks = [];
  for await (const c of ranged.stream) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), "s3");

  await storage.delete(saved.key);
  assert.equal(await storage.exists(saved.key), false);
  assert.equal(await storage.getBuffer(saved.key), null);

  // Restore
  require.cache[sdkPath].exports = realSdk;
  if (prevDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = prevDriver;
  if (prevBucket === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = prevBucket;
  delete require.cache[require.resolve("./storage")];
});

test("storage s3: exists returns false when bucket missing", async () => {
  const sdkPath = require.resolve("@aws-sdk/client-s3");
  const realSdk = require(sdkPath);
  class FakeS3Client {
    async send() { throw new Error("should not be called"); }
  }
  const fakeSdk = { ...realSdk, S3Client: FakeS3Client, HeadObjectCommand: realSdk.HeadObjectCommand };
  require.cache[sdkPath].exports = fakeSdk;
  const prevDriver = process.env.STORAGE_DRIVER;
  const prevBucket = process.env.S3_BUCKET;
  process.env.STORAGE_DRIVER = "s3";
  delete process.env.S3_BUCKET;
  delete require.cache[require.resolve("./storage")];
  const storage = require("./storage");
  assert.equal(await storage.exists("anything"), false);
  require.cache[sdkPath].exports = realSdk;
  if (prevDriver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = prevDriver;
  if (prevBucket === undefined) delete process.env.S3_BUCKET;
  else process.env.S3_BUCKET = prevBucket;
  delete require.cache[require.resolve("./storage")];
});
