# Well 12 - Docs next wave: STT, controller, spoken, language kinds, MCP and discovery sync

**Branch:** `well12/docs-next-wave` from `origin/main` (`dac4dd2`)
**Scope:** `docs/API.md`, `docs/MCP.md`, `docs/TRANSLATING.md`, `server/lib/seo.js` docs comment only (no migration)
**Date:** 2026-09-24
**Commit:** `a688ff6`

## Setup done in this run

- Folder `wellofwisdom-well12` confirmed, branch `well12/docs-next-wave` on HEAD `a688ff6` (1 ahead of dac4dd2, clean, up to date with origin)
- `git fetch origin` done
- `npm install` done (154 packages, up to date)
- `npm --prefix web install` done (272 packages, up to date)
- Read `docs/API.md`, `docs/MCP.md`, `docs/TRANSLATING.md`, `server/lib/seo.js`, `server/index.js`, `server/lib/site.json`, `server/routes/stt.js`, `server/lib/speech.js`, `mcp/src/index.ts`, `web/src/pages/learn/LearnerShell.tsx`, `web/src/components/PushToTalk.tsx`

## What changed in a688ff6

Commit `a688ff6` holds the whole next-wave docs refresh. No code change, no migration. The diff since `origin/main` (`dac4dd2`) touches 4 files, 95 insertions and 39 deletions.

### API.md

- Ground rules: adds the STT error code list to the common codes (`no_audio`, `stt_cap_invalid`, `stt_not_configured`, `stt_no_speech`, `stt_provider_error`).
- Exercise kinds: distinguishes chrome language (`prefs.lang` on `GET /api/me`, `en`/`es`/`fr` from `users.prefs`) from course target language (`courses.language`, the thing that fills a lesson with `vocab_card`/`listen_*`/`translate`/`dialogue`/`graded_reader`). French is a browser plus chrome addition plus a course target; a French course does not make `prefs.lang` French.
- Language kinds at the API level: caps and `problem` codes from `server/lib/items/kinds/*.js` (`imagePrompt` 500, `alternatives` 10, `glosses` 100, `choices` 6, `turns` 1..6, `goals` 8, `goodEndings` 8; `lemma_required`, `audio_required`, `choices_required`, `expected_required`, `scene_required`, `level_invalid`, `direction_invalid`, `audioUrl_invalid`), plus the STT bridge: `POST /api/stt` with matching `kind` (`text` for `vocab_card`/`listen_repeat`/`translate`/`dialogue`, `mcq` for `listen_choice`, `numeric`/`text` for the rest) then `{ itemId, questionIndex, answer: text }` to `POST /api/learn/attempt`. `listen_repeat` typed fallback noted.
- Controller: carries no server field, is not on `users.prefs`, is not returned by any API. `[data-nav]` works under the same routes either way.
- STT router: full section with transport (`audio/webm`, `audio/ogg`, `audio/mp4`, `video/webm`, `application/octet-stream`, `multipart/form-data` single file part, 8 MB default `STT_MAX_UPLOAD_MB`, 4000 chars, header aliases), `GET /status` (browser fallback), `GET /config` and `PUT /config` (`requireInstanceAdmin`), `POST /` response shape and error mapping, `keepRecordings` (family `prefs.keepRecordings` wins over instance `sttKeepRecordings`, off by default, kept as `audio` in `/api/uploads`), daily cap via `aiLimits.checkStt`, logging as `stt` with 0 tokens, plus Spoken answers (`server/lib/speech.js`: fillers, openers, `spokenToNumbers`, `extractNumber`, `choiceIndex` for `mcq`) and Where STT appears (`PushToTalk` single control, server then browser then nothing, hold or space bar, waveform, under 800 bytes mis-tap, `idle` to `recording` to `working` to `confirm`, `Heard` plus `Use this`/`Say it again`, `mcq` unmapped hint, typing guard).
- Controller (learner shell): `wow-controller-mode` in `localStorage`, header toggle `shell.controllerOn`/`shell.controllerOff`, `class="controller-mode"`, `[data-nav]` spatial nav (`focusNext`/`focusFirst`/`speakFocused`), `gamepad.ts` plus `spatialNav.ts`, `PadLegend`, typing guard (`input`, `textarea`, `select`, `[contenteditable="true"]`, `[role="dialog"]`), coverage list, no server config and no permission.
- Date bumped from 21 September to 23 September 2026.

### MCP.md

- Per-tool scope: each of the seven tools shows the HTTP route and pushed scopes (`list_courses` and `get_course` need `read` or `courses:write`; `import_course_package` and `generate_course` need `courses:write` via `POST /api/courses/import` and `POST /api/courses/generate` plus `GET /api/courses/jobs/:id`; `list_learners` needs `read` or `learners:read`; `get_learner_progress` is filtered `GET /api/progress`; `list_open_courses` is open via `GET /api/public/courses`).
- Non-MCP paragraph at the top and a section at the bottom: `POST /api/stt` is not proxied (binary audio body, same attempt path), controller is local (`wow-controller-mode` with no token scope), language chrome versus course `language` via HTTP course routes, read through `get_course`.
- Security line notes the same scope-truth as API.md (no scope reaches `/api/tokens`, `/api/ai/config`, `/api/stt/config`, or export routes; with every scope a token is still 403 on instance-admin and learner paths).

### TRANSLATING.md

- Dictionaries: adds `fr.ts`, notes `Lang` is `en | es | fr`.
- Per-learner language: adds `fr` to `prefs.lang`, notes French is chrome only and does not itself create French lessons.
- Adding a new language: notes `normalizeLang` already knows `fr`, no longer tells the editor to cut `normalizeLang`.
- Translated: lists the controller toggle (`shell.controllerOn`/`shell.controllerOff`), HUD, home, course path, world view, world map, quest log, dailies, weeklies, practice, tutor chat with `tutor.talk`, narration chrome, gamification strip, adventure banner, collection gallery, plus exercise strings and kind labels (`vocab`, `listenChoice`, `listenRepeat`, `translate`, `dialogue`). Mentions that `PushToTalk` chrome (`exercise.speak`, `exercise.hint`, `tutor.talk`) comes through the same dictionaries, and that the transcript itself is never translated.
- Not-translated note: reserves `lesson.*` keys for Well 3 work, keeps course content out.
- Controller row: notes `wow-controller-mode` is local and not a language, label is translated, state is not stored.
- Language lesson kinds: STT calls per kind (`kind: "text"` etc), controller plus spoken work inside these kinds under the same attempt.
- Checks: i18n test with French parity, em-dash ban on `fr` strings, `npm --prefix web run build` must pass for the controller toggle, and where the push-to-talk labels live.

### server/lib/seo.js

- Docs comment only. States the file is the single source for the discovery surface (heads, `robots.txt`, sitemap, `llms.txt`), every marketing or legal page lives in `server/lib/site.json` and is read here for `robotsTxt`, `sitemapXml`, `llmsTxt`, `staticHead`, and the SPA shell routes in `server/index.js`, and that Well 12 owns only this comment and the three docs files.
- No code change in `site.json`, `robotsTxt`, `sitemapXml`, `llmsTxt`, `staticHead`, `publishedMeta`, `courseHead`, `injectHead`, or the routes in `server/index.js` wired to them.

## Heads, sitemap, robots, llms.txt stay in sync

Every page in discovery is the set of `server/lib/site.json` `pages`. `server/lib/seo.js` derives all four surfaces from it, and `server/index.js` mounts the same set.

Verified in this run with a Node one-liner against the live code (no mocks, no fixtures):

- `seo.robotsTxt(base)` allows `/`, `/c/`, `/api/public/`, `/llms.txt`, each `pages[].path`, and lists the sitemap. Checks: `/llms.txt` true, `sitemap.xml` true.
- `seo.llmsTxt(base)` is 11806 chars, carries the site summary, all three sections (`home`, `product`, legal), the pillars and roadmap, and the machine-readable course stanza (`/c`, `/c/<slug>.txt`, `/api/public/courses/<slug>/export`, `/api/public/courses`).
- `seo.sitemapXml(base)` comes back with 1673 chars and contains `/features` among the site pages plus per-course URLs capped at 5000 when the DB is on.
- Every `SITE.pages[].path` string appears in `llmsTxt` (with the root rendered as `base + "/"`).
- `seo.staticHead(id, base)` uses `SITE.pages` and emits a real title, description, canonical, `og:` tags, and `og:image` pointing at `og.png` for the home and each static route, injected through `seo.injectHead` on `GET /` and one `app.get("/" + id)` per page in `server/index.js`.

Result: adding a page to `server/lib/site.json` appears everywhere without a second edit. No page lives only in one of the three files.

## Doc-to-code truth check (read just now, no guessing)

- `server/routes/stt.js` and `server/lib/speech.js` match API.md STT and Spoken answers (MAX_MB 8, MAX_CHARS 4000, kinds `text`/`numeric`/`mcq`, raw plus multipart single file, header aliases, `choiceCount` clamped 0..26, language 12 chars, filler/openers/number words/fraction words/ordinals/letter sounds/position words/neutral words, `extractNumber` returning one isolated number or null). `server/lib/seo.js` and `server/index.js` wire the discovery routes as documented. `mcp/src/index.ts` lists the seven tools as documented, with `list_open_courses` as the only open route. `web/src/pages/learn/LearnerShell.tsx` owns `wow-controller-mode`, `aria-pressed`, `controller-mode` class, `[data-nav]`, `useGamepad`/`spatialNav`, `PadLegend`, `isTypingTarget`. `web/src/components/PushToTalk.tsx` owns the single STT control as documented.

## Five gates before push (run 2026-09-24 on well12/docs-next-wave at a688ff6)

All run in this branch on this run, no code written in this wave.

1. lint `npm --prefix web run lint` - pass. Same 2 pre-existing warnings, 0 errors.
   `AiVault.tsx:181` missing `load` dependency, `ProjectItem.tsx:29` missing `submission` dependency.
2. web test `npm --prefix web test` - pass. 21 files, 186 pass, 0 fail (warnings about un-wrapped `act` updates in item tests are pre-existing and do not fail).
3. build `npm run build` - pass. `npm --prefix web run build` (`tsc --noEmit` then `vite build`) 2.88s, same chunks as prior run.
4. check `npm run check` - pass. 757 tests, 0 fail (16 suites). No dash hits. Server files ok.
5. node test `npm test` - pass. 772 tests, 0 fail (18 suites).
6. pglite `npm run test:pglite` - not re-run in this wave; last background run from prior fetch (commit dac4dd2 baseline) showed 772 pass with pglite overlay. No migration and no DB code touched in a688ff6, so a re-run would hit the same overlay.

No migration on this branch. No secrets read (`HANDOFF.md`, `.env`, `wow-secrets.txt`, `wow-deploy-env.txt`, `.git-credentials`, `.zcode`, `C:\Treman\` not opened).

## Push

`origin/well12/docs-next-wave` is already at `a688ff6`, which is the single content commit in this branch. No new commit on top of it in this verification run, so there is nothing new to push. `REPORTS/well12.md` is new on disk and untracked.

When you are ready to record the report:

```
git add REPORTS/well12.md
git commit -m "well12: report docs next wave"
git push origin well12/docs-next-wave
```

## Commands to re-run the five gates

```
git fetch origin
npm install
npm --prefix web install
npm --prefix web run lint
npm --prefix web test
npm run build
npm run check
npm test
```

`npm run test:pglite` is the sixth check when DB overlay is needed; it is redundant on a docs-only commit.
