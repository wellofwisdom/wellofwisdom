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

module.exports = { fleshOutWorld, normalizeBeats, buildPrompt, SYSTEM };
