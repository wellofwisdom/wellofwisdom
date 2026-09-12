# Well 3: Immersive Game: voice, music, map, quests

> **Branch:** `feat/well3-immersive` at `C:\Users\kevin\ZCodeProject\wellofwisdom\wellofwisdom-well3`
> Well 1 stays on `main`, Well 2 stays on `courses/well2-ip-curriculum`. This tree owns the learner game shell.

This is the execution plan for `docs/ROADMAP.md` Immersive game. Well 1 already shipped the roadmap entry at `b03cbb1` and the `.env.example` block. This tree builds it.

## Why this exists

The learner side still reads like centered panels on a page. The fix is a full-screen shell plus a HUD plus a place you move through, with voice and music that bring each scene to life. Same data, different frame. No new tables unless noted.

## Music provider: Vertex Lyria

Vertex AI (Lyria) over Suno and over MusicFX. Suno is stronger for standalone songs but its voice ownership and commercial API fencing make it a bad fit for a school product. MusicFX is a lab demo. Lyria shares the GCP auth already used for Cloud TTS, bills per second to the same project, and loops are cacheable in `UPLOAD_DIR` like kie images. Fail soft per track, silent when keys are absent.

## Work order: 8 slices, one PR each

1. **Learner shell plus HUD**: `web/src/pages/learn/LearnerApp.tsx` grows a `LearnerShell` plus `LearnerHUD` (XP ring, streak flame, pack, sound, Map). Learner routes go full viewport `100dvh`, cover art bleeds edge to edge, HUD pinned. Same routes.
2. **Course path map**: replace `CourseView` lesson list with a path SVG, lessons as nodes, journey line drives a traveling avatar. Reuse `progress` plus `lesson.done`.
3. **World map canvas**: replace `WorldView` encounters grid with an SVG path plus absolute node buttons, chapter banners as full-bleed regions, parallax hero. Recompute from `chapters` plus `encounters`.
4. **Google TTS narrator**: `server/lib/providers/google-tts.js` plus `voice.js` helper, job `tts-narrate` via `server/lib/jobs.js`, cache in `UPLOAD_DIR` as `media/:id/audio`, serve from `server/routes/uploads.js`. Browser `speechSynthesis` stays fallback. Voices pinned per `adventure_characters`.
5. **Chapter music stems**: `server/lib/providers/google-music.js`, same cache plus spend path, loop per chapter, mood swap on `kind`, duck under narration, slider in settings, no autoplay before a tap.
6. **Scene transitions plus sound cues**: CSS wipes, view transitions, correct chime, boss thud, page turn, all muted by default, `prefers-reduced-motion` respected.
7. **Quest log plus map overview**: full-screen Map, path SVG, avatar on path, quest log reusing `upcoming` plus `returned` plus `reviewsDue`. Collection gallery with lore per loot item.
8. **Follow-up game mechanics**: one per PR, no migration unless called out: stamina for boss, choice branches, companion reactions (one TTS clip per chapter), dailies plus weeklies, mastery stars, lore collection, doors plus keys, photo finish.

## Always-on polish rule

Each PR looks for one small nearby UX lift while it is in the area: a pressed scale on a button, a spring on a card, a counting stat, an inventory that wants to be a hotbar. Small polish compounds. Do not ship a PR that only moves logic if the screen nearby still feels like a form.

## Guardrails

- Degraded mode first. No key means no voice plus no music, never a broken player.
- Audio is generated server side, cached as a file, served from `/media/:id`. Nothing streams live from a vendor per tap.
- Cost per second plus per chapter, fail soft per track, same posture as `media.js` kie images.
- Learning stays primary. Replay and stars are opt-in, no dark pattern, no gate that blocks learning.
- Keep `npm run check && npm test && npm --prefix web run build` green. Validate examples with `npm run validate-course -- --library docs/examples`.

## Where to look

- `server/lib/providers/`: existing pattern is `google.js` plus `anthropic.js`, same shape for TTS and music.
- `server/lib/jobs.js`: add `tts-narrate` plus `music-generate` as job types.
- `server/lib/media.js`: spend plus quota plus cache shape to copy.
- `web/src/pages/learn/`: `LearnerApp.tsx`, `CourseView.tsx`, `LessonPlayer.tsx`, `WorldView.tsx`, `GamificationStrip.tsx`.
- `web/src/styles.css`: learner `kid`, `world`, `mhero` plus `worldhero`, and motion blocks.

## Status

- Branch cut at `b03cbb1` from `main`. Roadmap section plus `.env.example` block already on `main` and inherited here. Next: slice 1 in this tree.
