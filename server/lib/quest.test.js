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

test("bossRules: sensible defaults per kind, overridable but always clamped", () => {
  assert.deepEqual(quest.bossRules("boss"), { need: 5, timeLimitSec: 30 });
  assert.deepEqual(quest.bossRules("miniboss"), { need: 3, timeLimitSec: 40 });
  // An unknown kind is treated as a full boss, never left without a rule.
  assert.deepEqual(quest.bossRules("mystery"), { need: 5, timeLimitSec: 30 });
  // An encounter can tune its own fight.
  assert.deepEqual(quest.bossRules("boss", { bossNeed: 3, bossTimeSec: 60 }), { need: 3, timeLimitSec: 60 });
  // A hostile or silly override cannot make a fight impossible or endless.
  assert.equal(quest.bossRules("boss", { bossNeed: 999 }).need, 8);
  assert.equal(quest.bossRules("boss", { bossNeed: 0 }).need, 2);
  assert.equal(quest.bossRules("boss", { bossTimeSec: 1 }).timeLimitSec, 10);
  assert.equal(quest.bossRules("boss", { bossTimeSec: 99999 }).timeLimitSec, 120);
});

test("bossStep: a clean streak wins; the pointer always advances", () => {
  let run = { need: 3, streak: 0, index: 0 };
  let s = quest.bossStep(run, { correct: true });
  assert.deepEqual([s.streak, s.index, s.won, s.brokeBy], [1, 1, false, null]);
  s = quest.bossStep({ ...run, ...s }, { correct: true });
  s = quest.bossStep({ ...run, ...s }, { correct: true });
  assert.equal(s.won, true);
  assert.equal(s.index, 3, "the question pointer moves on every answer, win or not");
});

test("bossStep: a wrong answer, a hint or a timeout each break the streak", () => {
  const run = { need: 5, streak: 4, index: 4 };
  assert.deepEqual(
    (({ streak, won, broke, brokeBy }) => ({ streak, won, broke, brokeBy }))(quest.bossStep(run, { correct: false })),
    { streak: 0, won: false, broke: true, brokeBy: "wrong" }
  );
  assert.equal(quest.bossStep(run, { correct: true, usedHint: true }).brokeBy, "hint");
  assert.equal(quest.bossStep(run, { correct: true, timedOut: true }).brokeBy, "timeout");
  // A timeout on a right answer still does not count: the clock is the tension.
  assert.equal(quest.bossStep(run, { correct: true, timedOut: true }).streak, 0);
});

test("bossStep: breaking from a zero streak is not reported as a break", () => {
  // Nothing to lose, so the UI should not flash 'streak broken'.
  assert.equal(quest.bossStep({ need: 3, streak: 0, index: 0 }, { correct: false }).broke, false);
});

test("bossQuestionId: cycles the pool so a short course still hosts a boss", () => {
  const run = { questions: [11, 22, 33], index: 0 };
  assert.equal(quest.bossQuestionId({ ...run, index: 0 }), 11);
  assert.equal(quest.bossQuestionId({ ...run, index: 2 }), 33);
  assert.equal(quest.bossQuestionId({ ...run, index: 3 }), 11, "wraps around");
  assert.equal(quest.bossQuestionId({ ...run, index: 4 }), 22);
  assert.equal(quest.bossQuestionId({ questions: [], index: 0 }), null);
  assert.equal(quest.bossQuestionId(null), null);
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
