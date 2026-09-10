#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Check .wow-course.json files the way an import will read them.
//
//   node scripts/validate-course.js [options] <file or folder>...
//
//   --library                a licence that lets others adapt it is required
//                            (CC BY, CC BY-SA or CC0): what a shared library runs
//   --allow-missing-answers  a question without an answer key is a warning,
//                            not a failure
//   --json                   one JSON report on stdout, for other tools
//
// Folders are searched for *.wow-course.json. Exits 1 if any file fails, or
// if none were found (a CI step that checked nothing should not pass).
// Needs no database, no network and no AI: it only reads files.
const fs = require("node:fs");
const path = require("node:path");
const { checkPackage } = require("../server/lib/coursecheck");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const targets = args.filter((a) => !a.startsWith("--"));
const known = new Set(["--library", "--allow-missing-answers", "--json", "--help"]);
for (const f of flags) {
  if (!known.has(f)) {
    console.error(`unknown option ${f}`);
    process.exit(2);
  }
}
if (flags.has("--help") || !targets.length) {
  console.log("usage: node scripts/validate-course.js [--library] [--allow-missing-answers] [--json] <file or folder>...");
  process.exit(targets.length || flags.has("--help") ? 0 : 2);
}

function collect(p, out) {
  const st = fs.statSync(p, { throwIfNoEntry: false });
  if (!st) {
    out.push({ file: p, missing: true });
  } else if (st.isDirectory()) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(p, e.name);
      if (e.isDirectory()) collect(full, out);
      else if (e.name.endsWith(".wow-course.json")) out.push({ file: full });
    }
  } else {
    out.push({ file: p });
  }
  return out;
}

const files = targets.flatMap((t) => collect(t, []));
const options = { requireOpenLicense: flags.has("--library"), allowMissingAnswers: flags.has("--allow-missing-answers") };
const reports = files.map(({ file, missing }) => {
  if (missing) return { file, ok: false, errors: [{ at: "file", message: "not found" }], warnings: [], stats: null };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    return { file, ok: false, errors: [{ at: "file", message: `not valid JSON (${e.message})` }], warnings: [], stats: null };
  }
  return { file, ...checkPackage(pkg, options) };
});

const failed = reports.filter((r) => !r.ok).length;
if (flags.has("--json")) {
  console.log(JSON.stringify({ ok: files.length > 0 && failed === 0, files: reports }, null, 2));
} else {
  for (const r of reports) {
    const s = r.stats;
    const summary = s ? ` (${s.units} units, ${s.lessons} lessons, ${s.items} items, ${s.questions} questions)` : "";
    console.log(`${r.ok ? "ok  " : "FAIL"} ${r.file}${summary}`);
    for (const e of r.errors) console.log(`       error    ${e.at}: ${e.message}`);
    for (const w of r.warnings) console.log(`       warning  ${w.at}: ${w.message}`);
  }
  if (!files.length) console.log("no .wow-course.json files found");
  else console.log(`\n${files.length - failed} of ${files.length} passed`);
}
process.exit(files.length && !failed ? 0 : 1);
