# Work packets for parallel Wells (13 September 2026)

One packet per chat session. Each Well takes exactly one packet, works on its own branch, and owns only the files listed. Kevin merges in the order given. The reasoning behind every item is in `docs/REVIEW-AND-PLAN-2026-09-13.md`; this file is the assignment sheet.

## Rules for every Well (paste into the first message of each session)

1. Branch from current `main`: `git checkout -b wellN/<packet-slug>`. Never commit to `main`.
2. Touch only the files your packet owns. If you must touch another file, make the smallest edit and say so in the PR description.
3. **Never open** `HANDOFF.md`, `.env`, `wow-secrets.txt`, `wow-deploy-env.txt`, or anything under `C:/Treman/`. Muse Contributor sessions train on what they read. Everything you need is in `docs/` and `.env.example`.
4. Never paste a key, token or password into chat, code, tests, or docs.
5. No em dashes anywhere. `npm run check` fails on one. Rewrite the sentence.
6. Before every push: `npm run check && npm test && npm --prefix web run build`. All green or do not push.
7. New server logic ships with a `*.test.js` beside it (`node --test`). Match the existing style: plain Node, CommonJS, no new server dependency unless the packet names one.
8. Small commits with plain-language messages. One PR per packet. Rebase on `main` daily.
9. If the packet says "migration", the file is `server/migrations/0NN_name.sql`, additive only, and the number is the one the packet gives you so two Wells never collide.
10. When done: PR description lists what changed, how you tested it, and anything you left out.

Merge order: Well 4, then 5, 6, 12 (small, low conflict), then 7, 8, 9, 10, 11, 13, then Well 2. Wave 2 packets start only after wave 1 is merged.

---

## Well 4 (Claude, this session): secrets and security hardening

Branch `well4/security-hardening`. Owns `server/index.js`, `server/lib/auth.js`, `web/src/pages/NotFound.tsx` (new), `docs/OPERATIONS.md` (new).

- [x] Move every live key out of `HANDOFF.md` into `wow-secrets.txt`; add the Muse rule.
- [ ] Rotate DeepSeek, kie, SparkPost and the GitHub PAT (Kevin mints, Well 4 installs and verifies old keys are dead).
- [ ] `TRUST_PROXY` env (default `1`), replacing `app.set("trust proxy", true)`.
- [ ] Content-Security-Policy header with a per-request nonce; allow `accounts.google.com` for sign-in; keep KaTeX inline styles working.
- [ ] Console 404 fallback page instead of a blank Shell.
- [ ] Login limiter evicts oldest instead of clearing all.
- [ ] Per-route JSON body limit for course import and worksheet paste (8 MB).
- [ ] Error handler logs the stack outside production and a request id.
- [ ] `docs/OPERATIONS.md`: deploy verification, scratch DB testing, backups, DNS, written from the handoff with no secrets.

## Well 5: frontend quality floor

Branch `well5/frontend-quality`. Owns `web/package.json`, `web/eslint.config.js` (new), `web/vitest.config.ts` (new), `web/src/**/*.test.tsx` (new), `web/src/App.tsx` (lazy imports only), `web/src/lib/rich.tsx`, `web/vite.config.ts`, `.github/workflows/ci.yml` (add lint and web test steps only).

- [ ] ESLint 9 flat config with `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. Fix every `react-hooks/exhaustive-deps` finding for real, not with a disable comment. Script: `npm --prefix web run lint`.
- [ ] Vitest plus `@testing-library/react` plus jsdom. One smoke render test per page in `web/src/pages` and `web/src/pages/learn` that mocks `api` and asserts the page renders without throwing. Script: `npm --prefix web test`.
- [ ] Code splitting: `React.lazy` plus `Suspense` for `LearnerApp`, `Studio`, `WorldBuilder`, `CourseDetail`, `Settings`, `PlanWizard`, `Library`, `Notes`. Load KaTeX (`katex` and its CSS) only inside `rich.tsx` when a math token is present. Target: the logged-out landing bundle under 150 kB gzipped; Vite chunk warning gone.
- [ ] CI runs lint and web tests.
- Acceptance: `npm --prefix web run lint` clean, `npm --prefix web test` green, `npm --prefix web run build` prints no chunk warning.

## Well 6: server integration tests with Postgres in CI

Branch `well6/integration-tests`. Owns `.github/workflows/ci.yml` (add a `postgres:16` service and `DATABASE_URL` for the test step), `server/test-support/**` (new), and new `server/routes/*.test.js` files for `auth`, `learn`, `courses`, `family`, `uploads`, `plans`, `reports`.

- [ ] A harness in `server/test-support/db.js` that creates a throwaway schema per test file, runs migrations, and drops it after. Skips cleanly with a message when `DATABASE_URL` is unset so `npm test` still passes offline.
- [ ] Tests, each against real Postgres: guide signup and login and rate limit; learner login by family code plus PIN; every list endpoint returns nothing from another family (family scoping); an attempt is graded server-side and the answer never appears in the learner tree; observer cannot POST; assistant sees only assigned learners; course export round-trips through import.
- [ ] Do not change route behaviour. If a test finds a bug, write the failing test, note it in the PR, and fix it only if the fix is under ten lines.
- Acceptance: CI green with Postgres; `npm test` still green locally without a database.

## Well 7: website legal and marketing pages

Branch `well7/site-legal-marketing`. Owns `web/src/pages/Landing.tsx`, `web/src/pages/legal/**` (new), `web/src/pages/for/**` (new), `server/lib/seo.js` (sitemap entries and head for the new routes), `web/src/App.tsx` (public route matches for the new pages only, one block).

- [ ] Remove the "Trusted by" quotes unless Kevin confirms they are real people who agreed. Replace with true facts (course count, test count, license, self-host command).
- [ ] Replace the keyword chips with four real pages: `/for-homeschools`, `/for-co-ops`, `/for-teachers`, `/self-host`. Each has its own copy, its own three relevant public courses from `/api/public/courses`, and a call to action.
- [ ] `/privacy`, `/terms`, `/children` (plain-English children's data page: what is stored, what leaves the box, how a parent deletes everything). Link all three in the footer and from the sign-up form.
- [ ] Delay Google One Tap until scroll or three seconds.
- [ ] Pricing card shows a placeholder range instead of "coming soon".
- [ ] "Print sample report" and "Download a sample course" links on the landing.
- [ ] All new routes in the sitemap and served with proper head tags.
- Acceptance: every new page renders logged out, passes the build, and is reachable from the footer.

## Well 8: a demo that shows the game

Branch `well8/demo-seed`. Owns `server/routes/demo.js`, `server/routes/demo.test.js`, `web/src/components/DemoBanner.tsx`, `web/src/pages/Dashboard.tsx` (demo-only block).

- [ ] Seed each demo family with a learner who has done real work: attempts across two courses (mixed correct and wrong so review is due), lesson completions on different days (so the streak and attendance show), one submitted project with guide feedback returned, one boss run, one generated quarterly report, two calendar events, two badges.
- [ ] The demo landing offers **Play as the learner** as the first button, entering the learner shell through the existing preview mechanism, with the banner explaining how to get back to the console.
- [ ] Backfill existing demo families on boot the same way the earlier backfill worked.
- [ ] Tests for the seed shape (counts per table) and idempotency.
- Acceptance: a fresh demo shows non-empty Recent activity, Progress, Attendance, Work, and a report; "Play as the learner" lands on a world with a path and a due review.

## Well 9: whole-family export and the storage adapter

Branch `well9/export-storage`. Owns `server/lib/storage.js` (new), `server/lib/storage.test.js` (new), `server/routes/uploads.js` (read and write through the adapter), `server/routes/family.js` (export endpoint), `server/lib/export.js` (new), `web/src/pages/Settings.tsx` (one Export card).

- [ ] `lib/storage.js` with `local` (current `UPLOAD_DIR` behaviour) and `s3` (any S3-compatible endpoint via signed requests; use the AWS SDK v3 S3 client, the one new dependency this packet allows). Selected by `STORAGE_DRIVER`. Same interface: `put`, `get` (stream with range), `delete`, `exists`.
- [ ] `GET /api/family/export` streams a zip: `family.json` (learners, plans, events, notes, resources, reports, attendance, assessments, badges, tutor threads with parent-visible messages), every course as `.wow-course.json`, and uploads by id. Owner only. No answer keys stripped, this is the family's own data.
- [ ] `.env.example` documents `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.
- [ ] Update the paragraph in `docs/ARCHITECTURE.md` to match what now exists.
- Acceptance: tests for both drivers (s3 mocked at the HTTP layer), export zip opens and re-imports its courses.

## Well 10: controller mode

Branch `well10/controller-mode`. Owns `web/src/lib/gamepad.ts` (new), `web/src/lib/spatialNav.ts` (new), `web/src/pages/learn/LearnerShell.tsx`, `web/src/pages/learn/CoursePath.tsx`, `web/src/pages/learn/WorldMap.tsx`, `web/src/pages/learn/WorldView.tsx`, `web/src/pages/learn/DailiesBoard.tsx`, `web/src/pages/learn/WeekliesBoard.tsx`, `web/src/pages/learn/QuestLog.tsx`, `web/src/components/PadLegend.tsx` (new), the matching CSS files. Not `LessonPlayer.tsx` (Well 11 owns it).

- [ ] `useGamepad`: polls `navigator.getGamepads()` per animation frame, emits button-down and axis events with repeat and dead zone, detects connect and disconnect.
- [ ] Spatial focus manager: candidates are elements with `data-nav`; d-pad or left stick moves focus to the nearest candidate in that direction by rectangle geometry; A clicks, B goes back (history), start opens the map, X reads the focused item's `data-say` text through the existing narrator or `speechSynthesis`.
- [ ] Every path node, world node, board card and HUD control gets `data-nav`. Visible focus ring in controller mode.
- [ ] `PadLegend` in the HUD when a pad is connected; a "Controller mode" toggle in the learner settings, auto-on when a pad connects.
- [ ] Rumble on lesson complete and boss hit via `vibrationActuator` where supported.
- Acceptance: with a pad plugged in, a learner can go from home to a world to a lesson and back without touching mouse or keyboard. Keyboard arrows use the same manager so it is testable without hardware; add a vitest for the geometry function.

## Well 11: speech input

Branch `well11/speech-input`. Owns `server/routes/stt.js` (new), `server/lib/providers/stt-openai.js` (new), `server/lib/speech.js` (normalizer, new) plus test, `server/lib/aiConfig.js` and `server/lib/aiLimits.js` (add `stt` fields and caps), `web/src/components/PushToTalk.tsx` (new), `web/src/pages/learn/LessonPlayer.tsx` (answer inputs only), `web/src/components/AiVault.tsx` (one card), `.env.example` (STT block), `server/index.js` (one `app.use` line).

- [ ] `POST /api/stt`: multipart or raw audio in, `{ text, language, confidence }` out. Provider is any OpenAI-compatible `/v1/audio/transcriptions` (`STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL`, vault-first with env fallback). Goes through `fetchT`, logs usage, respects the spend caps. Audio is never written to disk unless `keepRecordings` is on for the family.
- [ ] `lib/speech.js` normalizer with tests: number words to digits and fractions ("three quarters" to `3/4`, "one and a half" to `1 1/2`, "negative five" to `-5`), choice words to MCQ ids ("B", "the second one", "option two"), strips filler ("um"), passes text through otherwise.
- [ ] `PushToTalk`: hold to record (button, space bar), 16 kHz mono via `MediaRecorder`, shows a level meter, sends on release, shows the transcript in the answer box and requires a confirm before grading. Falls back to browser `SpeechRecognition` when no server STT is configured and the browser has it; hidden when neither exists.
- [ ] Wire it into the exercise inputs in `LessonPlayer.tsx` (numeric, text, MCQ) and into `TutorChat` composer.
- [ ] AI vault card: provider, model, monthly cap, "keep recordings" switch (default off).
- Acceptance: with Groq or OpenAI configured, a spoken "three quarters" on a numeric question lands as `3/4` in the box, and grading matches the typed path. Tests cover the normalizer and the route's gating.

## Well 12: docs, community and launch assets

Branch `well12/docs-community`. Owns `docs/API.md` (new), `CHANGELOG.md` (new), `README.md`, `docs/issues/**` (new), `docs/PEDAGOGY.md` (new), `.github/ISSUE_TEMPLATE/**`, `docs/LAUNCH-CHECKLIST.md` (new).

- [ ] `docs/API.md`: every route under `/api` with method, auth requirement, body, response, grouped by router. Generate by reading `server/routes/*.js`; keep it honest.
- [ ] `CHANGELOG.md` back-filled from `git log` since 30 August, grouped by day, plain language, and a `v0.1.0` heading ready for the tag.
- [ ] README: a placeholder GIF slot with exact recording instructions for Kevin, three screenshot slots, a "self-host in 30 seconds" block, a "how it compares" table check, links to the new docs.
- [ ] Twenty `good first issue` drafts in `docs/issues/NN-title.md`, each with file paths, steps, and acceptance criteria, ready to paste into GitHub. Mix of docs, tests, small UI, and one curriculum template.
- [ ] `docs/PEDAGOGY.md`: the research behind spaced review, self-explanation, tutoring strictness, and guide review, with citations.
- [ ] `docs/LAUNCH-CHECKLIST.md` from section 6 of the review, as checkboxes with owners.
- Acceptance: `npm run check` green (no em dashes), every internal link resolves.

## Well 13: PGlite driver for the embedded build

Branch `well13/pglite-driver`. Owns `server/lib/db.js`, `server/lib/db.test.js` (new), `package.json` (add `@electric-sql/pglite` as an optional dependency), `scripts/test-pglite.js` (new), `.env.example` (DB block).

- [ ] `DB_DRIVER=pg|pglite`. With `pglite`, `DATA_DIR` holds the database directory; `query()` keeps the exact same signature and result shape (`rows`, `rowCount`).
- [ ] Run every migration under PGlite; where a Postgres feature is missing, propose the smallest SQL change in the PR and do not edit migration files yourself (the migration owner applies it).
- [ ] `scripts/test-pglite.js` runs the full `node --test` suite with `DB_DRIVER=pglite` against a temp directory. Record which tests pass and which fail in the PR.
- [ ] `db.health()` reports the driver.
- Acceptance: the server boots with no Postgres, migrations apply, a guide can sign up and generate a template course, all under PGlite.

## Well 2 (existing session): land the audio item type

Branch `courses/well2-ip-curriculum` (existing). Rebase onto `main` after Wells 4 to 6 merge. Land only the audio item type, `AudioPlayer.tsx`, and migration `031_voice_music.sql`. Leave the rest of the branch for a second PR.

---

## Wave 2 (start after wave 1 merges)

- **Translatable UI** (touches every page, so it waits): `web/src/i18n/` dictionary, `t()` helper, `lang` per learner, Spanish first.
- **Standards tags** (migration `032_standards.sql`): per-lesson tags, shown on course pages and in reports, CSV learner import, lesson-plan PDF.
- **Console navigation regroup**: Teach, Learners, Records, Workspace.
- **Per-task AI providers**: `AI_ROUTES` entries carry `baseUrl` and `apiKey`, so public course generation can use a cheap provider while the tutor stays on a no-training one.
- **Language item kinds**: vocabulary card, listen and choose, listen and repeat, cloze, translate, dialogue, graded reader.
- **Tauri shell** on top of Well 13.
- **MCP server** exposing courses, learners and progress.
- **Steam page and SteamPipe** on top of the Tauri shell.
