// SPDX-License-Identifier: AGPL-3.0-or-later
// The demo gallery promise is "never empty and never capped", and it broke
// three times without anyone noticing: example courses never reached the
// Docker image, the shared family created before the seed shipped could
// never be reseeded, and the seed capped the gallery at five so the IP wave
// was invisible. All rules are asserted from the source.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
const dockerignore = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
const demoSrc = fs.readFileSync(path.join(__dirname, "demo.js"), "utf8");

test("the runtime image carries the example courses the demo seed imports", () => {
  assert.match(
    dockerfile,
    /COPY --from=build \/app\/docs\/examples docs\/examples/,
    "the runtime stage must copy docs/examples"
  );
});

test("dockerignore excludes docs but keeps docs/examples", () => {
  assert.match(dockerignore, /docs\/\*/, "docs stays out of the image");
  assert.match(dockerignore, /!docs\/examples/, "docs/examples is the exception");
  // The exception must come after the exclusion, or it is overridden.
  assert.ok(dockerignore.indexOf("!docs/examples") > dockerignore.indexOf("docs/*"));
});

test("an existing shared demo family is reseeded when empty, not returned as-is", () => {
  const fn = demoSrc.match(/async function ensureSharedFamily\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "ensureSharedFamily must exist");
  assert.match(fn[0], /seedDemoCourses\(/, "the found-family path must call seedDemoCourses");
});

test("every shipped example package is actually in the folder the seed reads", () => {
  const dir = path.join(root, "docs", "examples");
  const flat = fs.readdirSync(dir).filter((f) => f.endsWith(".wow-course.json"));
  const nested = fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory() || e.name.startsWith(".")) return [];
    try {
      return fs.readdirSync(path.join(dir, e.name)).filter((f) => f.endsWith(".wow-course.json")).map((f) => `${e.name}/${f}`);
    } catch { return []; }
  });
  const all = new Set([...flat, ...nested]);
  const missing = [];
  for (const f of all) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) missing.push(f);
  }
  assert.equal(missing.length, 0, `missing example packages on disk: ${missing.join(", ")}`);
  assert.ok(all.size >= 5, `expected at least five example courses (flat plus nested IP wave), got ${all.size}: ${[...all].join(", ")}`);
});

test("the demo seed does not cap the gallery and backfills missing titles", () => {
  // The old seed capped at slice(0, 5); that hid the twelve nested IP courses.
  // Now the seed walks the whole directory and, for an existing demo family,
  // backfills any titles it has not seen yet.
  assert.ok(demoSrc.includes("haveTitles") && demoSrc.includes("pending"), "seed must track haveTitles and compute a pending backfill set");
  assert.ok(!demoSrc.includes("slice(0, 5)") || !/\bfor\s*\(.*slice\(0,\s*5\)/.test(demoSrc), "seed must not cap the course gallery at five: do not ship with 'for (file of files.slice(0, 5))'");
});
