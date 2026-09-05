// SPDX-License-Identifier: AGPL-3.0-or-later
// Worlds: encounters, characters, loot, inventory and real-life rewards.
//
// Guides build the world; learners play it. Both sides live here because they
// share the same ownership check: everything hangs off an adventure, and an
// adventure belongs to exactly one family.
//
// One rule worth stating out loud: a real-life reward is never granted by the
// app. It can become "earned"; a guide marks it "granted" once they have
// actually handed it over. Nothing here spends money or touches a store.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const quest = require("../lib/quest");
const { gradeExercise } = require("../lib/grade");

const router = express.Router();
router.use(auth.authRequired);

// A boss answer that arrives a little late still counts: the clock is measured
// on the server (the client cannot be trusted with it), so this covers the one
// network round trip between serving a question and hearing the answer.
const TIME_GRACE_SEC = 3;

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The adventure, if it belongs to the caller's family. */
async function ownedAdventure(adventureId, familyId) {
  const { rows } = await db.query(
    `select id, family_id, learner_id, course_id, theme_id, game_type, world, xp, state, cover_url
       from adventures where id = $1 and family_id = $2`,
    [adventureId, familyId]
  );
  return rows[0] || null;
}

/** Everything the unlock rules need, in one place. */
async function progressSnapshot(learnerId, familyId, adventureId) {
  const [stats, won, inv, badges, courses, adv] = await Promise.all([
    db.query(
      `select (select count(*) from lesson_completions where learner_id = $1)::int as lessons_done`,
      [learnerId]
    ),
    db.query(
      `select e.id from encounter_progress p join adventure_encounters e on e.id = p.encounter_id
        where p.learner_id = $1 and p.state = 'won'`,
      [learnerId]
    ),
    db.query("select loot_id from learner_inventory where learner_id = $1", [learnerId]),
    db.query("select badge from badges where learner_id = $1", [learnerId]),
    db.query(
      `select c.id from courses c
        where c.family_id = $2 and c.status = 'published'
          and (select count(*) from lessons l join units u on u.id = l.unit_id where u.course_id = c.id) > 0
          and (select count(*) from lessons l join units u on u.id = l.unit_id where u.course_id = c.id)
              <= (select count(*) from lesson_completions lc where lc.course_id = c.id and lc.learner_id = $1)`,
      [learnerId, familyId]
    ),
    adventureId ? db.query("select xp from adventures where id = $1", [adventureId]) : Promise.resolve({ rows: [] }),
  ]);
  // A correct streak is "since the last wrong answer", read from attempt history.
  const recent = await db.query(
    "select correct from attempts where learner_id = $1 order by created_at desc limit 50",
    [learnerId]
  );
  let streak = 0;
  for (const a of recent.rows) {
    if (a.correct === true) streak++;
    else if (a.correct === false) break;
  }
  return {
    lessonsDone: stats.rows[0].lessons_done,
    correctStreak: streak,
    xp: adv.rows[0] ? adv.rows[0].xp : 0,
    won: new Set(won.rows.map((r) => Number(r.id))),
    inventory: new Set(inv.rows.map((r) => Number(r.loot_id))),
    badges: new Set(badges.rows.map((r) => r.badge)),
    coursesCompleted: new Set(courses.rows.map((r) => Number(r.id))),
  };
}

/** A boss or miniboss encounter, with the pieces a fight needs: its win
 *  conditions, its course (where the questions come from) and its cutscene. */
async function bossEncounter(id, familyId) {
  const { rows } = await db.query(
    `select e.id, e.kind, e.requires, e.rewards, e.video_upload_id,
            a.id as adventure_id, a.course_id, a.family_id, a.xp as adventure_xp
       from adventure_encounters e join adventures a on a.id = e.adventure_id
      where e.id = $1 and a.family_id = $2`,
    [id, familyId]
  );
  return rows[0] || null;
}

/** The gradable exercises a boss can draw on: multiple choice and numeric, from
 *  the adventure's own course. Text answers are self-checked, so they cannot
 *  gate a fight. */
async function bossQuestionPool(courseId, familyId) {
  const { rows } = await db.query(
    `select i.id, i.type, i.content
       from lesson_items i
       join lessons l on l.id = i.lesson_id
       join units u on u.id = l.unit_id
       join courses c on c.id = u.course_id
      where u.course_id = $1 and c.family_id = $2
        and i.type = 'exercise'
        and (i.content->>'kind') in ('mcq', 'numeric')`,
    [courseId, familyId]
  );
  return rows;
}

async function bossQuestionRow(itemId, courseId) {
  const { rows } = await db.query(
    `select i.id, i.type, i.content
       from lesson_items i
       join lessons l on l.id = i.lesson_id
       join units u on u.id = l.unit_id
      where i.id = $1 and u.course_id = $2`,
    [itemId, courseId]
  );
  return rows[0] || null;
}

/** A boss question with every answer, explanation and hint stripped out, the
 *  same trust boundary the lesson player uses. Grading happens server-side. */
function bossQuestion(item) {
  if (!item) return null;
  const c = item.content || {};
  const out = { id: Number(item.id), prompt: c.prompt, kind: c.kind };
  if (c.choices) out.choices = c.choices;
  return out;
}

/** Pay out a won encounter: its loot, its XP (loot bonuses included) and any
 *  real reward it just brought within reach. Fail-open throughout, because a
 *  bookkeeping hiccup must never cost a learner a win they earned. Shared by the
 *  plain resolve and the boss fight so the reward is identical either way. */
async function grantEncounterWin(enc, learnerId, familyId) {
  const lootIds = Array.isArray(enc.rewards && enc.rewards.loot) ? enc.rewards.loot.map(num).filter(Boolean) : [];
  const effects = [];
  for (const lootId of lootIds) {
    const l = await db.query(
      "select id, effect from loot_items where id = $1 and family_id = $2",
      [lootId, familyId]
    ).catch(() => ({ rows: [] }));
    if (!l.rows[0]) continue;
    effects.push(l.rows[0].effect || {});
    await db.query(
      `insert into learner_inventory (learner_id, loot_id, qty) values ($1,$2,1)
       on conflict (learner_id, loot_id) do update set qty = learner_inventory.qty + 1`,
      [learnerId, lootId]
    ).catch(() => {});
  }

  const gained = quest.totalXp(enc.kind, effects);
  await db.query("update adventures set xp = xp + $2 where id = $1", [enc.adventure_id, gained]).catch(() => {});

  const after = await progressSnapshot(learnerId, familyId, enc.adventure_id);
  const rewards = await db.query(
    `select * from real_rewards
      where family_id = $1 and status = 'available' and (learner_id is null or learner_id = $2)`,
    [familyId, learnerId]
  ).catch(() => ({ rows: [] }));
  const earned = quest.newlyEarnedRewards(rewards.rows, after);
  for (const r of earned) {
    await db.query(
      "update real_rewards set status = 'earned', earned_at = now() where id = $1 and status = 'available'",
      [r.id]
    ).catch(() => {});
  }

  return {
    xpGained: gained,
    loot: lootIds,
    earnedRewards: earned.map((r) => ({ id: Number(r.id), title: r.title, kind: r.kind })),
  };
}

// ---------------------------------------------------------------- game types

router.get("/game-types", (_req, res) => {
  res.json({ gameTypes: quest.GAME_TYPES });
});

// ---------------------------------------------------------------- the world

/** The playable state of one adventure for the current learner (or a named
 *  learner, if a guide is looking). */
router.get("/:adventureId", async (req, res, next) => {
  try {
    const adventureId = num(req.params.adventureId);
    if (adventureId === null) return bad(res, "id_invalid");
    const adv = await ownedAdventure(adventureId, req.user.familyId);
    if (!adv) return bad(res, "not_found", 404);

    const learnerId = req.user.role === "learner"
      ? req.user.id
      : num(req.query.learnerId) || adv.learner_id;

    const [chars, encs] = await Promise.all([
      db.query(
        `select id, name, role, bio, portrait_url, stats, created_by_learner, approved, position
           from adventure_characters where adventure_id = $1 order by position, id`,
        [adventureId]
      ),
      db.query(
        `select id, chapter_index, kind, title, narration, art_url, video_upload_id,
                requires, rewards, choices, position
           from adventure_encounters where adventure_id = $1 order by chapter_index, position, id`,
        [adventureId]
      ),
    ]);

    let progress = null;
    let states = new Map();
    if (learnerId) {
      progress = await progressSnapshot(learnerId, req.user.familyId, adventureId);
      const p = await db.query(
        "select encounter_id, state, attempts, won_at from encounter_progress where learner_id = $1",
        [learnerId]
      );
      states = new Map(p.rows.map((r) => [Number(r.encounter_id), r]));
    }

    const encounters = encs.rows.map((e) => {
      const saved = states.get(Number(e.id));
      const gate = progress ? quest.isUnlocked(e, progress) : { unlocked: false, reason: "Pick a learner." };
      const won = saved && saved.state === "won";
      return {
        ...e,
        id: Number(e.id),
        video_upload_id: e.video_upload_id ? Number(e.video_upload_id) : null,
        state: won ? "won" : gate.unlocked ? "available" : "locked",
        lockedReason: won ? null : gate.reason,
        attempts: saved ? saved.attempts : 0,
        wonAt: saved ? saved.won_at : null,
      };
    });

    res.json({
      adventure: {
        ...adv,
        id: Number(adv.id),
        learner_id: adv.learner_id ? Number(adv.learner_id) : null,
        course_id: Number(adv.course_id),
      },
      gameType: quest.gameType(adv.game_type),
      characters: chars.rows
        // A learner's unapproved character is visible to its author and to guides.
        .filter((c) => c.approved || req.user.role === "parent" || Number(c.created_by_learner) === req.user.id)
        .map((c) => ({ ...c, id: Number(c.id), created_by_learner: c.created_by_learner ? Number(c.created_by_learner) : null })),
      encounters,
      progress: progress
        ? { lessonsDone: progress.lessonsDone, correctStreak: progress.correctStreak, xp: progress.xp }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/** Lay down a starter set of encounters from the game type's rhythm. */
router.post("/:adventureId/plan", auth.parentOnly, async (req, res, next) => {
  try {
    const adventureId = num(req.params.adventureId);
    const adv = await ownedAdventure(adventureId, req.user.familyId);
    if (!adv) return bad(res, "not_found", 404);
    const gameTypeId = String((req.body && req.body.gameType) || adv.game_type || "story");
    if (!quest.GAME_TYPES.some((g) => g.id === gameTypeId)) return bad(res, "game_type_invalid");

    const existing = await db.query(
      "select count(*)::int as n from adventure_encounters where adventure_id = $1",
      [adventureId]
    );
    if (existing.rows[0].n > 0 && !req.body.replace) return bad(res, "already_planned", 409);
    if (req.body.replace) await db.query("delete from adventure_encounters where adventure_id = $1", [adventureId]);

    const chapters = (adv.world && adv.world.chapters) || [];
    const plan = quest.planEncounters({ gameTypeId, chapters });
    for (const e of plan) {
      await db.query(
        `insert into adventure_encounters
           (adventure_id, chapter_index, kind, title, narration, requires, rewards, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [adventureId, e.chapter_index, e.kind, e.title, e.narration,
          JSON.stringify(e.requires), JSON.stringify(e.rewards), e.position]
      );
    }
    await db.query("update adventures set game_type = $2 where id = $1", [adventureId, gameTypeId]);
    res.status(201).json({ ok: true, created: plan.length, gameType: gameTypeId });
  } catch (err) {
    next(err);
  }
});

/** Write the story into the encounters. Slow, so it runs as a job. */
router.post("/:adventureId/beats", auth.parentOnly, async (req, res, next) => {
  try {
    const adventureId = num(req.params.adventureId);
    const adv = await ownedAdventure(adventureId, req.user.familyId);
    if (!adv) return bad(res, "not_found", 404);
    const n = await db.query(
      "select count(*)::int as n from adventure_encounters where adventure_id = $1",
      [adventureId]
    );
    if (!n.rows[0].n) return bad(res, "build_the_world_first");
    const jobs = require("../lib/jobs");
    const jobId = await jobs.enqueue(req.user.familyId, "world-beats", { adventureId }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

/** Illustrate the encounters. Costs money per image, so it is always an
 *  explicit request and it reports how many are waiting before it starts. */
router.post("/:adventureId/art", auth.parentOnly, async (req, res, next) => {
  try {
    const adventureId = num(req.params.adventureId);
    const adv = await ownedAdventure(adventureId, req.user.familyId);
    if (!adv) return bad(res, "not_found", 404);
    const media = require("../lib/media");
    const st = await media.status();
    if (!st.canImage) return bad(res, "image_generation_not_configured", 503);

    const pending = await db.query(
      `select count(*)::int as n from adventure_encounters
        where adventure_id = $1 and art_url is null and rewards ? 'artPrompt'`,
      [adventureId]
    );
    if (!pending.rows[0].n) return bad(res, "nothing_to_draw");

    const jobs = require("../lib/jobs");
    const jobId = await jobs.enqueue(
      req.user.familyId, "world-art", { adventureId, created_by: req.user.id }, req.user.id
    );
    res.status(202).json({ jobId, pending: pending.rows[0].n });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- encounters

router.patch("/encounters/:id", auth.parentOnly, async (req, res, next) => {
  try {
    const id = num(req.params.id);
    const b = req.body || {};
    const sets = [];
    const params = [id, req.user.familyId];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (b.title !== undefined) add("title", String(b.title).slice(0, 200));
    if (b.narration !== undefined) add("narration", b.narration ? String(b.narration).slice(0, 4000) : null);
    if (b.artUrl !== undefined) add("art_url", b.artUrl ? String(b.artUrl).slice(0, 600) : null);
    if (b.requires !== undefined) add("requires", JSON.stringify(b.requires || {}));
    if (b.rewards !== undefined) add("rewards", JSON.stringify(b.rewards || {}));
    if (b.choices !== undefined) add("choices", JSON.stringify(b.choices || []));
    if (b.videoUploadId !== undefined) {
      if (b.videoUploadId === null) add("video_upload_id", null);
      else {
        const own = await db.query(
          "select 1 from uploads where id = $1 and family_id = $2 and kind = 'video'",
          [num(b.videoUploadId), req.user.familyId]
        );
        if (!own.rowCount) return bad(res, "upload_not_found", 404);
        add("video_upload_id", num(b.videoUploadId));
      }
    }
    if (!sets.length) return bad(res, "nothing_to_update");

    const { rows } = await db.query(
      `update adventure_encounters e set ${sets.join(", ")}
         from adventures a
        where e.adventure_id = a.id and e.id = $1 and a.family_id = $2
        returning e.id`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** A learner takes on an encounter. Wins pay XP and loot, and may bring a
 *  real-life reward within reach. */
router.post("/encounters/:id/resolve", async (req, res, next) => {
  try {
    const id = num(req.params.id);
    if (id === null) return bad(res, "id_invalid");
    const learnerId = req.user.role === "learner" ? req.user.id : num(req.body && req.body.learnerId);
    if (!learnerId) return bad(res, "learner_required");

    const { rows } = await db.query(
      `select e.*, a.id as adventure_id, a.family_id, a.xp as adventure_xp
         from adventure_encounters e join adventures a on a.id = e.adventure_id
        where e.id = $1 and a.family_id = $2`,
      [id, req.user.familyId]
    );
    const enc = rows[0];
    if (!enc) return bad(res, "not_found", 404);

    const snapshot = await progressSnapshot(learnerId, req.user.familyId, enc.adventure_id);
    const gate = quest.isUnlocked(enc, snapshot);
    if (!gate.unlocked) return res.status(409).json({ error: "locked", reason: gate.reason });

    const outcome = String((req.body && req.body.outcome) || "won");
    const choice = req.body && req.body.choice ? String(req.body.choice).slice(0, 80) : null;

    // A boss is not won by declaring it. It has to be fought (the boss routes
    // below), so a client cannot post its way past the challenge.
    if (outcome === "won" && (enc.kind === "boss" || enc.kind === "miniboss")) {
      return bad(res, "boss_must_be_fought", 409);
    }

    await db.query(
      `insert into encounter_progress (learner_id, encounter_id, state, attempts, choice_taken, won_at, updated_at)
       values ($1,$2,$3,1,$4, case when $3 = 'won' then now() else null end, now())
       on conflict (learner_id, encounter_id) do update
         set state = excluded.state,
             attempts = encounter_progress.attempts + 1,
             choice_taken = coalesce(excluded.choice_taken, encounter_progress.choice_taken),
             won_at = coalesce(encounter_progress.won_at, excluded.won_at),
             updated_at = now()`,
      [learnerId, id, outcome === "won" ? "won" : "in_progress", choice]
    );

    if (outcome !== "won") return res.json({ ok: true, state: "in_progress" });

    const summary = await grantEncounterWin(enc, learnerId, req.user.familyId);
    res.json({ ok: true, state: "won", ...summary });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------- boss fights

/** Begin a boss fight. The learner must answer a streak of questions correctly
 *  in a row, each inside a time limit, with no hints. Everything the challenge
 *  turns on (which questions, in what order, the clock, the streak) is decided
 *  and held here, never in the client. */
router.post("/encounters/:id/boss/start", async (req, res, next) => {
  try {
    const id = num(req.params.id);
    if (id === null) return bad(res, "id_invalid");
    const learnerId = req.user.role === "learner" ? req.user.id : num(req.body && req.body.learnerId);
    if (!learnerId) return bad(res, "learner_required");

    const enc = await bossEncounter(id, req.user.familyId);
    if (!enc) return bad(res, "not_found", 404);
    if (enc.kind !== "boss" && enc.kind !== "miniboss") return bad(res, "not_a_boss");

    const done = await db.query(
      "select state from encounter_progress where learner_id = $1 and encounter_id = $2",
      [learnerId, id]
    );
    if (done.rows[0] && done.rows[0].state === "won") return res.json({ state: "won", alreadyWon: true });

    const snapshot = await progressSnapshot(learnerId, req.user.familyId, enc.adventure_id);
    const gate = quest.isUnlocked(enc, snapshot);
    if (!gate.unlocked) return res.status(409).json({ error: "locked", reason: gate.reason });

    const pool = await bossQuestionPool(enc.course_id, req.user.familyId);
    if (!pool.length) return bad(res, "no_questions", 409);

    const rules = quest.bossRules(enc.kind, enc.rewards || {});
    const questions = shuffle(pool.map((p) => Number(p.id))).slice(0, Math.max(rules.need * 2, 8));
    const run = {
      need: rules.need, timeLimitSec: rules.timeLimitSec,
      questions, index: 0, streak: 0, servedAt: Date.now(),
    };

    await db.query(
      `insert into encounter_progress (learner_id, encounter_id, state, attempts, boss_run, updated_at)
       values ($1,$2,'in_progress',0,$3,now())
       on conflict (learner_id, encounter_id) do update
         set state = 'in_progress', boss_run = excluded.boss_run, updated_at = now()`,
      [learnerId, id, JSON.stringify(run)]
    );

    const first = pool.find((p) => Number(p.id) === quest.bossQuestionId(run));
    res.status(201).json({
      state: "fighting",
      need: run.need,
      streak: 0,
      timeLimitSec: run.timeLimitSec,
      question: bossQuestion(first),
    });
  } catch (err) {
    next(err);
  }
});

/** One answer in the fight. The server grades the question the run is on (the
 *  client cannot choose it), reads its own clock for the time limit, and moves
 *  the streak. A clean answer advances it; a wrong answer, a hint or a timeout
 *  resets it to zero, but the run continues: a miss is practice, not a wall.
 *  Reaching the streak wins the encounter and pays it out, cutscene and all. */
router.post("/encounters/:id/boss/answer", async (req, res, next) => {
  try {
    const id = num(req.params.id);
    if (id === null) return bad(res, "id_invalid");
    const learnerId = req.user.role === "learner" ? req.user.id : num(req.body && req.body.learnerId);
    if (!learnerId) return bad(res, "learner_required");

    const enc = await bossEncounter(id, req.user.familyId);
    if (!enc) return bad(res, "not_found", 404);

    const prog = await db.query(
      "select state, boss_run from encounter_progress where learner_id = $1 and encounter_id = $2",
      [learnerId, id]
    );
    const run = prog.rows[0] && prog.rows[0].boss_run;
    if (!run || !Array.isArray(run.questions)) return bad(res, "no_active_run", 409);

    const qId = quest.bossQuestionId(run);
    const item = await bossQuestionRow(qId, enc.course_id);
    if (!item) return bad(res, "question_gone", 409);
    const c = item.content || {};

    const answer = req.body && req.body.answer;
    const correct = gradeExercise(c, answer) === true;
    const elapsedSec = (Date.now() - Number(run.servedAt || Date.now())) / 1000;
    const timedOut = elapsedSec > Number(run.timeLimitSec || 30) + TIME_GRACE_SEC;

    // A boss question is real practice: record it like any graded attempt, so it
    // feeds spaced review, badges and the learner's streak. All fail-open.
    db.query(
      "insert into attempts (family_id, learner_id, item_id, question_index, correct, answer) values ($1,$2,$3,0,$4,$5)",
      [req.user.familyId, learnerId, qId, correct, JSON.stringify(answer ?? null)]
    ).catch(() => {});
    require("../lib/review").recordAttempt({ familyId: req.user.familyId, learnerId, itemId: qId, correct });
    require("../lib/badges").checkAndAward(learnerId, req.user.familyId).catch(() => {});
    if (correct) {
      db.query(
        "update adventures set xp = xp + 10 where id = $1 and family_id = $2",
        [enc.adventure_id, req.user.familyId]
      ).catch(() => {});
    }

    const step = quest.bossStep(run, { correct, usedHint: false, timedOut });

    if (step.won) {
      await db.query(
        `update encounter_progress
            set state = 'won', boss_run = null, won_at = coalesce(won_at, now()),
                attempts = attempts + 1, updated_at = now()
          where learner_id = $1 and encounter_id = $2`,
        [learnerId, id]
      );
      const summary = await grantEncounterWin(enc, learnerId, req.user.familyId);
      return res.json({
        state: "won",
        correct,
        streak: step.streak,
        need: step.need,
        videoUploadId: enc.video_upload_id ? Number(enc.video_upload_id) : null,
        ...summary,
      });
    }

    const nextRun = { ...run, index: step.index, streak: step.streak, servedAt: Date.now() };
    await db.query(
      "update encounter_progress set boss_run = $3, attempts = attempts + 1, updated_at = now() where learner_id = $1 and encounter_id = $2",
      [learnerId, id, JSON.stringify(nextRun)]
    );

    const nextItem = await bossQuestionRow(quest.bossQuestionId(nextRun), enc.course_id);
    res.json({
      state: "fighting",
      correct,
      streak: step.streak,
      need: step.need,
      brokeBy: step.brokeBy,
      timeLimitSec: nextRun.timeLimitSec,
      question: bossQuestion(nextItem),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- characters

/** A learner inventing their own character is the co-creation path, so this is
 *  open to learners. But theirs arrives unapproved. */
router.post("/:adventureId/characters", async (req, res, next) => {
  try {
    const adventureId = num(req.params.adventureId);
    const adv = await ownedAdventure(adventureId, req.user.familyId);
    if (!adv) return bad(res, "not_found", 404);
    const b = req.body || {};
    const name = String(b.name || "").trim().slice(0, 80);
    if (!name) return bad(res, "name_required");
    const role = ["self", "ally", "mentor", "rival", "boss", "creature"].includes(b.role) ? b.role : "ally";
    const byLearner = req.user.role === "learner";

    const { rows } = await db.query(
      `insert into adventure_characters
         (adventure_id, family_id, name, role, bio, stats, created_by_learner, approved, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
               coalesce((select max(position)+1 from adventure_characters where adventure_id = $1), 0))
       returning id, name, role, bio, portrait_url, approved, created_by_learner`,
      [adventureId, req.user.familyId, name, role,
        b.bio ? String(b.bio).slice(0, 2000) : null,
        JSON.stringify(b.stats || {}),
        byLearner ? req.user.id : null,
        !byLearner]
    );
    res.status(201).json({ character: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

router.patch("/characters/:id", async (req, res, next) => {
  try {
    const id = num(req.params.id);
    const b = req.body || {};
    const own = await db.query(
      "select id, family_id, created_by_learner, approved from adventure_characters where id = $1 and family_id = $2",
      [id, req.user.familyId]
    );
    const ch = own.rows[0];
    if (!ch) return bad(res, "not_found", 404);
    // A learner may edit their own creation until a guide approves it.
    const mine = Number(ch.created_by_learner) === req.user.id;
    if (req.user.role !== "parent" && !(mine && !ch.approved)) return bad(res, "forbidden", 403);
    if (b.approved !== undefined && req.user.role !== "parent") return bad(res, "parent_only", 403);

    const sets = [];
    const params = [id, req.user.familyId];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (b.name !== undefined) add("name", String(b.name).trim().slice(0, 80));
    if (b.bio !== undefined) add("bio", b.bio ? String(b.bio).slice(0, 2000) : null);
    if (b.portraitUrl !== undefined) add("portrait_url", b.portraitUrl ? String(b.portraitUrl).slice(0, 600) : null);
    if (b.stats !== undefined) add("stats", JSON.stringify(b.stats || {}));
    if (b.approved !== undefined) add("approved", Boolean(b.approved));
    if (!sets.length) return bad(res, "nothing_to_update");

    const { rows } = await db.query(
      `update adventure_characters set ${sets.join(", ")} where id = $1 and family_id = $2 returning id`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/characters/:id", auth.parentOnly, async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from adventure_characters where id = $1 and family_id = $2",
      [num(req.params.id), req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- loot

router.get("/loot/all", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "select id, name, description, icon, art_url, rarity, effect, adventure_id from loot_items where family_id = $1 order by id",
      [req.user.familyId]
    );
    res.json({ loot: rows.map((r) => ({ ...r, id: Number(r.id) })) });
  } catch (err) {
    next(err);
  }
});

router.post("/loot", auth.parentOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || "").trim().slice(0, 80);
    if (!name) return bad(res, "name_required");
    const rarity = quest.RARITIES.includes(b.rarity) ? b.rarity : "common";
    const { rows } = await db.query(
      `insert into loot_items (family_id, adventure_id, name, description, icon, art_url, rarity, effect)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, name, rarity, icon`,
      [req.user.familyId, b.adventureId ? num(b.adventureId) : null, name,
        b.description ? String(b.description).slice(0, 1000) : null,
        b.icon ? String(b.icon).slice(0, 8) : null,
        b.artUrl ? String(b.artUrl).slice(0, 600) : null,
        rarity, JSON.stringify(b.effect || {})]
    );
    res.status(201).json({ loot: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

/** What a learner is carrying. */
router.get("/inventory/:learnerId", async (req, res, next) => {
  try {
    const learnerId = req.user.role === "learner" ? req.user.id : num(req.params.learnerId);
    const { rows } = await db.query(
      `select l.id, l.name, l.description, l.icon, l.art_url, l.rarity, l.effect, i.qty, i.earned_at
         from learner_inventory i join loot_items l on l.id = i.loot_id
         join users u on u.id = i.learner_id
        where i.learner_id = $1 and u.family_id = $2
        order by i.earned_at desc`,
      [learnerId, req.user.familyId]
    );
    res.json({ inventory: rows.map((r) => ({ ...r, id: Number(r.id) })) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- rewards

router.get("/rewards/list", async (req, res, next) => {
  try {
    const learnerId = req.user.role === "learner" ? req.user.id : num(req.query.learnerId);
    const { rows } = await db.query(
      `select id, learner_id, title, description, kind, url, image_url, cost_xp,
              requires, status, earned_at, granted_at
         from real_rewards
        where family_id = $1 and status <> 'archived'
          ${learnerId ? "and (learner_id is null or learner_id = $2)" : ""}
        order by case status when 'earned' then 0 when 'available' then 1 else 2 end, created_at desc`,
      learnerId ? [req.user.familyId, learnerId] : [req.user.familyId]
    );
    res.json({
      rewards: rows.map((r) => ({
        ...r, id: Number(r.id), learner_id: r.learner_id ? Number(r.learner_id) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/rewards", auth.parentOnly, async (req, res, next) => {
  try {
    const b = req.body || {};
    const title = String(b.title || "").trim().slice(0, 160);
    if (!title) return bad(res, "title_required");
    const kind = ["game", "wishlist", "outing", "screen_time", "money", "other"].includes(b.kind) ? b.kind : "other";
    const { rows } = await db.query(
      `insert into real_rewards
         (family_id, learner_id, title, description, kind, url, image_url, cost_xp, requires, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, title, kind, cost_xp, status`,
      [req.user.familyId, b.learnerId ? num(b.learnerId) : null, title,
        b.description ? String(b.description).slice(0, 1000) : null, kind,
        b.url ? String(b.url).slice(0, 600) : null,
        b.imageUrl ? String(b.imageUrl).slice(0, 600) : null,
        b.costXp != null ? num(b.costXp) : null,
        JSON.stringify(b.requires || {}), req.user.id]
    );
    res.status(201).json({ reward: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

/** The guide confirms they have actually handed it over. Only an owner or guide
 *  grants a real reward: an assistant sets up a world but does not sign off that
 *  something changed hands. */
router.post("/rewards/:id/grant", auth.requirePerm("grant_reward"), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `update real_rewards set status = 'granted', granted_at = now(), granted_by = $3
        where id = $1 and family_id = $2 and status in ('earned', 'available')
        returning id, title, status`,
      [num(req.params.id), req.user.familyId, req.user.id]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ reward: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

router.delete("/rewards/:id", auth.parentOnly, async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "update real_rewards set status = 'archived' where id = $1 and family_id = $2",
      [num(req.params.id), req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
