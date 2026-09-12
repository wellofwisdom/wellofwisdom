// SPDX-License-Identifier: AGPL-3.0-or-later
// The demo gallery promise is "never empty", and it broke twice without
// anyone noticing: the example courses never reached the Docker image, and
// the shared family created before the seed shipped could never be seeded.
// Both rules are asserted from the source rather than trusted to review.
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
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wow-course.json"));
  assert.ok(files.length >= 4, "expected at least four example courses, got " + files.length);
});
