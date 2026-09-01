// SPDX-License-Identifier: AGPL-3.0-or-later
// Syntax-check every server file AND require() them: node --check alone misses
// load-time crashes (lesson hard-won in production ops).
const fs = require("node:fs");
const path = require("node:path");

const serverFiles = [
  "server/index.js",
  ...fs.readdirSync("server/lib").filter((f) => f.endsWith(".js")).map((f) => path.join("server/lib", f)),
  ...fs.readdirSync("server/routes").filter((f) => f.endsWith(".js")).map((f) => path.join("server/routes", f)),
];

let bad = 0;
for (const file of serverFiles) {
  try {
    require("node:child_process").execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    bad++;
    console.error(`SYNTAX FAIL ${file}: ${err.stderr}`);
  }
}

// require() each lib + route (module side effects must be safe; index.js boots
// degraded when no DATABASE_URL is set: that's intentional and tested).
for (const file of serverFiles) {
  try {
    require(path.resolve(file));
  } catch (err) {
    bad++;
    console.error(`LOAD FAIL ${file}: ${err.message}`);
  }
}

if (bad) {
  console.error(`check: ${bad} failure(s)`);
  process.exit(1);
}
console.log(`check: ${serverFiles.length} server files OK`);
