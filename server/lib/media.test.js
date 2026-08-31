// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const media = require("./media");

const URL_A = "https://tempfile.aiquickdraw.com/h/abc_1.png";

test("resultUrls: top-level resultJson string (what nano-banana really returns)", () => {
  // Live recordInfo payload shape as of 2026-08: no `response` object at all.
  const d = {
    taskId: "abc", state: "success",
    resultJson: JSON.stringify({ resultUrls: [URL_A] }),
  };
  assert.deepEqual(media.resultUrls(d), [URL_A]);
});

test("resultUrls: nested response.resultUrls", () => {
  assert.deepEqual(media.resultUrls({ response: { resultUrls: [URL_A] } }), [URL_A]);
});

test("resultUrls: nested response.resultJson string", () => {
  const d = { response: { resultJson: JSON.stringify({ resultUrls: [URL_A] }) } };
  assert.deepEqual(media.resultUrls(d), [URL_A]);
});

test("resultUrls: top-level resultUrls array", () => {
  assert.deepEqual(media.resultUrls({ resultUrls: [URL_A] }), [URL_A]);
});

test("resultUrls: empty, malformed, and missing payloads yield []", () => {
  assert.deepEqual(media.resultUrls({}), []);
  assert.deepEqual(media.resultUrls(null), []);
  assert.deepEqual(media.resultUrls({ resultJson: "" }), []);
  assert.deepEqual(media.resultUrls({ resultJson: "not json" }), []);
  assert.deepEqual(media.resultUrls({ resultJson: JSON.stringify({ resultUrls: [] }) }), []);
});
