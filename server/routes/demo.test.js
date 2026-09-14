// SPDX-License-Identifier: AGPL-3.0-or-later
// The demo gallery promise is "never empty and never capped", and it broke
// three times without anyone noticing: example courses never reached the
// Docker image, the shared family created before the seed shipped could
// never be reseeded, and the seed capped the gallery at five so the IP wave
// was invisible. All rules are asserted from the source.
// Well 8 adds the rich activity seed: a demo family must show real work.
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

test("ensureSharedFamily also backfills demo activity for existing families", () => {
  const fn = demoSrc.match(/async function ensureSharedFamily\(\) \{[\s\S]*?\n\}/);
  assert.ok(fn, "ensureSharedFamily must exist");
  assert.match(fn[0], /seedDemoActivity/, "the found-family path must also backfill activity");
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

test("the activity seed touches the tables the packet names", () => {
  const body = demoSrc.match(/async function trySeedDemoActivity[\s\S]*?\n\}/);
  assert.ok(body, "trySeedDemoActivity must exist");
  const src = body[0];
  assert.match(src, /attempts/, "seed must create attempts");
  assert.match(src, /review_schedule/, "seed must schedule review (so the due queue is non-empty)");
  assert.match(src, /lesson_completions/, "seed must complete lessons on different days");
  assert.match(src, /submissions/, "seed must create a submitted project");
  assert.match(src, /feedback/, "submission must include guide feedback");
  assert.match(src, /returned/, "submission must be returned");
  assert.match(src, /encounter_progress/, "seed must record a boss run");
  assert.match(src, /reports/, "seed must generate a quarterly report");
  assert.match(src, /events/, "seed must create calendar events");
  assert.match(src, /badges/, "seed must award badges");
});

test("the activity seed is idempotent via two guards", () => {
  // Guard 1: marker on the family (families.prefs.demoSeeded) so a second
  // call in the same boot is a no-op. server_settings is instance-admin only
  // after PR #21, so a demo route that writes it fails the check.
  assert.match(demoSrc, /demoSeeded/, "seed must use families.prefs.demoSeeded as the sentinel per family");
  assert.match(demoSrc, /families\.prefs/, "sentinel must live on the family, not in server_settings");
  const body = demoSrc.match(/async function trySeedDemoActivity[\s\S]*?\n\}/);
  assert.ok(body);
  assert.match(body[0], /existing/, "seed must bail when attempts already exist");
  assert.match(demoSrc, /createDemoFamily[\s\S]*?seedDemoActivity/, "createDemoFamily must seed activity");
  assert.match(demoSrc, /backfillDemoFamilies/, "a boot backfill for existing demo families must exist");
  // No live code may call server_settings from the demo route. Strip line
  // comments first, then assert zero matches. Using a single-line regex avoids
  // any need for embedded newlines.
  const stripped = demoSrc.replace(/^\s*\/\/.*$/gm, "");
  assert.equal((stripped.match(/server_settings/g) || []).length, 0, "demo route code must not touch server_settings; the marker is families.prefs.demoSeeded");
});

test("Dashboard exposes Play as the learner as the first action", () => {
  const dash = fs.readFileSync(path.join(root, "web", "src", "pages", "Dashboard.tsx"), "utf8");
  assert.match(dash, /startPreview/, "Dashboard must import and call startPreview");
  assert.match(dash, /Play as/, "Dashboard must render a 'Play as' button");
  assert.match(dash, /primaryLearner/, "Dashboard must pick a learner to preview as");
});

test("demo families are backfilled on server boot when DEMO_MODE is on", () => {
  const index = fs.readFileSync(path.join(root, "server", "index.js"), "utf8");
  assert.match(index, /DEMO_MODE/, "server boot must gate the backfill on DEMO_MODE");
  assert.match(index, /backfillDemoFamilies/, "server boot must call backfillDemoFamilies");
});

// 2026-09-14: the importer stored normalizeItem's whole { type, content }
// object in the content column, so every demo item was wrapped one level deep.
test("a demo package item becomes a row whose content is the content, not the item", () => {
  const demo = require("./demo");
  const coursegen = require("../lib/coursegen");
  const row = demo.demoItemRow({
    type: "exercise",
    content: { prompt: "Which is larger: 7/10 or 4/10?", kind: "mcq", choices: [{ id: "c1", text: "7/10" }, { id: "c2", text: "4/10" }], answer: "c1", hint: "Compare numerators." },
  }, coursegen);
  assert.equal(row.type, "exercise");
  assert.equal(row.content.kind, "mcq");
  assert.equal(row.content.prompt, "Which is larger: 7/10 or 4/10?");
  assert.equal(row.content.type, undefined, "content must not carry the item's type");
  assert.equal(row.content.content, undefined, "content must not be wrapped");
});

test("an item the normalizer rejects is skipped, not stored empty", () => {
  const demo = require("./demo");
  const coursegen = require("../lib/coursegen");
  assert.equal(demo.demoItemRow({ type: "article", content: {} }, coursegen), null);
  assert.equal(demo.demoItemRow(null, coursegen), null);
});

test("the repair only touches demo families and only rows that still have the wrapped shape", () => {
  assert.match(demoSrc, /f\.is_demo = true/);
  assert.match(demoSrc, /i\.content \? 'type' and i\.content \? 'content'/);
  assert.match(demoSrc, /i\.content->>'type' = i\.type/);
  // It runs before the activity seed, which needs the unwrapped exercises.
  assert.ok(demoSrc.indexOf("unwrapDemoItems().catch") < demoSrc.indexOf("await seedDemoActivity(row.id)"));
});

test("every seeded package item goes through demoItemRow", () => {
  assert.ok(!/normalizeItem\(\{ type, content \}\); \} catch \{ content = it\.content/.test(demoSrc), "the old wrapping assignment is gone");
  assert.match(demoSrc, /const row = demoItemRow\(les\.items\[ii\], coursegen\);/);
});
