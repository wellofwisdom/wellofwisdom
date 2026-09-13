# Well 3: Immersive Game: voice, music, map, quests

> **Branch:** `feat/well3-immersive` at `C:\Users\kevin\ZCodeProject\wellofwisdom\wellofwisdom-well3`
> Well 1 stays on `main`, Well 2 stays on `courses/well2-ip-curriculum`. This tree owns the learner game shell.

This is the execution plan for `docs/ROADMAP.md` Immersive game. Well 1 already shipped the roadmap entry at `b03cbb1` and the `.env.example` block. This tree builds it.

## Why this exists

The learner side still reads like centered panels on a page. The fix is a full-screen shell plus a HUD plus a place you move through, with voice and music that bring each scene to life. Same data, different frame. No new tables unless noted.

## Voice plus music: kie.ai, no GCP

Gemini 3.1 Flash TTS plus Suno on kie.ai over Vertex Lyria and over MusicFX. Gemini TTS at $0.70 per million input tokens plus $14 per million output tokens (sub cent per chapter) and Suno Generate Music at $0.06 per loop, both on the same kie key you already use for images and video. One bill, no GCP project, loops cached in `UPLOAD_DIR` like kie images. Fail soft per track, silent when keys are absent.

## Work order: 8 slices, one PR each

1. **Learner shell plus HUD**: `web/src/pages/learn/LearnerApp.tsx` grows a `LearnerShell` plus `LearnerHUD` (XP ring, streak flame, pack, sound, Map). Learner routes go full viewport `100dvh`, cover art bleeds edge to edge, HUD pinned. Same routes.
2. **Course path map**: replace `CourseView` lesson list with a path SVG, lessons as nodes, journey line drives a traveling avatar. Reuse `progress` plus `lesson.done`.
3. **World map canvas**: replace `WorldView` encounters grid with an SVG path plus absolute node buttons, chapter banners as full-bleed regions, parallax hero. Recompute from `chapters` plus `encounters`.
4. **Kie voice narrator (Gemini 3.1 Flash TTS)**: `server/lib/providers/kie-voice.js`, job `tts-narrate` via `server/lib/jobs.js`, cache in `UPLOAD_DIR` as `media/:id/audio`, serve from `server/routes/uploads.js`. Browser `speechSynthesis` stays fallback. Voices pinned per `adventure_characters`. Sub cent per chapter.
5. **Chapter music loops (Suno on kie)**: `server/lib/providers/kie-music.js`, same cache plus spend path, Suno Generate Music at $0.06 per loop, one per chapter, mood swap on `kind`, duck under narration, slider in settings, no autoplay before a tap.
6. **Scene transitions plus sound cues**: CSS wipes, view transitions, correct chime, boss thud, page turn, all muted by default, `prefers-reduced-motion` respected.
7. **Quest log plus map overview**: full-screen Map, path SVG, avatar on path, quest log reusing `upcoming` plus `returned` plus `reviewsDue`. Collection gallery with lore per loot item.
8. **Follow-up game mechanics**: one per PR, no migration unless called out: stamina for boss, choice branches, companion reactions (one TTS clip per chapter), dailies plus weeklies, mastery stars, lore collection, doors plus keys, photo finish.

## Always-on polish rule

Each PR looks for one small nearby UX lift while it is in the area: a pressed scale on a button, a spring on a card, a counting stat, an inventory that wants to be a hotbar. Small polish compounds. Do not ship a PR that only moves logic if the screen nearby still feels like a form.

## Guardrails

- Degraded mode first. No key means no voice plus no music, never a broken player.
- Audio is generated server side, cached as a file, served from `/media/:id`. Nothing streams live from a vendor per tap.
- Cost sub cent per chapter for voice (a few thousand tokens at $0.70 plus $14) plus $0.06 per Suno loop, each cached and fail soft per track, same posture as `media.js` kie images.
- Learning stays primary. Replay and stars are opt-in, no dark pattern, no gate that blocks learning.
- Keep `npm run check && npm test && npm --prefix web run build` green. Validate examples with `npm run validate-course -- --library docs/examples`.

## Where to look

- `server/lib/providers/`: existing pattern is `google.js` plus `anthropic.js`, same shape. New files are `kie-voice.js` plus `kie-music.js` on the same kie key.
- `server/lib/jobs.js`: add `tts-narrate` plus `music-generate` as job types.
- `server/lib/media.js`: spend plus quota plus cache shape to copy.
- `web/src/pages/learn/`: `LearnerApp.tsx`, `CourseView.tsx`, `LessonPlayer.tsx`, `WorldView.tsx`, `GamificationStrip.tsx`.
- `web/src/styles.css`: learner `kid`, `world`, `mhero` plus `worldhero`, and motion blocks.

## Status

- Branch cut at `b03cbb1` from `main`. Roadmap section plus `.env.example` block already on `main` and inherited here.
- Slices 1 to 7 shipped on this branch:
  1. Learner shell + HUD (8ba4dfc): full-screen 100dvh, XP ring, streak, pack, sound, Map, /api/learn/hud.
  2. Course path map (bdc1ae6): SVG winding trail, done/next/locked nodes, avatar, list fallback.
  3. World map canvas (feac9d4): same trail for encounters, chapter chips, Show chapters fallback.
  4. TTS narrator (d8be928, aligned 1a92ee7 to kie-voice on kie.ai): Gemini 3.1 Flash TTS on same kie key as images (sub cent per chapter), /api/narration cache at /media/:id, NarratorButton on encounter scenes with browser fallback, no autoplay before a tap.
  5. Music provider (2f1a4a5 Vertex Lyria, kept alongside new kie-music at 1a92ee7): Suno on kie.ai at $0.06 per loop, mood prompts, cached in UPLOAD_DIR like TTS. kie-music.js now lives next to google-music.js; narrate on kie is live.
  6. Quest log (000eb45): returned + practice + upcoming made playable, no new API.
  7. Scene transitions (a5e766b): fade-rise per route, reduced-motion respected.
- Check + tests + web build green. Each slice reuses existing data; no migrations.
- Slice 8 (af6f6d4): collection gallery on WorldView (loot art + lore + real rewards) and MasteryStars display helper.
- Slice 9 (1a92ee7): kie alignment live. kie-voice.js (Gemini 3.1 Flash TTS, $0.70 + $14 per million tokens) plus kie-music.js (Suno $0.06 per loop) on the same KIE_API_KEY as images. NarratorButton on encounter scenes, cached at /media/:id, no autoplay before a tap.
- Slice 10 (63af7a9 + 5891193 + 1e24d00): chapter music Suno loop routes and per-chapter ChapterMusic player (ducked low, looping), plus stamina bar on boss fight, dailies board on home, and photo finish on lesson complete.
- Vault (e1fa4fd + 924e9fa): AI provider vault in Settings (providers, pro/flash models, vision, kie image/video/voice/music, monthly plus daily caps, spend chart over 14 days with by-task and by-model plus recent). Server reads vault-first with env fallback, enforces caps before generation. One save mirrors kie to media.
- Check + tests + web build still green. Branch diff from main is ~31 files (~2700 lines), no migrations, degraded mode kept.

