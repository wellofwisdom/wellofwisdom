// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio overviews: a short two-host podcast summary of one unit, NotebookLM
// style. The AI drafts a tight script from the unit's own lesson text (host A
// curious, host B concrete), every line is rendered voice by voice through the
// TTS path in media.js, and the mp3 bytes are concatenated into one upload
// carrying ref_type "overview" and the unit id. Regenerating a unit replaces
// its overview: the last one is the only one kept.
//
// Family data rule: the unit text goes to the configured AI provider (the
// script draft) and then to the configured TTS provider (the read aloud), the
// same two places every other generation job already uses, and nowhere else.
// Fails soft per line: one segment that will not render is skipped, never the
// batch. Only a unit with nothing to say (no script at all) fails the job.
const db = require("./db");
const ai = require("./ai");
const media = require("./media");
const storage = require("./storage");

// Caps: a tight summary, not a lecture. The prompt asks for these limits and
// the parser enforces them, so a runaway reply can only lose lines, never grow.
const MAX_SEGMENTS = 12;
const SEGMENT_MAX_CHARS = 380;
const TOTAL_MAX_CHARS = 3600;
// How much lesson text may feed the draft prompt. A unit runs a few lessons;
// this keeps even a bloated unit inside a normal context window.
const SOURCE_MAX_CHARS = 8000;

// The engine's two voices: host A (narrator) asks, host B (character) answers
// with specifics. Names resolve per provider inside media.speechSegment.
const HOST_ROLES = { a: "narrator", b: "character" };

/** Normalize the model's reply into playable lines: host a/b, whitespace
 *  collapsed, per-line and total caps enforced. Empty lines are dropped. */
function parseScript(json) {
  const raw = json && Array.isArray(json.segments) ? json.segments : [];
  const out = [];
  let total = 0;
  for (const s of raw) {
    if (out.length >= MAX_SEGMENTS || total >= TOTAL_MAX_CHARS) break;
    const text = String((s && s.text) || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const host = s && String(s.host || "").toLowerCase() === "b" ? "b" : "a";
    const clipped = text.slice(0, SEGMENT_MAX_CHARS);
    out.push({ host, text: clipped });
    total += clipped.length;
  }
  return out;
}

// MP3 frames decode independently, so joined bytes play as one stream. What
// does confuse decoders is an ID3 tag in the middle: every segment after the
// first loses its tag header (both the v2 block at the front and a trailing
// v1 "TAG" footer) so the file reads as one continuous recording.
function id3v2Size(buf) {
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return Math.min(10 + size, buf.length);
  }
  return 0;
}

function concatMp3(parts) {
  const clean = (parts || []).filter((b) => b && b.length);
  if (!clean.length) throw new Error("overview_no_audio");
  const rest = clean.slice(1).map((b) => {
    let seg = b.subarray(id3v2Size(b));
    if (seg.length >= 128 && seg.subarray(seg.length - 128, seg.length - 125).toString("latin1") === "TAG") {
      seg = seg.subarray(0, seg.length - 128);
    }
    return seg;
  });
  return Buffer.concat([clean[0], ...rest]);
}

/** Flatten the unit's lesson rows into one block of source text for the draft
 *  prompt. Articles and readers carry the argument, exercises carry the
 *  practice; everything is trimmed so a big unit stays inside the cap. */
function sourceFromRows(rows) {
  const parts = [];
  let lastLesson = null;
  for (const r of rows || []) {
    if (r.lesson_title !== lastLesson) {
      lastLesson = r.lesson_title;
      const head = `Lesson: ${r.lesson_title}${r.summary ? `. ${String(r.summary).trim()}` : ""}`;
      parts.push(head);
    }
    const c = r.content || {};
    if (r.type === "article") {
      parts.push(`${c.title || "Article"}: ${String(c.body || "").slice(0, 1500)}`);
    } else if (r.type === "graded_reader") {
      parts.push(`Reader ${c.level || ""}: ${String(c.body || "").slice(0, 1500)}`.replace(/\s+/g, " ").trim());
    } else if (r.type === "exercise") {
      parts.push(`Practice: ${String(c.prompt || "").slice(0, 200)}`);
    } else if (r.type === "project") {
      parts.push(`Project: ${c.title || ""}. ${String(c.description || "").slice(0, 300)}`.replace(/\s+/g, " ").trim());
    } else if (r.type === "video" && c.title) {
      parts.push(`Video: ${c.title}`);
    }
  }
  return parts.join("\n").slice(0, SOURCE_MAX_CHARS);
}

async function loadUnitSource(unitId, familyId) {
  const { rows } = await db.query(
    `select l.title as lesson_title, l.summary, i.type, i.content
       from lessons l
       join units u on u.id = l.unit_id
       join courses c on c.id = u.course_id
       left join lesson_items i on i.lesson_id = l.id
      where l.unit_id = $1 and c.family_id = $2
      order by l.position, l.id, i.position, i.id`,
    [unitId, familyId]
  );
  return sourceFromRows(rows);
}

async function draftScript({ courseTitle, unitTitle, sourceText, familyId }) {
  const system =
    "You write tight two-host audio summaries of a homeschool course unit. " +
    "Host A is curious and asks what a learner would ask. Host B is concrete and answers with specifics " +
    "taken from the lesson text. Plain spoken language, no stage directions, no sound effects, no greetings " +
    `or sign-offs. The unit is part of the course "${courseTitle}".`;
  const user =
    `Write the script for the unit "${unitTitle}".\n\n` +
    "Cover the main ideas in lesson order and close with one takeaway.\n\n" +
    `Lesson text:\n${sourceText}\n\n` +
    `Return JSON: {"segments":[{"host":"a","text":"..."},{"host":"b","text":"..."}]}. ` +
    `At most ${MAX_SEGMENTS} segments, alternating hosts, each under ${SEGMENT_MAX_CHARS} characters.`;
  const out = await ai.chatJson(
    "overview",
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens: 2000, temperature: 0.7, usage: { familyId, note: "overview" } }
  );
  return parseScript(out.json);
}

/** The unit's current overview, newest first, or null. Meta carries the script
 *  so the guide (and later a learner page) can show the transcript. */
async function latestOverview(unitId, familyId) {
  const { rows } = await db.query(
    `select id, title, bytes, meta, created_at from uploads
      where family_id = $1 and kind = 'audio'
        and meta->>'refType' = 'overview' and meta->>'unitId' = $2
      order by id desc limit 1`,
    [familyId, String(Number(unitId))]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    uploadId: Number(r.id),
    url: `/media/${r.id}`,
    title: r.title,
    bytes: Number(r.bytes),
    createdAt: r.created_at,
    script: (r.meta && r.meta.script) || [],
    skipped: Number((r.meta && r.meta.skipped) || 0),
  };
}

async function generateOverview({ unitId, familyId, userId }) {
  const id = Number(unitId);
  const unit = await db.query(
    `select u.id, u.title, c.title as course_title from units u
       join courses c on c.id = u.course_id
      where u.id = $1 and c.family_id = $2`,
    [id, familyId]
  );
  if (!unit.rows[0]) throw new Error("overview_unit_not_found");
  const { title: unitTitle, course_title: courseTitle } = unit.rows[0];

  const sourceText = await loadUnitSource(id, familyId);
  if (!sourceText.trim()) throw new Error("overview_no_source");

  const script = await draftScript({ courseTitle, unitTitle, sourceText, familyId });
  if (!script.length) throw new Error("overview_empty_script");

  // Voice by voice, fail soft: one bad line is skipped, the rest still ship.
  const buffers = [];
  let skipped = 0;
  for (const seg of script) {
    try {
      buffers.push(await media.speechSegment({ text: seg.text, role: HOST_ROLES[seg.host] }));
    } catch (err) {
      skipped++;
      console.warn(`[overview] unit ${id}: skipped a segment (${err.message})`);
    }
  }
  const audio = concatMp3(buffers);

  const saved = await storage.put(familyId, "audio/mpeg", audio);
  const ins = await db.query(
    `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, meta, created_by)
     values ($1,'audio','audio/mpeg',$2,$3,$4,$5,$6,$7) returning id`,
    [familyId, saved.bytes, saved.key, `overview-unit-${id}-${Date.now()}.mp3`,
      `${unitTitle} audio overview`,
      JSON.stringify({ refType: "overview", unitId: id, script, skipped }),
      userId || null]
  );
  const uploadId = Number(ins.rows[0].id);
  await db.query(
    `insert into media_assets (family_id, kind, purpose, ref_type, ref_id, url, provider, prompt, created_by)
     values ($1,'audio','unit-overview','overview',$2,$3,'tts',$4,$5)`,
    [familyId, id, `/media/${uploadId}`, script.map((s) => s.text).join(" ").slice(0, 1000), userId || null]
  ).catch(() => {});

  // Regenerate replaces: older overviews of this unit lose their rows and
  // their bytes, so one unit holds exactly one overview.
  const old = await db.query(
    `select id, storage_key from uploads
      where family_id = $1 and kind = 'audio'
        and meta->>'refType' = 'overview' and meta->>'unitId' = $2 and id <> $3`,
    [familyId, String(id), uploadId]
  );
  for (const row of old.rows) {
    await storage.delete(row.storage_key).catch(() => {});
    await db.query("delete from uploads where id = $1 and family_id = $2", [row.id, familyId]).catch(() => {});
  }
  await db.query(
    `delete from media_assets where family_id = $1 and ref_type = 'overview' and ref_id = $2 and url <> $3`,
    [familyId, id, `/media/${uploadId}`]
  ).catch(() => {});

  return { uploadId, url: `/media/${uploadId}`, segments: script.length - skipped, skipped, replaced: old.rows.length };
}

module.exports = {
  generateOverview, latestOverview, parseScript, concatMp3, sourceFromRows,
  MAX_SEGMENTS, SEGMENT_MAX_CHARS, TOTAL_MAX_CHARS, SOURCE_MAX_CHARS,
};
