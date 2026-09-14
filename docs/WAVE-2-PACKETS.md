# Wave 2 work packets (14 September 2026)

Eight packets for the Wells that finished wave 1. Wells 2 and 3 continue Course Builder v2 (`docs/COURSE-BUILDER-V2.md`), and Well 6 finishes its integration tests. Language lesson kinds wait until the Course Builder item registries land.

Every Well works in its own folder, already created on its new branch from current `main`: `C:\Users\kevin\ZCodeProject\wellofwisdom-wellN`.

## Rules for every Well

1. Work only in your folder and on your branch. Never commit to `main`, never merge, never deploy, never touch the live site or its database.
2. **Never open** `HANDOFF.md`, any `.env`, `wow-secrets.txt`, `wow-deploy-env.txt`, `.git-credentials`, the `.zcode` folder, or anything in `C:\Treman\`. Never put a key, token or password in code, tests, docs, commit messages or chat. Tests use obviously fake values.
3. Touch only the files your packet owns. If you must edit another file, keep it to a few lines and list it in your report.
4. After every `git fetch`, run `npm install` and `npm --prefix web install`. Missing packages look like test failures; they are not.
5. Before every push, all five must pass: `npm run check`, `npm test`, `npm --prefix web run lint`, `npm --prefix web test`, `npm --prefix web run build`. Main's CI is green, so any failure is yours to fix.
6. Server tests are `server/**/*.test.js` (node --test). Web tests end in `.test.tsx` (vitest). A web test named `*.test.ts` or `test-*.ts` gets picked up by node --test and breaks it.
7. No em dashes anywhere. Rewrite the sentence.
8. Migrations are additive only and use the number your packet gives you. Reserved: `032` Well 8, `033` to `039` Well 2, `040` Well 12.
9. Every server-wide setting (anything stored in `server_settings`) uses `requireInstanceAdmin` from `server/lib/instanceAdmin.js`. A test fails otherwise.
10. Merge `origin/main` into your branch at least daily. Commit in small steps and push after each finished item.
11. When done, report: branch, what changed, how you tested, what you left out.

---

## Well 5: translatable interface, learner side first

Branch `well5/i18n-learner`. Owns `web/src/i18n/**` (new), `web/src/pages/learn/*.tsx` except `LessonPlayer.tsx`, `server/lib/learners.js` (one field), `web/src/pages/LearnerForm.tsx` (one field), `docs/TRANSLATING.md` (new).

- [ ] `web/src/i18n/`: a tiny `t(key, vars)` helper and `useT()` hook, no library. English dictionary `en.ts` is the source; `es.ts` is Spanish. Missing keys fall back to English and warn once in development.
- [ ] Language per learner: `prefs.lang` on the learner row (`en` default), editable in the learner form, returned by `/api/me` for learners. `document.documentElement.lang` follows it.
- [ ] Translate every learner-facing string in `web/src/pages/learn/` (shell, HUD, home, course path, world, quest log, dailies, weeklies, practice, tutor chat). Leave `LessonPlayer.tsx` and `learn/items/**` alone: Well 3 is moving them. Give Well 3 the keys it needs in your report.
- [ ] Browser speech and narration pick a voice for `prefs.lang` when one exists.
- [ ] A vitest that every key in `en.ts` exists in `es.ts`, and a test that no JSX text node in the translated files is a bare English string (a simple source scan is fine).
- [ ] `docs/TRANSLATING.md`: how to add a language.
- Acceptance: a learner set to Spanish sees the whole learner app in Spanish apart from lesson content and the lesson player.

## Well 7: console navigation and brand

Branch `well7/console-nav`. Owns `web/src/components/Shell.tsx`, `web/src/components/Palette.tsx`, `web/src/pages/Dashboard.tsx`, the sidebar and dashboard sections of `web/src/styles.css`.

- [ ] Group the sixteen sidebar destinations into four labelled sections: **Teach** (Studio, Courses, Open courses, Learning paths), **Learners** (Learners, Submitted work, Tutor log), **Records** (Progress, Attendance, Calendar), **Workspace** (Workspace, Library). Settings and Experience move to the account menu. Every route keeps its URL.
- [ ] Collapsible sections, remembered per browser, with the active page's section always open.
- [ ] Replace emoji icons in the sidebar with icons from `components/Icons.tsx` (add the few missing ones there).
- [ ] Brand: the stone well logo and the Cinzel wordmark in the sidebar header, matching the public site (`web/src/site/site.css` has the tokens and the Fontsource imports).
- [ ] Dashboard getting-started: five steps (add a learner, generate or import a course, publish it, open it as the learner, read the first progress report), with "Open as learner" inline on step four.
- [ ] Command palette lists every destination under the same four group names.
- [ ] Smoke tests updated.
- Acceptance: no page loses its link, keyboard navigation works through the groups, and the sidebar fits 768 px wide.

## Well 8: standards tags and lesson plans

Branch `well8/standards`. Owns `server/migrations/032_standards.sql`, `server/lib/standards.js` (new) and its test, `web/src/components/StandardsTags.tsx` (new), `web/src/pages/PrintLesson.tsx`. Small edits allowed: `server/routes/courses.js` (the lesson PATCH only), `server/routes/reports.js`, `server/lib/share.js` (public allowlist), `web/src/pages/CourseDetail.tsx` (one line to mount the component; Well 3 owns the file).

- [ ] Migration 032: `lessons.standards text[] not null default '{}'`.
- [ ] `lib/standards.js`: normalize codes (trim, uppercase framework prefix, dedupe, max 12 per lesson, max 40 chars each), recognise Common Core maths and ELA, NGSS, and free-text state codes, and return a short framework label for display.
- [ ] Lesson PATCH accepts `standards`; the course tree returns it; course export and import carry it.
- [ ] `StandardsTags`: a tag input with framework labels, mounted under each lesson's title in the course editor.
- [ ] Public course pages and `/c/<slug>.txt` show standards (add the field to the share allowlist with a test).
- [ ] Progress reports list the standards covered by completed lessons in the period.
- [ ] Lesson plan print: `PrintLesson` gains a "Lesson plan" mode with objectives (the lesson summary), standards, materials (from projects), a timing estimate (articles 5 min, exercises 2 min each, videos by length, projects 20 min), and the exercises with answers for the guide.
- Acceptance: a guide tags a lesson `CCSS.MATH.CONTENT.4.NF.A.1`, sees it on the public page, the report, and the printed lesson plan.

## Well 9: roster import

Branch `well9/roster-import`. Owns `server/routes/roster.js` (new) and its test, `server/lib/roster.js` (new) and its test, `web/src/pages/RosterImport.tsx` (new), and the print styles it needs. Small edits allowed: `server/index.js` (one `app.use`), `web/src/App.tsx` (one route), `web/src/pages/Learners.tsx` (one button).

- [ ] CSV import of learners: columns name, username (optional, generated when blank), grade, interests (semicolon separated), email (optional). Accept comma or semicolon delimiters, quoted fields, and a UTF-8 BOM. Cap at 200 rows.
- [ ] Two steps: `POST /api/roster/preview` validates and returns every row with errors (duplicate usernames in the file or the group, bad grade, bad email) without writing; `POST /api/roster/import` writes the valid rows in one transaction and returns generated PINs once.
- [ ] Permission `create_learner` for both; family scoped; rate limited.
- [ ] `RosterImport` page: paste or upload, preview table with errors highlighted, import, then a printable sign-in card sheet (group code, username, PIN per learner) that is shown only once and never stored in plain text.
- [ ] A downloadable CSV template.
- [ ] Tests: parser edge cases, duplicate detection, the transaction rolling back on a mid-import failure, PINs hashed at rest.
- Acceptance: a teacher imports 28 students from a spreadsheet export and prints their sign-in cards.

## Well 10: desktop shell

Branch `well10/desktop-shell`. Owns `desktop/**` (new), `.github/workflows/desktop.yml` (new), `docs/DESKTOP.md` (new). Coordinate with Well 13, which builds the server side of embedded mode.

- [ ] `desktop/`: a Tauri v2 app that starts the Well of Wisdom server as a sidecar on a free localhost port with `DB_DRIVER=pglite` and `DATA_DIR` in the user's app data folder, waits for `/api/health`, and opens the app in the window. Shuts the sidecar down on exit.
- [ ] For development, the sidecar is `node server/index.js` from the repo; for release, it is the single executable Well 13 produces (a placeholder path until that lands).
- [ ] Window title, the navy app icon at every size Tauri needs (generate from `web/public/icon-512.png`), single-instance lock, and a menu with Open data folder and Quit.
- [ ] `desktop.yml`: `workflow_dispatch` only, builds Windows, macOS and Linux bundles as artifacts. No signing yet, no release upload.
- [ ] `docs/DESKTOP.md`: prerequisites (Rust toolchain, Tauri CLI), dev run, build, where data lives, and what signing and Steam still need.
- Acceptance: on a machine with Rust installed, `npm run tauri dev` inside `desktop/` opens the app with a working local database and no Postgres installed.

## Well 11: per-task AI providers

Branch `well11/ai-routes`. Owns `server/lib/ai.js`, `server/lib/aiConfig.js`, `web/src/components/AiVault.tsx`, and their tests.

- [ ] The vault stores named providers (for example "DeepSeek main", "Cheap public generation", "Local Ollama"), each with kind (openai-compatible, anthropic, gemini), base URL, key, models, and a **trains on data** flag the admin sets.
- [ ] Task routing: each task in `DEFAULT_ROUTES` (course-gen, lesson-content, exercise-gen, lens, tutor, hint, grading, rubric, translate, plus stt) maps to a provider and a model. The existing single-provider settings become the default provider, so current installs keep working with no change.
- [ ] **Learner data rule, enforced in `ai.js`:** tutor, hint, grading, rubric and any call whose prompt includes a learner's name, notes or interests may only use a provider with trains-on-data off. A request that would break the rule falls back to the default provider and logs a warning, never silently sending learner data.
- [ ] Course generation marks a request as public content only when the course has no learner attached and the guide ticked "will be published openly"; only those may use a trains-on-data provider.
- [ ] Spend tracking and caps work per task and per provider.
- [ ] Vault UI: providers list, a routing table, the rule shown in plain words. Admin only (it already is).
- [ ] Tests: routing resolution, env fallback, the learner-data rule with a provider flagged as training, and no key ever returned unmasked.
- Acceptance: an admin routes open course generation to a cheap provider and everything touching learners to a no-training provider, and the tests prove learner prompts cannot reach the cheap one.

## Well 12: API tokens, MCP server, API docs

Branch `well12/api-tokens-mcp`. Owns `server/migrations/040_api_tokens.sql`, `server/lib/apiTokens.js` (new) and its test, `server/routes/tokens.js` (new) and its test, `mcp/**` (new package), `docs/API.md`, `docs/MCP.md` (new). Small edits allowed: `server/lib/auth.js` (bearer token lookup in `attachUser`), `server/index.js` (one `app.use`), `web/src/pages/Settings.tsx` (one card).

- [ ] Migration 040: `api_tokens` (id, family_id, user_id, name, token_hash, scopes text[], last_used_at, created_at, revoked_at).
- [ ] Tokens look like `wow_` plus 32 random bytes in base64url, are shown once, and are stored only as a SHA-256 hash like sessions.
- [ ] `attachUser` accepts `Authorization: Bearer wow_...`: the request acts as the token's guide, limited to its scopes (`read`, `courses:write`, `learners:read`, `progress:read`). Learners cannot create tokens. Revoked or unknown tokens are 401. Bearer requests skip cookie checks and are rate limited per token.
- [ ] Owners and guides create, list and revoke their own tokens in a Settings card.
- [ ] `mcp/`: a stdio MCP server (TypeScript, the official MCP SDK) that reads `WOW_URL` and `WOW_API_TOKEN` from the environment and exposes tools: list courses, get a course, import a course package, generate a course (starts a job and polls), list learners, get a learner's progress, list open courses on any instance. Its own `package.json`, build and README.
- [ ] Tests use a fake token only.
- [ ] Refresh `docs/API.md` for everything merged since it was written: speech routes, instance-admin routes, family export, token auth.
- [ ] `docs/MCP.md`: set up with Claude Desktop and other MCP clients.
- Acceptance: with a token from Settings, an MCP client lists a family's courses and imports an open course package into it.

## Well 13: embedded mode

Branch `well13/embedded-mode`. Owns `server/lib/db.js`, `server/lib/migrate.js`, `scripts/**`, the root `package.json` scripts, `docs/EMBEDDED.md` (new).

- [ ] `npm run test:pglite` runs the full server test suite against PGlite in a temp directory and passes. Fix incompatibilities in `db.js` or `migrate.js`; if a migration file itself needs changing, say which and why in your report instead of editing it.
- [ ] Embedded boot: with `DB_DRIVER=pglite` and no `DATABASE_URL`, the server creates `DATA_DIR`, runs migrations, and starts with jobs and digests running.
- [ ] First run: when the database has no families, the logged-out page offers "Create the first group" and marks that owner as the instance admin (the existing first-family rule already does this; add a test that proves it under PGlite).
- [ ] `scripts/build-sea.js`: build a single executable of the server with Node's single executable application support, bundling `web/dist`, migrations, templates and example courses, for the current platform. Document its size and limits.
- [ ] `docs/EMBEDDED.md`: how embedded mode works, where data lives, backup and restore by copying `DATA_DIR`.
- Acceptance: on a machine with no Postgres, the single executable starts, creates its data folder, and a guide can sign up and play a template course.
