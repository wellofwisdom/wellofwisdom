// SPDX-License-Identifier: AGPL-3.0-or-later
// The world engine: game types, what unlocks an encounter, and what it pays.
//
// Everything here that decides something is a pure function of a progress
// snapshot, so it can be tested without a database and reasoned about without
// running the app. The routes do the IO; this decides.

/** The four shapes a world can take. Each maps the same course differently. */
const GAME_TYPES = [
  {
    id: "story",
    label: "Story",
    blurb: "Chapters that follow the tale. Best for a world the learner already loves.",
    // One scene per lesson, a boss at the end of each chapter.
    beats: ["scene", "scene", "boss"],
  },
  {
    id: "dungeon",
    label: "Dungeon crawl",
    blurb: "Rooms, traps and treasure. Each lesson opens the next door; mini-bosses guard the stairs.",
    beats: ["battle", "treasure", "puzzle", "miniboss"],
  },
  {
    id: "rpg",
    label: "RPG party",
    blurb: "A party of characters who level with the learner. Loot changes what they can do.",
    beats: ["scene", "battle", "treasure", "boss"],
  },
  {
    id: "cyoa",
    label: "Choose your own",
    blurb: "Branching choices. A wrong turn is a longer road, never a dead end.",
    beats: ["choice", "scene", "choice", "boss"],
  },
];

function gameType(id) {
  return GAME_TYPES.find((g) => g.id === id) || GAME_TYPES[0];
}

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_XP = { common: 5, uncommon: 10, rare: 25, epic: 50, legendary: 100 };

/** Loot rarity for a win. Bosses drop better; nothing is ever nothing. */
function rollRarity(kind, rand = Math.random) {
  const table = {
    treasure: ["uncommon", "rare", "rare", "epic"],
    battle: ["common", "common", "uncommon"],
    puzzle: ["common", "uncommon", "rare"],
    miniboss: ["uncommon", "rare", "epic"],
    boss: ["rare", "epic", "legendary"],
    scene: ["common"],
    choice: ["common"],
  }[kind] || ["common"];
  return table[Math.floor(rand() * table.length)] || "common";
}

/** XP for winning an encounter, before loot bonuses. */
function encounterXp(kind) {
  return { scene: 5, choice: 5, battle: 15, puzzle: 20, treasure: 10, miniboss: 40, boss: 100 }[kind] || 5;
}

/**
 * Can this learner take this encounter on?
 * `progress` is a snapshot: { lessonsDone, correctStreak, xp, inventory:Set, won:Set }
 * Returns { unlocked, reason } — reason is learner-facing, so it says what to
 * do next rather than what is missing.
 */
function isUnlocked(encounter, progress) {
  const req = (encounter && encounter.requires) || {};
  const p = progress || {};
  const won = p.won instanceof Set ? p.won : new Set(p.won || []);
  const inv = p.inventory instanceof Set ? p.inventory : new Set(p.inventory || []);

  if (req.afterEncounterId && !won.has(Number(req.afterEncounterId))) {
    return { unlocked: false, reason: "Finish the encounter before this one first." };
  }
  if (req.lessonsDone && Number(p.lessonsDone || 0) < Number(req.lessonsDone)) {
    const need = Number(req.lessonsDone) - Number(p.lessonsDone || 0);
    return { unlocked: false, reason: `${need} more lesson${need === 1 ? "" : "s"} to unlock this.` };
  }
  if (req.correctStreak && Number(p.correctStreak || 0) < Number(req.correctStreak)) {
    return { unlocked: false, reason: `Get ${req.correctStreak} right in a row to face this.` };
  }
  if (req.itemId && !inv.has(Number(req.itemId))) {
    return { unlocked: false, reason: "You need an item you have not found yet." };
  }
  if (req.xp && Number(p.xp || 0) < Number(req.xp)) {
    return { unlocked: false, reason: `${Number(req.xp) - Number(p.xp || 0)} more XP needed.` };
  }
  return { unlocked: true, reason: null };
}

/** A boss challenge: N correct in a row, no hints. Returns the running state. */
function bossAttempt(state, { correct, usedHint }) {
  const need = Number((state && state.need) || 5);
  const streak = correct && !usedHint ? Number((state && state.streak) || 0) + 1 : 0;
  return {
    need,
    streak,
    won: streak >= need,
    // A miss costs the streak, never the progress — the point is practice.
    broke: Boolean(state && state.streak) && streak === 0,
  };
}

/** Total XP for a win, including any loot that boosts it. */
function totalXp(kind, lootEffects = []) {
  const base = encounterXp(kind);
  const bonus = lootEffects.reduce((n, e) => n + Number((e && e.xpBonus) || 0), 0);
  return base + bonus;
}

/**
 * Which real-life rewards has this learner just earned?
 * A reward is earned when its XP cost is met and every stated requirement is.
 * The app never grants anything automatically — a guide still hands it over.
 */
function newlyEarnedRewards(rewards, progress) {
  const p = progress || {};
  const won = p.won instanceof Set ? p.won : new Set(p.won || []);
  const badges = p.badges instanceof Set ? p.badges : new Set(p.badges || []);
  const courses = p.coursesCompleted instanceof Set ? p.coursesCompleted : new Set(p.coursesCompleted || []);
  return (rewards || []).filter((r) => {
    if (r.status !== "available") return false;
    if (r.cost_xp && Number(p.xp || 0) < Number(r.cost_xp)) return false;
    const req = r.requires || {};
    if (req.encounterId && !won.has(Number(req.encounterId))) return false;
    if (req.badge && !badges.has(String(req.badge))) return false;
    if (req.courseId && !courses.has(Number(req.courseId))) return false;
    return true;
  });
}

/** Build a starter set of encounters for a course, from the game type's beats.
 *  One chapter per unit; the last chapter always ends on a boss. */
function planEncounters({ gameTypeId, chapters }) {
  const g = gameType(gameTypeId);
  const out = [];
  const list = Array.isArray(chapters) ? chapters : [];
  list.forEach((chapter, ci) => {
    const isLast = ci === list.length - 1;
    g.beats.forEach((beat, bi) => {
      const lastBeat = bi === g.beats.length - 1;
      const kind = lastBeat && isLast ? "boss" : beat;
      out.push({
        chapter_index: ci,
        kind,
        title: lastBeat
          ? `${chapter.title || `Chapter ${ci + 1}`} — ${kind === "boss" ? "the final stand" : "the guardian"}`
          : `${chapter.title || `Chapter ${ci + 1}`}: ${beat}`,
        narration: chapter.hook || null,
        // Gate on lessons finished so play tracks real work, not clicking.
        requires: { lessonsDone: ci * 3 + bi + 1 },
        rewards: { xp: encounterXp(kind) },
        position: bi,
      });
    });
  });
  return out;
}

module.exports = {
  GAME_TYPES, RARITIES, RARITY_XP, gameType,
  rollRarity, encounterXp, totalXp, isUnlocked, bossAttempt,
  newlyEarnedRewards, planEncounters,
};
