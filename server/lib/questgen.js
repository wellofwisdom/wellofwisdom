// SPDX-License-Identifier: AGPL-3.0-or-later
// Writes the prose for a world's encounters.
//
// Generating the encounter skeleton from a game type gives structure but no
// story: a learner sees "Chapter 2: battle" and nothing happens inside them.
// This fills each one with narration that belongs to their world and points at
// the actual lesson it gates on, so the fiction and the schoolwork are the same
// motion rather than a theme pasted over a checklist.
//
// Every output passes a normalizer before it is stored, same trust boundary as
// course generation.
const ai = require("./ai");
const db = require("./db");

const SYSTEM = `You write short interactive-fiction beats for a child's learning adventure.
Rules:
- Second person, present tense. The learner IS the protagonist.
- Two to four sentences per beat. Vivid and concrete, never florid.
- The beat must GESTURE at the real skill being practised without teaching it
  and without ever stating a school subject name. If the lesson is about
  fractions, the beat might involve splitting something fairly. Never say
  "fractions", "maths", "this lesson".
- Use ONLY the characters and places given. Invent no new named characters.
- No violence beyond storybook peril. Nobody dies. Nothing is scary at night.
- A boss beat raises the stakes but stays winnable and warm.
- Never mention XP, points, levels, or the app itself.`;

function clean(s, max) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Trust boundary: the model's output only ever becomes these fields. */
function normalizeBeats(raw, expected) {
  const list = Array.isArray(raw && raw.beats) ? raw.beats : Array.isArray(raw) ? raw : null;
  if (!list) return null;
  const out = [];
  for (const b of list.slice(0, expected)) {
    const narration = clean(b && b.narration, 1200);
    if (!narration) continue;
    out.push({
      encounterId: Number(b && b.encounterId) || null,
      title: clean(b && b.title, 160) || null,
      narration,
      artPrompt: clean(b && b.artPrompt, 500) || null,
    });
  }
  return out.length ? out : null;
}

function buildPrompt({ world, gameType, chapter, encounters, lessonTitles }) {
  const characters = (world.characters || [])
    .map((c) => `${c.name} (${c.role || "ally"})`)
    .join(", ") || "the learner alone";

  return [
    `WORLD: ${world.title || "an adventure"}. ${world.tagline || ""}`,
    world.setting ? `SETTING: ${world.setting}` : "",
    `CAST (use only these): ${characters}`,
    `CHAPTER: ${chapter.title || "this stretch of the journey"}${chapter.hook ? ` (${chapter.hook})` : ""}`,
    `HOW IT PLAYS: ${gameType.label}. ${gameType.blurb}`,
    lessonTitles.length
      ? `THE REAL WORK behind this chapter, for flavour only, never named aloud: ${lessonTitles.join("; ")}`
      : "",
    "",
    "Write one beat for each encounter below, in order. Keep each beat's own kind:",
    ...encounters.map((e) => `- id ${e.id}: kind "${e.kind}", working title "${e.title}"`),
    "",
    'Return JSON: {"beats":[{"encounterId":number,"title":"a better title, 8 words max",',
    '"narration":"2-4 sentences","artPrompt":"one line describing the scene for an illustrator, no text in image"}]}',
  ].filter(Boolean).join("\n");
}

/** Write prose for every encounter in one adventure, chapter by chapter.
 *  Returns { written, chapters }. Fails soft per chapter: one bad chapter
 *  must not cost the rest. */
async function fleshOutWorld({ adventureId, familyId }) {
  const adv = await db.query(
    `select a.id, a.world, a.game_type, a.course_id
       from adventures a where a.id = $1 and a.family_id = $2`,
    [adventureId, familyId]
  );
  if (!adv.rows[0]) throw new Error("adventure_not_found");
  const world = adv.rows[0].world || {};
  const { gameType } = require("./quest");
  const gt = gameType(adv.rows[0].game_type);

  const encs = await db.query(
    `select id, chapter_index, kind, title, narration
       from adventure_encounters where adventure_id = $1
      order by chapter_index, position, id`,
    [adventureId]
  );
  if (!encs.rows.length) throw new Error("no_encounters");

  // Lesson titles per chapter, so a beat can nod at the real work.
  const lessons = await db.query(
    `select l.title, un.position as unit_pos
       from lessons l join units un on un.id = l.unit_id
      where un.course_id = $1 order by un.position, l.position`,
    [adv.rows[0].course_id]
  );

  const chapters = new Map();
  for (const e of encs.rows) {
    if (!chapters.has(e.chapter_index)) chapters.set(e.chapter_index, []);
    chapters.get(e.chapter_index).push(e);
  }

  let written = 0;
  for (const [ci, list] of chapters) {
    const chapter = (world.chapters || [])[ci] || { title: `Chapter ${ci + 1}` };
    const lessonTitles = lessons.rows.filter((l) => l.unit_pos === ci).map((l) => l.title).slice(0, 6);
    try {
      const out = await ai.chatJson(
        "course-gen",
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildPrompt({ world, gameType: gt, chapter, encounters: list, lessonTitles }) },
        ],
        { maxTokens: 2500, temperature: 0.8, usage: { familyId, note: `world beats: chapter ${ci + 1}` } }
      );
      const beats = normalizeBeats(out.json, list.length);
      if (!beats) continue;

      // Match by id when the model echoed one, else fall back to order.
      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const target = list.find((e) => Number(e.id) === beat.encounterId) || list[i];
        if (!target) continue;
        await db.query(
          `update adventure_encounters
              set narration = $2, title = coalesce($3, title)
            where id = $1`,
          [target.id, beat.narration, beat.title]
        );
        if (beat.artPrompt) {
          // Keep the illustrator's line for the art pass that comes next.
          await db.query(
            `update adventure_encounters
                set rewards = jsonb_set(coalesce(rewards, '{}'::jsonb), '{artPrompt}', to_jsonb($2::text), true)
              where id = $1`,
            [target.id, beat.artPrompt]
          ).catch(() => {});
        }
        written++;
      }
    } catch (err) {
      // One chapter failing must not lose the others.
      console.error(`[questgen] chapter ${ci} failed (skipped): ${err.message}`);
    }
  }

  if (!written) throw new Error("nothing_written");
  return { written, chapters: chapters.size };
}


/** Chapters that still need a cover. Pure, so the route's pending count and
 *  the job's work list can never disagree. */
function chaptersNeedingArt(world) {
  const chapters = world && Array.isArray(world.chapters) ? world.chapters : [];
  const out = [];
  chapters.forEach((chapter, index) => {
    if (chapter && typeof chapter === "object" && !chapter.artUrl) out.push({ chapter, index });
  });
  return out;
}

/** A chapter cover needs no new AI writing: the chapter already carries its
 *  title and hook, and the world its setting. Pure. */
function chapterPrompt(world, chapter) {
  const setting = (world && (world.setting || world.tagline)) || "an adventure";
  const title = String((chapter && chapter.title) || "").trim() || "the next chapter";
  const hook = String((chapter && chapter.hook) || "").trim();
  return `A wide, warm storybook illustration that opens a chapter of an adventure.
Chapter: ${title}.${hook ? ` ${hook}` : ""}
Setting: ${setting}
Consistent style across the set. No text, no words, no letters anywhere in the image.`;
}

/** A portrait prompt for a character row, built only from what the row says,
 *  so a guide's character and a learner's invention draw the same way the
 *  original cast did. Pure. */
function portraitPrompt(world, ch) {
  const setting = (world && (world.setting || world.tagline)) || "an adventure";
  const name = String((ch && ch.name) || "").trim() || "a character";
  const role = String((ch && ch.role) || "ally").trim() || "ally";
  const article = /^[aeiou]/i.test(role) ? "an" : "a";
  const bio = String((ch && ch.bio) || "").trim();
  return `A character portrait of ${name}, ${article} ${role} in this world.${bio ? ` ${bio}` : ""}
Setting: ${setting}
Children's storybook style, warm and inviting, painterly, consistent across the set.
No text, no words, no letters anywhere in the image.`;
}

/** Illustrate the world: encounters with a prompt waiting, chapter covers,
 *  and portraits for characters that have none.
 *
 *  Costs real money per image, so it only ever runs when a guide asks, it
 *  never re-illustrates something that already has art, and a single failure
 *  is skipped rather than aborting the batch. `max` caps one RUN (attempts,
 *  including skips) so a large world cannot quietly spend a fortune; whatever
 *  is left stays counted as pending for the next click.
 */
async function illustrateWorld({ adventureId, familyId, userId, max = 24 }) {
  const media = require("./media");
  const adv = await db.query(
    "select id, world from adventures where id = $1 and family_id = $2",
    [adventureId, familyId]
  );
  if (!adv.rows[0]) throw new Error("adventure_not_found");
  const world = adv.rows[0].world || {};

  const { rows } = await db.query(
    `select id, title, kind, rewards
       from adventure_encounters
      where adventure_id = $1 and art_url is null
        and rewards ? 'artPrompt'
      order by chapter_index, position, id
      limit $2`,
    [adventureId, max]
  );
  if (!rows.length) return { drawn: 0, skipped: 0, reason: "nothing_to_draw" };

  // One house style for the whole world, so the cards look like a set.
  const style = `Children's storybook illustration, warm and inviting, painterly,
consistent style across the set. Setting: ${world.setting || world.tagline || "an adventure"}.
No text, no words, no letters anywhere in the image.`;

  let drawn = 0;
  let skipped = 0;
  const budgetLeft = () => drawn + skipped < max;
  for (const e of rows) {
    const line = e.rewards && e.rewards.artPrompt;
    if (!line) { skipped++; continue; }
    try {
      const { url } = await media.generateImage({
        prompt: `${line}

${style}`,
        size: "1536x1024",
        purpose: "adventure-art",
        refType: "adventure",
        refId: adventureId,
        familyId,
        userId,
      });
      await db.query("update adventure_encounters set art_url = $2 where id = $1", [e.id, url]);
      drawn++;
    } catch (err) {
      skipped++;
      console.error(`[questgen] art for encounter ${e.id} failed (skipped): ${err.message}`);
    }
  }

  // Chapter covers: the journey view gets a banner per chapter. The art lives
  // on the chapter inside the world jsonb, where the learner view already
  // reads its chapters from.
  for (const { chapter, index } of chaptersNeedingArt(world)) {
    if (!budgetLeft()) break;
    try {
      const { url } = await media.generateImage({
        prompt: chapterPrompt(world, chapter),
        size: "1536x1024",
        purpose: "chapter-art",
        refType: "adventure",
        refId: adventureId,
        familyId,
        userId,
      });
      await db.query(
        `update adventures
            set world = jsonb_set(world, $3::text[], to_jsonb($2::text))
          where id = $1 and family_id = $4`,
        [adventureId, url, ["chapters", String(index), "artUrl"], familyId]
      );
      drawn++;
    } catch (err) {
      skipped++;
      console.error(`[questgen] art for chapter ${index} failed (skipped): ${err.message}`);
    }
  }

  // Portraits, for the cast the world actually shows. Only approved
  // characters: an unapproved invention is not in the world yet, and drawing
  // it would spend money on something a guide may still remove.
  if (budgetLeft()) {
    const chars = await db.query(
      `select id, name, role, bio
         from adventure_characters
        where adventure_id = $1 and family_id = $2 and approved and portrait_url is null
        order by position, id
        limit $3`,
      [adventureId, familyId, max]
    );
    for (const ch of chars.rows) {
      if (!budgetLeft()) break;
      try {
        const { url } = await media.generateImage({
          prompt: portraitPrompt(world, ch),
          size: "1024x1024",
          purpose: "character-portrait",
          refType: "adventure",
          refId: adventureId,
          familyId,
          userId,
        });
        await db.query("update adventure_characters set portrait_url = $2 where id = $1", [ch.id, url]);
        drawn++;
      } catch (err) {
        skipped++;
        console.error(`[questgen] portrait for character ${ch.id} failed (skipped): ${err.message}`);
      }
    }
  }
  return { drawn, skipped };
}

module.exports = {
  fleshOutWorld, illustrateWorld, normalizeBeats, buildPrompt, SYSTEM,
  chaptersNeedingArt, chapterPrompt, portraitPrompt,
};
