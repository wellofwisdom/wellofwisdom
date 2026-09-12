// SPDX-License-Identifier: AGPL-3.0-or-later
// The world-art run spends real money per image, so its rules are asserted
// from the source rather than trusted to review: it is gated like every other
// paid route, the count a guide confirms covers all three kinds of art, and
// unapproved inventions are never drawn.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "worlds.js"), "utf8");
const questgenSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "questgen.js"), "utf8");

test("illustration is paid generation, so it is gated on spend_media", () => {
  const route = src.match(/router\.post\("\/:adventureId\/art"[^)]*\)/);
  assert.ok(route, "the art route must exist");
  assert.match(route[0], /requirePerm\("spend_media"\)/, "the art route must carry requirePerm(spend_media)");
});

test("the pending count covers scenes, chapter covers and portraits together", () => {
  const route = src.match(/router\.post\("\/:adventureId\/art"[\s\S]*?\n\}\);/);
  assert.ok(route, "the art route must exist");
  const body = route[0];
  assert.match(body, /chaptersNeedingArt/, "the count must include chapter covers");
  assert.match(body, /from adventure_characters/, "the count must include character portraits");
  assert.match(body, /from adventure_encounters/, "the count must include encounter scenes");
});

test("portraits are drawn only for approved characters", () => {
  assert.match(
    questgenSrc,
    /approved and portrait_url is null/,
    "an unapproved invention is not in the world yet; drawing it spends money a guide has not agreed to"
  );
});

test("chapter art lands on the chapter inside the world jsonb, never a re-generation", () => {
  assert.match(questgenSrc, /chapters", String\(index\), "artUrl"/);
  assert.match(
    questgenSrc,
    /!chapter\.artUrl/,
    "chaptersNeedingArt must skip chapters that already have art, like the encounter rule"
  );
});
