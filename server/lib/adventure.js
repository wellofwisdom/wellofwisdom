// SPDX-License-Identifier: AGPL-3.0-or-later
// The Adventure world builder: turns a theme template + course + learner
// interests into an original story world (characters, chapters, cover art
// prompt). All characters and settings are ORIGINAL — no company IP.
const fs = require("node:fs");
const path = require("node:path");
const ai = require("./ai");

const DIR = path.join(__dirname, "..", "templates", "adventures");

function listThemes() {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return null; } })
    .filter(Boolean);
}

function getTheme(id) {
  return listThemes().find((t) => t.id === String(id || ""));
}

const SYSTEM = `You design ORIGINAL story worlds that wrap a learning course in an adventure game. You never use characters, names, or settings from existing franchises, anime, games, or books — everything you write is original, inspired by genre conventions only.
Respond with ONE valid JSON object, nothing else:
{
  "title": string (the adventure's name),
  "tagline": string (one thrilling line),
  "setting": string (2-3 sentences of vivid world description),
  "characters": [ { "name": string, "role": string, "description": string (1-2 sentences), "portraitPrompt": string (an image-generation prompt for a character portrait, original design, no franchise names) } ],  // 3-4 characters, one should represent the LEARNER as the protagonist
  "chapters": [ { "title": string, "hook": string (1 sentence teaser), "boss": boolean } ],  // one chapter per course unit, in order; last chapter boss=true; every 2nd-3rd can be a mini-boss too
  "coverPrompt": string (an image-generation prompt for a wide dramatic cover illustration of this world, no text, no franchise names)
}
Rules:
- Map the course's units onto the story's chapters in order. Chapter hooks reference the unit's actual topic cleverly disguised as story.
- The protagonist character is the learner ("you") — write their description in second person.
- Honor the learner's interests in the world's flavor (hobbies can appear as motifs, crew skills, gadgets) — but never name real-world franchises.`;

function normalizeWorld(raw, unitCount) {
  const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const title = str(raw.title, 120);
  if (!title) return null;
  const characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .map((c) => ({
      name: str(c && c.name, 60),
      role: str(c && c.role, 60),
      description: str(c && c.description, 300),
      portraitPrompt: str(c && c.portraitPrompt, 500),
    }))
    .filter((c) => c.name)
    .slice(0, 5);
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((c) => ({
      title: str(c && c.title, 120),
      hook: str(c && c.hook, 200),
      boss: Boolean(c && c.boss),
    }))
    .filter((c) => c.title)
    .slice(0, 12);
  if (!characters.length || chapters.length < 1) return null;
  return {
    title,
    tagline: str(raw.tagline, 160),
    setting: str(raw.setting, 700),
    characters,
    chapters,
    coverPrompt: str(raw.coverPrompt, 600),
    unitCount: unitCount || chapters.length,
  };
}

/** Build a world. themeId='custom' derives an original world from interests. */
async function buildWorld({ themeId, course, learner }) {
  const theme = themeId === "custom" ? null : getTheme(themeId);
  const base = theme
    ? theme.worldPrompt
    : `Invent an ORIGINAL adventure world built around what this learner loves: ${(learner && learner.interests || []).join(", ") || "discovery and wonder"}. Genre is your choice — pick whatever their interests imply (sailing, mecha, fantasy, mystery…). Original characters and places ONLY.`;

  const out = await ai.chatJson(
    "lens",
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `World direction: ${base}`,
          `Course title: ${course.title}`,
          `Course units (in order): ${course.units.map((u, i) => `${i + 1}. ${u.title}`).join("; ")}`,
          learner ? `Learner: ${learner.name}${learner.grade_level ? `, grade ${learner.grade_level}` : ""}${(learner.interests || []).length ? `, loves ${learner.interests.join(", ")}` : ""}` : "",
          "Return only the JSON object.",
        ].filter(Boolean).join("\n"),
      },
    ],
    { maxTokens: 4000, temperature: 0.8, usage: { note: `adventure: ${course.title}` } }
  );
  const world = normalizeWorld(out.json, course.units.length);
  if (!world) throw new Error("adventure_unparseable");
  return { world, themeTitle: theme ? theme.title : null };
}

module.exports = { listThemes, getTheme, buildWorld, normalizeWorld };
