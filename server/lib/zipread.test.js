// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert/strict");
const { ZipArchive } = require("archiver");
const zipread = require("./zipread");

// Build a zip the same way the family export route does, so the reader is
// proven against the exact writer it will meet in production.
// (archiver v8 is class-based: new ZipArchive(...), not archiver(...).)
function buildZip(files, level = 9) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level } });
    const chunks = [];
    archive.on("data", (c) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const f of files) archive.append(f.data, { name: f.name });
    archive.finalize();
  });
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

test("zipread: round trip through the archiver writer", async () => {
  const familyJson = JSON.stringify({ family: { name: "Fam" }, learners: [] });
  const buf = await buildZip([
    { name: "family.json", data: familyJson },
    { name: "courses/7.wow-course.json", data: JSON.stringify({ format: "wellofwisdom-course", title: "C" }) },
    { name: "uploads/3.png", data: PNG_BYTES },
  ]);
  const zip = zipread.parse(buf);
  assert.equal(zip.files.size, 3);
  assert.equal(zipread.text(zip, "family.json"), familyJson);
  assert.deepEqual(JSON.parse(zipread.text(zip, "courses/7.wow-course.json")), { format: "wellofwisdom-course", title: "C" });
  assert.deepEqual(zip.files.get("uploads/3.png"), PNG_BYTES);
  assert.equal(zipread.json(zip, "family.json").family.name, "Fam");
  assert.equal(zipread.json(zip, "nope.json"), null);
});

test("zipread: rejects a file that is not a zip", () => {
  assert.throws(() => zipread.parse(Buffer.from("hello world, definitely not a zip")), (e) => e.code === "zip_invalid");
  assert.throws(() => zipread.parse(Buffer.alloc(0)), (e) => e.code === "zip_invalid");
});

test("zipread: rejects a truncated zip", async () => {
  const buf = await buildZip([{ name: "a.txt", data: "some content that compresses" }]);
  assert.throws(() => zipread.parse(buf.subarray(0, buf.length - 12)), (e) => e.code === "zip_invalid");
});

test("zipread: catches a corrupted entry via CRC", async () => {
  // Store method (level 0) so the corrupted byte lands in the entry data
  // untouched by deflate, which makes the CRC flip deterministic. Local
  // headers run 30 bytes, the name "a.txt" adds 5, so byte 45 sits inside
  // the stored data.
  const buf = await buildZip([{ name: "a.txt", data: "stored not deflated content here" }], 0);
  const corrupted = Buffer.from(buf);
  corrupted[45] ^= 0xff;
  assert.throws(() => zipread.parse(corrupted), (e) => e.code === "zip_invalid");
});

test("zipread: rejects duplicate entry names", async () => {
  const buf = await buildZip([
    { name: "family.json", data: "{}" },
    { name: "family.json", data: "{}" },
  ]);
  assert.throws(() => zipread.parse(buf), (e) => e.code === "zip_invalid" && /duplicate/.test(e.message));
});

test("zipread: survives a deflate bomb attempt within the caps", async () => {
  // A zip of zeros: deflate crushes it far beyond its compressed size. The
  // reader must refuse once the decompressed size crosses the entry cap.
  const zeros = Buffer.alloc(zipread.MAX_ENTRY_BYTES + 1);
  const buf = await buildZip([{ name: "zeros.bin", data: zeros }]);
  assert.throws(() => zipread.parse(buf), (e) => e.code === "zip_too_big");
});
