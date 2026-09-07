// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { denyPreviewWrites } = require("./preview");

function run(user, method) {
  const req = { user, method };
  let status = null;
  let body = null;
  const res = {
    status(c) { status = c; return this; },
    json(b) { body = b; return this; },
  };
  let passed = false;
  denyPreviewWrites(req, res, () => { passed = true; });
  return { passed, status, body };
}

const previewing = { id: 11, role: "learner", preview: true };
const realLearner = { id: 11, role: "learner" };
const guide = { id: 1, role: "parent", guideRole: "owner" };

test("attachPreview covers the session bootstrap, not just the learner routes", () => {
  // Read from index.js rather than restating the list, so this fails when the
  // mount changes rather than when someone remembers to update a copy.
  const src = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  const mount = src.match(/app\.use\(\[([^\]]*)\],\s*preview\.attachPreview\)/);
  assert.ok(mount, "attachPreview must be mounted on an explicit list of paths");
  const paths = (mount[1].match(/"[^"]+"/g) || []).map((s) => s.replace(/"/g, ""));

  // /api/me is the one that bites. Without it the identity swap never reaches
  // the SPA's bootstrap: the app answers "you are the guide", renders the guide
  // console, and STILL sends the preview header on every request, so ordinary
  // guide writes to the routes below come back preview_read_only with no
  // banner on screen to explain why. That is a lockout, not a preview.
  assert.ok(paths.includes("/api/me"), `/api/me missing from [${paths.join(", ")}]`);
  for (const p of ["/api/learn", "/api/worlds", "/api/tutor"]) {
    assert.ok(paths.includes(p), `${p} missing from the preview mount`);
  }
});

test("preview may read", () => {
  for (const m of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(run(previewing, m).passed, true, `${m} should pass`);
  }
});

test("preview may NOT write, by any method", () => {
  // This is the whole safety property: a guide walking the app cannot leave a
  // mark on the child's record.
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    const r = run(previewing, m);
    assert.equal(r.passed, false, `${m} should be blocked`);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "preview_read_only");
    // The message is shown to a guide, so it must explain rather than scold.
    assert.match(r.body.message, /Nothing you do here is recorded/);
  }
});

test("a real learner is completely unaffected", () => {
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(run(realLearner, m).passed, true, `real learner blocked on ${m}`);
  }
});

test("a guide not previewing is completely unaffected", () => {
  for (const m of ["GET", "POST", "DELETE"]) {
    assert.equal(run(guide, m).passed, true);
  }
});

test("no user at all falls through to the normal auth checks", () => {
  assert.equal(run(null, "POST").passed, true);
  assert.equal(run(undefined, "GET").passed, true);
});

test("the flag must be exactly true, so a stray truthy value cannot slip past", () => {
  // Defensive: preview is set by our own middleware, but a route that copies
  // req.user around should not be able to half-set it.
  assert.equal(run({ id: 1, role: "learner", preview: true }, "POST").passed, false);
  assert.equal(run({ id: 1, role: "learner", preview: false }, "POST").passed, true);
  assert.equal(run({ id: 1, role: "learner" }, "POST").passed, true);
});
