// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const quest = require("./quest");

test("gameType: four shapes, unknown ids fall back to story", () => {
  assert.equal(quest.GAME_TYPES.length, 4);
  assert.deepEqual(quest.GAME_TYPES.map((g) => g.id).sort(), ["cyoa", "dungeon", "rpg", "story"]);
  assert.equal(quest.gameType("dungeon").id, "dungeon");
  assert.equal(quest.gameType("nonsense").id, "story");
  assert.equal(quest.gameType(undefined).id, "story");
});

test("isUnlocked: an encounter with no requirements is open", () => {
  assert.deepEqual(quest.isUnlocked({ requires: {} }, {}), { unlocked: true, reason: null });
  assert.equal(quest.isUnlocked({}, {}).unlocked, true);
});

test("isUnlocked: lessons gate play on real work, and the reason says what to do", () => {
  const enc = { requires: { lessonsDone: 5 } };
  const locked = quest.isUnlocked(enc, { lessonsDone: 3 });
  assert.equal(locked.unlocked, false);
  assert.match(locked.reason, /2 more lessons/);
  assert.equal(quest.isUnlocked(enc, { lessonsDone: 5 }).unlocked, true);

  // Singular reads correctly. A child sees this string.
  assert.match(quest.isUnlocked(enc, { lessonsDone: 4 }).reason, /1 more lesson\b/);
});

test("isUnlocked: a prior encounter must be won first", () => {
  const enc = { requires: { afterEncounterId: 7 } };
  assert.equal(quest.isUnlocked(enc, { won: [] }).unlocked, false);
  assert.equal(quest.isUnlocked(enc, { won: [7] }).unlocked, true);
  assert.equal(quest.isUnlocked(enc, { won: new Set([7]) }).unlocked, true);
});

test("isUnlocked: item and streak gates", () => {
  assert.equal(quest.isUnlocked({ requires: { itemId: 3 } }, { inventory: [1, 2] }).unlocked, false);
  assert.equal(quest.isUnlocked({ requires: { itemId: 3 } }, { inventory: [3] }).unlocked, true);
  const streak = quest.isUnlocked({ requires: { correctStreak: 5 } }, { correctStreak: 2 });
  assert.equal(streak.unlocked, false);
  assert.match(streak.reason, /5 right in a row/);
});

test("encounterXp: a boss is worth meaningfully more than a scene", () => {
  assert.ok(quest.encounterXp("boss") > quest.encounterXp("miniboss"));
  assert.ok(quest.encounterXp("miniboss") > quest.encounterXp("battle"));
  assert.ok(quest.encounterXp("battle") > quest.encounterXp("scene"));
  assert.ok(quest.encounterXp("unknown") > 0);
});

test("totalXp: loot bonuses add on top of the base", () => {
  assert.equal(quest.totalXp("battle"), 15);
  assert.equal(quest.totalXp("battle", [{ xpBonus: 5 }, { xpBonus: 10 }]), 30);
  assert.equal(quest.totalXp("battle", [{}, null]), 15);
});

test("rollRarity: bosses cannot drop junk, scenes cannot drop legendaries", () => {
  const lowest = () => quest.rollRarity("boss", () => 0);
  const highest = () => quest.rollRarity("boss", () => 0.999);
  assert.ok(["rare", "epic", "legendary"].includes(lowest()));
  assert.ok(["rare", "epic", "legendary"].includes(highest()));
  assert.equal(quest.rollRarity("scene", () => 0.999), "common");
  // Every roll is a real rarity. Nothing ever drops "undefined".
  for (const kind of ["scene", "battle", "puzzle", "treasure", "miniboss", "boss", "choice", "weird"]) {
    for (const r of [0, 0.5, 0.999]) {
      assert.ok(quest.RARITIES.includes(quest.rollRarity(kind, () => r)), `${kind}@${r}`);
    }
  }
});

test("bossAttempt: a streak of correct answers wins; a hint breaks it", () => {
  let s = { need: 3, streak: 0 };
  s = quest.bossAttempt(s, { correct: true, usedHint: false });
  assert.equal(s.streak, 1);
  assert.equal(s.won, false);
  s = quest.bossAttempt(s, { correct: true, usedHint: false });
  s = quest.bossAttempt(s, { correct: true, usedHint: false });
  assert.equal(s.won, true);
});

test("bossAttempt: a wrong answer resets the streak but never the progress", () => {
  let s = { need: 3, streak: 2 };
  s = quest.bossAttempt(s, { correct: false, usedHint: false });
  assert.equal(s.streak, 0);
  assert.equal(s.won, false);
  assert.equal(s.broke, true, "the UI needs to know the streak just broke");
});

test("bossAttempt: a hint counts as not-clean, so it does not advance the streak", () => {
  const s = quest.bossAttempt({ need: 5, streak: 3 }, { correct: true, usedHint: true });
  assert.equal(s.streak, 0);
});

test("newlyEarnedRewards: XP cost must be met", () => {
  const rewards = [{ id: 1, status: "available", cost_xp: 500, requires: {} }];
  assert.equal(quest.newlyEarnedRewards(rewards, { xp: 100 }).length, 0);
  assert.equal(quest.newlyEarnedRewards(rewards, { xp: 500 }).length, 1);
});

test("newlyEarnedRewards: an already-granted reward is never re-earned", () => {
  const rewards = [
    { id: 1, status: "granted", cost_xp: 0, requires: {} },
    { id: 2, status: "earned", cost_xp: 0, requires: {} },
    { id: 3, status: "archived", cost_xp: 0, requires: {} },
    { id: 4, status: "available", cost_xp: 0, requires: {} },
  ];
  assert.deepEqual(quest.newlyEarnedRewards(rewards, { xp: 9999 }).map((r) => r.id), [4]);
});

test("newlyEarnedRewards: badge, course and encounter requirements all hold", () => {
  const r = (requires) => [{ id: 1, status: "available", cost_xp: 0, requires }];
  assert.equal(quest.newlyEarnedRewards(r({ badge: "streak_7" }), { badges: [] }).length, 0);
  assert.equal(quest.newlyEarnedRewards(r({ badge: "streak_7" }), { badges: ["streak_7"] }).length, 1);
  assert.equal(quest.newlyEarnedRewards(r({ courseId: 9 }), { coursesCompleted: [1] }).length, 0);
  assert.equal(quest.newlyEarnedRewards(r({ courseId: 9 }), { coursesCompleted: [9] }).length, 1);
  assert.equal(quest.newlyEarnedRewards(r({ encounterId: 4 }), { won: [] }).length, 0);
  assert.equal(quest.newlyEarnedRewards(r({ encounterId: 4 }), { won: [4] }).length, 1);
});

test("planEncounters: every chapter gets the game type's beats, last one ends on a boss", () => {
  const chapters = [{ title: "Down the hole" }, { title: "The garden" }, { title: "The trial" }];
  const plan = quest.planEncounters({ gameTypeId: "dungeon", chapters });
  assert.equal(plan.length, 3 * quest.gameType("dungeon").beats.length);
  assert.equal(plan[plan.length - 1].kind, "boss", "the world must end on a boss");
  assert.equal(plan[0].chapter_index, 0);
  assert.equal(plan[plan.length - 1].chapter_index, 2);
  // Gates escalate, so play tracks lessons finished rather than clicking through.
  const gates = plan.map((p) => p.requires.lessonsDone);
  assert.deepEqual(gates, [...gates].sort((a, b) => a - b));
  assert.ok(gates[0] >= 1);
});

test("planEncounters: survives an empty or missing chapter list", () => {
  assert.deepEqual(quest.planEncounters({ gameTypeId: "rpg", chapters: [] }), []);
  assert.deepEqual(quest.planEncounters({ gameTypeId: "rpg" }), []);
});
