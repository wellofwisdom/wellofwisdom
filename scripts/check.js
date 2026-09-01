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

// House style: no em dashes anywhere in our own source. They kept creeping
// back in, so the check enforces it instead of trusting anyone to remember.
// Never clear a hit by swapping in a different dash. Rewrite the sentence: a
// full stop, a colon, a comma or parentheses always says it better. Where the
// dash stood in for an empty value, use a word ("None", "Not rated").
// Built from code points on purpose: spelling the characters out literally
// would make this file fail its own check.
const DASHES = [
  [String.fromCharCode(0x2014), "EM DASH"],
  [String.fromCharCode(0x2013), "EN DASH"],
  [String.fromCharCode(0x2015), "HORIZONTAL BAR"],
  [String.fromCharCode(0x2012), "FIGURE DASH"],
];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const TEXTY = /\.(js|ts|tsx|jsx|json|md|sql|css|html|yml|yaml)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXTY.test(entry.name)) out.push(full);
  }
  return out;
}

let dashes = 0;
for (const file of walk(".")) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const [ch, label] of DASHES) {
      if (lines[i].includes(ch)) {
        dashes++;
        console.error(`${label} ${file}:${i + 1}: ${lines[i].trim().slice(0, 110)}`);
      }
    }
  }
}
if (dashes) {
  console.error(`check: ${dashes} dash(es). Rewrite the sentence, do not swap in another dash.`);
  bad += dashes;
}

if (bad) {
  console.error(`check: ${bad} failure(s)`);
  process.exit(1);
}
console.log(`check: ${serverFiles.length} server files OK, no em dashes`);
