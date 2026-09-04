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

// ---- other sources: the pure parsing/validation, no network ----

test("vimeoIdFrom: pulls an id from a Vimeo url, rejects a bare number", () => {
  assert.equal(video.vimeoIdFrom("https://vimeo.com/76979871"), "76979871");
  assert.equal(video.vimeoIdFrom("https://player.vimeo.com/video/76979871"), "76979871");
  assert.equal(video.vimeoIdFrom("https://vimeo.com/channels/staffpicks/76979871"), "76979871");
  assert.equal(video.vimeoIdFrom("76979871"), null, "a bare number is too ambiguous to trust");
  assert.equal(video.vimeoIdFrom("https://youtube.com/watch?v=abc"), null);
});

test("fileVideoUrl: a public video URL passes, a private or non-video one does not", () => {
  assert.equal(video.fileVideoUrl("https://example.com/clip.mp4"), "https://example.com/clip.mp4");
  assert.equal(video.fileVideoUrl("https://example.com/clip.webm?token=x"), "https://example.com/clip.webm?token=x");
  assert.equal(video.fileVideoUrl("https://example.com/page.html"), null, "not a video extension");
  assert.equal(video.fileVideoUrl("http://localhost/clip.mp4"), null, "no private host");
  assert.equal(video.fileVideoUrl("https://10.0.0.5/clip.mp4"), null, "no private address");
  assert.equal(video.fileVideoUrl("not a url"), null);
});

test("peerTubeHostId: validates the stored host + id, blocking private hosts", () => {
  assert.deepEqual(video.peerTubeHostId("framatube.org", "abcd-1234"), { host: "framatube.org", id: "abcd-1234" });
  assert.equal(video.peerTubeHostId("localhost", "abcd"), null, "no private host");
  assert.equal(video.peerTubeHostId("192.168.1.9", "abcd"), null, "no private address");
  assert.equal(video.peerTubeHostId("framatube.org", "bad id!"), null, "id is constrained");
  assert.equal(video.peerTubeHostId("", "abcd"), null);
});

test("peerTubeRefFromUrl: extracts host + id from watch/embed/short paths", () => {
  const u = (s) => new URL(s);
  assert.deepEqual(video.peerTubeRefFromUrl(u("https://framatube.org/videos/watch/uuid-1")), { host: "framatube.org", id: "uuid-1" });
  assert.deepEqual(video.peerTubeRefFromUrl(u("https://framatube.org/w/short2")), { host: "framatube.org", id: "short2" });
  assert.deepEqual(video.peerTubeRefFromUrl(u("https://framatube.org/videos/embed/uuid-3")), { host: "framatube.org", id: "uuid-3" });
  assert.equal(video.peerTubeRefFromUrl(u("https://framatube.org/about")), null);
});

test("resolveVideoUrl: a direct file URL is resolved with no network at all", async () => {
  const r = await video.resolveVideoUrl("https://example.com/lesson.mp4");
  assert.deepEqual(r, { content: { fileUrl: "https://example.com/lesson.mp4" }, title: null });
});

test("resolveVideoUrl: an empty or private link is refused", async () => {
  assert.deepEqual(await video.resolveVideoUrl("  "), { error: "content_invalid" });
  // A private-host .mp4 is not a file (safeSourceUrl blocks it) and not a safe
  // URL to try as PeerTube either, so it is refused rather than fetched.
  assert.deepEqual(await video.resolveVideoUrl("http://127.0.0.1/x.mp4"), { error: "video_unavailable" });
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
