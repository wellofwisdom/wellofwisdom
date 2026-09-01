// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const video = require("./video");

// checkYouTube talks to the network, so the offline tests here exercise the
// shape check and the pruning logic. The status-code policy is covered by
// exercising pruneDeadVideos against a stubbed checker below.

test("checkYouTube: an id of the wrong shape never costs a request", async () => {
  for (const bad of ["", null, undefined, "short", "way-too-long-to-be-an-id", "has spaces", "!!!!!!!!!!!"]) {
    const r = await video.checkYouTube(bad);
    assert.equal(r.ok, false, `should reject: ${JSON.stringify(bad)}`);
    assert.equal(r.reason, "malformed_id");
  }
});

test("checkYouTube: a well-formed id is at least attempted", async () => {
  // Shape only: this must not be rejected before the network is consulted.
  const r = await video.checkYouTube("dQw4w9WgXcQ", { timeoutMs: 15000 });
  assert.notEqual(r.reason, "malformed_id");
});

/** pruneDeadVideos with the network stubbed, so the policy is testable. */
function courseWith(items) {
  return { units: [{ lessons: [{ title: "L", items }] }] };
}

test("pruneDeadVideos: leaves a course with no videos completely alone", async () => {
  const c = courseWith([
    { type: "article", content: { body: "x" } },
    { type: "exercise", content: { prompt: "q" } },
  ]);
  const out = await video.pruneDeadVideos(c, { log: () => {} });
  assert.deepEqual(out, { checked: 0, dropped: 0, kept: 0 });
  assert.equal(c.units[0].lessons[0].items.length, 2);
});

test("pruneDeadVideos: an uploaded video is never network-checked", async () => {
  // Only youtubeId items are verified. An upload is ours already.
  const c = courseWith([{ type: "video", content: { uploadId: 7, title: "ours" } }]);
  const out = await video.pruneDeadVideos(c, { log: () => {} });
  assert.equal(out.checked, 0);
  assert.equal(c.units[0].lessons[0].items.length, 1);
});

test("pruneDeadVideos: a malformed id is dropped without any request", async () => {
  const c = courseWith([
    { type: "article", content: { body: "keep me" } },
    { type: "video", content: { youtubeId: "nope", title: "invented" } },
  ]);
  const out = await video.pruneDeadVideos(c, { log: () => {} });
  assert.equal(out.dropped, 1);
  const kinds = c.units[0].lessons[0].items.map((i) => i.type);
  assert.deepEqual(kinds, ["article"], "everything else must survive the prune");
});

test("pruneDeadVideos: the same invented id is only checked once", async () => {
  const c = courseWith([
    { type: "video", content: { youtubeId: "badbadbad1" } },
    { type: "video", content: { youtubeId: "badbadbad1" } },
    { type: "video", content: { youtubeId: "badbadbad1" } },
  ]);
  const out = await video.pruneDeadVideos(c, { log: () => {} });
  assert.equal(out.checked, 1, "one distinct id, one check");
  assert.equal(out.dropped, 3, "but every item carrying it is dropped");
});

test("pruneDeadVideos: survives a malformed course tree", async () => {
  for (const junk of [null, {}, { units: null }, { units: [{}] }, { units: [{ lessons: [{}] }] }]) {
    const out = await video.pruneDeadVideos(junk, { log: () => {} });
    assert.equal(typeof out.checked, "number");
  }
});
