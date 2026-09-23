// SPDX-License-Identifier: AGPL-3.0-or-later
// Run the full node --test suite with DB_DRIVER=pglite against a temp dir.
// Usage: node scripts/test-pglite.js [extra node --test args]
//   node scripts/test-pglite.js server/lib/db.test.js   (one file, quick loop)
// PGlite's WASM module cannot be instantiated in parallel workers, so we run
// with --test-concurrency=1 to serialize test files.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-"));
console.log(`[test-pglite] DATA_DIR=${dir} DB_DRIVER=pglite`);
// The point of this gate is the embedded driver, so say clearly when the pg
// integration tests come along for the ride.
if (String(process.env.TEST_DATABASE_URL || "").trim()) {
  console.log("[test-pglite] note: TEST_DATABASE_URL is set, so the Postgres integration tests run too");
}
const env = { ...process.env, DB_DRIVER: "pglite", DATA_DIR: dir };
delete env.DATABASE_URL;
const args = ["--test", "--test-reporter=spec", "--test-concurrency=1", ...process.argv.slice(2)];

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

const child = spawn(process.execPath, args, { env, stdio: "inherit" });

// An interrupted run must not leave a temp database behind.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {}
    cleanup();
    console.log(`[test-pglite] interrupted (${sig}), temp dir removed`);
    process.exit(130);
  });
}

child.on("close", (code) => {
  cleanup();
  console.log(`[test-pglite] temp dir removed, exit ${code}`);
  process.exit(code == null ? 1 : code);
});
child.on("error", (err) => {
  console.error("[test-pglite]", err.message);
  cleanup();
  process.exit(1);
});
