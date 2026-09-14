// SPDX-License-Identifier: AGPL-3.0-or-later
// Run the full node --test suite with DB_DRIVER=pglite against a temp dir.
// Usage: node scripts/test-pglite.js
// PGlite's WASM module cannot be instantiated in parallel workers, so we run
// with --test-concurrency=1 to serialize test files.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-pglite-"));
console.log(`[test-pglite] DATA_DIR=${dir} DB_DRIVER=pglite`);
const env = { ...process.env, DB_DRIVER: "pglite", DATA_DIR: dir };
const args = ["--test", "--test-reporter=spec", "--test-concurrency=1"];
const child = spawn(process.execPath, args, { env, stdio: "inherit" });
child.on("close", (code) => {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[test-pglite] temp dir removed, exit ${code}`);
  process.exit(code);
});
child.on("error", (err) => {
  console.error("[test-pglite]", err.message);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
