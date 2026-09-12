// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const questgen = require("./questgen");

test("normalizeBeats: accepts the documented shape", () => {
  const out = questgen.normalizeBeats({
    beats: [
      { encounterId: 12, title: "The rabbit's waistcoat", narration: "You follow.", artPrompt: "a hedgerow at dusk" },
    ],
  }, 3);
  assert.equal(out.length, 1);
  assert.equal(out[0].encounterId, 12);
  assert.equal(out[0].narration, "You follow.");
});

test("normalizeBeats: accepts a bare array, since models drop the wrapper", () => {
  const out = questgen.normalizeBeats([{ narration: "You step through." }], 2);
  assert.equal(out.length, 1);
  assert.equal(out[0].encounterId, null);
});

test("normalizeBeats: never returns more beats than were asked for", () => {
  const many = { beats: Array.from({ length: 20 }, (_, i) => ({ narration: `beat ${i}` })) };
  assert.equal(questgen.normalizeBeats(many, 4).length, 4);
});

test("normalizeBeats: a beat with no narration is dropped, not stored empty", () => {
  const out = questgen.normalizeBeats({
    beats: [{ narration: "  " }, { narration: "Real." }, { title: "no narration" }],
  }, 5);
  assert.equal(out.length, 1);
  assert.equal(out[0].narration, "Real.");
});

test("normalizeBeats: junk in, null out", () => {
  assert.equal(questgen.normalizeBeats(null, 3), null);
  assert.equal(questgen.normalizeBeats({}, 3), null);
  assert.equal(questgen.normalizeBeats({ beats: [] }, 3), null);
  assert.equal(questgen.normalizeBeats({ beats: [{ narration: "" }] }, 3), null);
  assert.equal(questgen.normalizeBeats("a string", 3), null);
});

test("normalizeBeats: only the four known fields survive", () => {
  const out = questgen.normalizeBeats({
    beats: [{
      narration: "You follow.",
      encounterId: 3,
      title: "T",
      artPrompt: "art",
      xp: 9999,
      unlockEverything: true,
      __proto__: { polluted: true },
    }],
  }, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ["artPrompt", "encounterId", "narration", "title"]);
});

test("normalizeBeats: long narration is capped rather than rejected", () => {
  const out = questgen.normalizeBeats({ beats: [{ narration: "x".repeat(5000) }] }, 1);
  assert.ok(out[0].narration.length <= 1200);
});

test("normalizeBeats: whitespace is collapsed, so a beat cannot smuggle layout", () => {
  const out = questgen.normalizeBeats({ beats: [{ narration: "You\n\n\nfollow\t\tthe   rabbit." }] }, 1);
  assert.equal(out[0].narration, "You follow the rabbit.");
});

test("buildPrompt: names the cast and forbids inventing new ones", () => {
  const p = questgen.buildPrompt({
    world: { title: "Wonderland", tagline: "Down the hole", setting: "A garden", characters: [{ name: "Alice", role: "self" }] },
    gameType: { label: "Story", blurb: "Chapters that follow the tale." },
    chapter: { title: "The garden", hook: "Painting roses" },
    encounters: [{ id: 5, kind: "boss", title: "The Queen" }],
    lessonTitles: ["Adding halves"],
  });
  assert.match(p, /Wonderland/);
  assert.match(p, /Alice \(self\)/);
  assert.match(p, /id 5: kind "boss"/);
  assert.match(p, /The garden/);
  // The real work is passed for flavour but the beat must not name the subject.
  assert.match(p, /Adding halves/);
  assert.match(p, /never named aloud/);
});

test("buildPrompt: survives a world with nothing filled in", () => {
  const p = questgen.buildPrompt({
    world: {}, gameType: { label: "Story", blurb: "" },
    chapter: {}, encounters: [], lessonTitles: [],
  });
  assert.match(p, /the learner alone/);
  assert.ok(p.length > 0);
});

test("SYSTEM prompt holds the safety and immersion rules", () => {
  assert.match(questgen.SYSTEM, /Second person/);
  assert.match(questgen.SYSTEM, /Nobody dies/);
  assert.match(questgen.SYSTEM, /Invent no new named characters/);
  // Breaking the fiction with app vocabulary is the fastest way to lose a kid.
  assert.match(questgen.SYSTEM, /Never mention XP/);
});

const world = { title: "The Amber Road", setting: "A salt marsh under a copper sky", chapters: [] };

test("chaptersNeedingArt: counts chapters without art, keeps their jsonb index", () => {
  const out = questgen.chaptersNeedingArt({
    chapters: [{ title: "One", artUrl: "https://x/1.png" }, { title: "Two" }, { title: "Three" }],
  });
  assert.deepEqual(out.map((x) => x.index), [1, 2]);
  assert.equal(out[0].chapter.title, "Two");
});

test("chaptersNeedingArt: a world without chapters is empty, never an error", () => {
  assert.deepEqual(questgen.chaptersNeedingArt(null), []);
  assert.deepEqual(questgen.chaptersNeedingArt({}), []);
  assert.deepEqual(questgen.chaptersNeedingArt({ chapters: "nope" }), []);
});

test("chapterPrompt: builds from the chapter and the setting, and forbids text", () => {
  const p = questgen.chapterPrompt(world, { title: "The Long Causeway", hook: "The tide comes in fast." });
  assert.match(p, /The Long Causeway/);
  assert.match(p, /The tide comes in fast\./);
  assert.match(p, /salt marsh under a copper sky/);
  assert.match(p, /No text, no words, no letters/);
});

test("chapterPrompt: survives a chapter with nothing but a fallback", () => {
  const p = questgen.chapterPrompt({}, null);
  assert.match(p, /the next chapter/);
  assert.match(p, /an adventure/);
});

test("portraitPrompt: says who, what they are, and where", () => {
  const p = questgen.portraitPrompt(world, { name: "Fen", role: "mentor", bio: "A cartographer who cannot swim." });
  assert.match(p, /portrait of Fen/i);
  assert.match(p, /a mentor in this world/);
  assert.match(p, /cartographer who cannot swim/);
  assert.match(p, /salt marsh under a copper sky/);
  assert.match(p, /No text, no words, no letters/);
});

test("portraitPrompt: a bare name still draws, with a role fallback", () => {
  const p = questgen.portraitPrompt(null, { name: "Pib" });
  assert.match(p, /portrait of Pib/i);
  assert.match(p, /an ally in this world/);
  assert.match(p, /an adventure/);
});
