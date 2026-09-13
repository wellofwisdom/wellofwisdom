# Well of Wisdom: full review and growth plan (Well 4, 13 September 2026)

A read of the whole codebase at `cc361b7` on `main`, the live site at wellofwisdom.app, the demo, the docs and the GitHub repo. Written to be acted on. Each section ends in concrete tasks. Nothing here is a rewrite; the foundation is good and this plan builds on it.

State of play at the time of writing:

| Measure | Value |
|---|---|
| Repo age | 14 days (created 30 Aug 2026) |
| Commits | 148, one author |
| Server tests | 698 pass, 14 suites |
| Frontend tests | 0 |
| Route files with tests | 5 of 27 |
| Web bundle | 758 kB JS in one chunk, 110 kB CSS |
| GitHub stars / forks | 0 / 0 |
| Open issues | 17 |
| Example courses | 17 validated packages |
| Migrations | 30 |

---

## 1. What is already strong (keep doing this)

- **The trust boundary is real.** Answers never reach the learner's browser (`server/lib/grade.js`), AI output is normalized before storage, `perm.js` fails closed on unknown roles and unknown actions, observers are blocked at one middleware for every route. This is better than most commercial ed-tech.
- **Degrade gracefully is enforced, not aspirational.** No DB, no AI, no kie key: the app still boots and every non-AI feature works. Reviewers and self-hosters notice this.
- **Discovery surfaces for machines** (`/llms.txt`, `/c/:slug.txt`, sitemap, CORS-open public API) are ahead of the market. Lean on them in marketing to coders.
- **Two dependencies on the server** (express, pg). Small attack surface, fast install, easy to audit.
- **The docs explain why.** `ARCHITECTURE.md`, `perm.js` comments, and the roadmap read like a maintainer talking to a future maintainer. Contributors will trust this.
- **Shipping pace.** An immersive learner shell, 12 hand-authored IP courses, voice, music, and a public demo in two weeks.

---

## 2. Mistakes and risks in the codebase (ordered by severity)

### High

1. **Live secrets in `HANDOFF.md`.** The DeepSeek key, the kie key, the SparkPost key and a pointer to the DB password file are in plain text. The file is gitignored, which is correct, but every AI session is told to read it in full, so those keys now exist in many chat transcripts. Rotate all four now (the `api-key-security` skill covers Coolify and SparkPost) and change the pattern: keep credentials in one local file outside the repo, and let the handoff say only where it lives.
2. **`app.set("trust proxy", true)` trusts any `X-Forwarded-For`.** Behind Traefik this is fine. A self-hoster who exposes port 3000 directly lets any client spoof its IP, which turns the login and demo rate limiters off. Use `trust proxy: 1` by default and make it env-configurable (`TRUST_PROXY=1|true|false`).
3. **No Content-Security-Policy.** The app renders KaTeX HTML through `dangerouslySetInnerHTML` (escaped on error, good) and loads Google Identity scripts. A CSP with `script-src 'self' https://accounts.google.com` plus a nonce closes a whole class of injection outcomes. One middleware line in `server/index.js`.
4. **Bus factor of one, and the real documentation is not in the repo.** 117 kB of operational knowledge lives in a gitignored file. Split it: secrets stay out, everything else (deploy verification, scratch DB testing, the world system, critical patterns) moves into `docs/OPERATIONS.md` and `docs/PATTERNS.md`. Contributors cannot help with what they cannot read.

### Medium

5. **No frontend tests and no lint.** `web/` has no ESLint, no Prettier, no vitest, and no smoke render. `ARCHITECTURE.md` promises a jsdom smoke suite once the frontend exists; it exists. Add `eslint` with `react-hooks` (the missing dependency in `LessonPlayer.tsx` `useEffect(() => { load(); }, [lessonId])` is exactly what it catches) and a vitest render test per page.
6. **Route tests cover 5 of 27 route files** and CI has no Postgres service. The tests that exist are strong but the untested files include `learn.js`, `courses.js`, `auth.js`, `uploads.js`. Add a `postgres:16` service to `ci.yml` and an integration harness that boots the app against it. Start with auth, learn attempts, and the family scoping of every list endpoint.
7. **One 758 kB JavaScript chunk.** A logged-out visitor on the landing page downloads the whole guide console, the world builder, the learner game, and KaTeX. Vite already warns. `React.lazy` on `LearnerApp`, `Studio`, `WorldBuilder`, `CourseDetail`, `Settings`, and load KaTeX only inside `rich.tsx` when a `$` token is seen. Expect the landing to drop under 150 kB.
8. **Docs promise things the code does not have.** `ARCHITECTURE.md` rule 3 describes `lib/storage.js` with `local` and `s3` adapters; the file does not exist and uploads are hard-wired to `UPLOAD_DIR`. It also promises "full export of everything a family created, any time"; only per-course export exists. Either build both or edit the docs. Both are worth building: whole-family export is what a parent needs when they leave, and it is what makes "your data is yours" true.
9. **Unknown console routes render a blank Shell.** In `App.tsx` a path like `/anything` matches nothing and the content area is empty, with no 404 and no redirect. Add a final fallback that says "That page does not exist" with a link home.
10. **The hand-rolled route chain in `App.tsx` will not scale.** Twenty-two `route === "..."` checks plus six regexes in one component. It works, but every new page touches this file and the `Shell` active-tab mapping on the same line. A small route table (`{ pattern, page, nav }`) keeps the no-dependency rule and removes the drift.
11. **`LessonPlayer` fetches the whole course tree on every lesson open** just to find the next lesson. Return `next_lesson` from `GET /api/learn/lessons/:id` and drop the second request.
12. **Version drift.** `package.json` says `0.0.1`; README advertises the `v0.1.0` image; the `/api/health` endpoint reports `0.0.1`. Tag a real `v0.1.0`, bump the file, and let `release.yml` publish. The held workflow in `HELD-WORKFLOWS.md` is ready; it needs the workflow-scoped token.
13. **Three parallel branches with real divergence.** `courses/well2-ip-curriculum` is 94 files from main and carries a migration (`031_voice_music.sql`) and a new item type. Every day it waits, the rebase gets harder. Land the audio item type on main next, as the handoff says, then retire the branch.

### Low

14. **Input validation is per-route and by hand.** It is careful (`slice(0, 160)`, `Math.min` clamps) but there is no shared helper, so each new route re-invents it. A 40-line `lib/validate.js` (`str(max)`, `int(min,max)`, `oneOf([...])`) would make reviews faster. No new dependency needed.
15. **The in-memory login limiter clears entirely at 10 000 entries** (`attempts.clear()`), which resets every counter under load rather than evicting the oldest. Swap for a bounded map (delete the first key when over cap).
16. **`express.json({ limit: "2mb" })`** is global. Course import and worksheet paste will hit it with a large course; give the import routes their own larger limit.
17. **Emoji as UI icons** (the sign-out and print glyphs in the lesson header) render differently per OS and are unreadable on some Linux fonts. `Icons.tsx` exists; use it everywhere in chrome, keep emoji for content.
18. **The error handler logs only `err.message`** and drops the stack. Log `err.stack` outside production, and add a request id so a self-hoster can quote one line in a bug report.

---

## 3. User interface and experience

### Guide console

- **Too many top-level destinations.** Sixteen nav routes (dashboard, learners, studio, courses, community, experience, records, tutor, work, attendance, portfolio, plans, notes, library, calendar, settings). A parent with one child faces a menu built for a school. Group into four: **Teach** (studio, courses, community, plans), **Learners** (learners, work, tutor log), **Records** (progress, attendance, portfolio, reports, calendar), **Workspace** (notes, library), with Settings in the account menu. Keep the palette for power users.
- **The dashboard "Getting Started" is good.** Extend it to the five actions that predict retention: add a learner, generate a course, publish it, watch the learner play it, read the first progress report. Show the learner's own screen inside step four (an inline "View as learner" button), because the game side is the part that sells.
- **Empty states are honest but flat.** "Nothing here yet" on Recent activity in a demo is a lost moment. See the demo section below.
- **Print and dark mode both exist**, which educators will love. Put a "Print sample report" link on the landing.

### Learner game

- **The shell is strong: HUD, path, world map, quest log, dailies, music.** What is missing is a single **"Play now" action** that resolves to exactly one thing (the next due review, or the next lesson, or the boss). A child should never choose between four boards on first open.
- **Keyboard and controller play** is absent. Every interactive node is a `<button>`, so focus works, but there is no spatial navigation and no key legend. See section 8.
- **Reading support:** add a per-learner text size and an OpenDyslexic or Atkinson Hyperlegible toggle. Read-aloud already exists; wire it to a single global toggle so every article auto-reads when on.
- **Feedback on wrong answers** is text. The lesson feels like a form in that moment. A short animation, the companion line, and the narrator saying the hint would carry the game frame into the exercise.
- **Photo finish** is there; **share with guide** should produce something the guide sees on the dashboard as an event, not just in Work.

### Public demo

- The demo lands on the **guide console of an empty family**. A visitor sees "Recent activity: nothing here yet" and "0 to read". Seed the demo with a learner who has already done real work: attempts, completions, one returned project with guide feedback, one boss run, one quarterly report. Every page then has content.
- The demo should offer **"Play as the learner"** as the first button. The game is the differentiator; the console is the plumbing.
- Add a 60-second guided tour (five tooltips) that ends in the Studio with a prefilled "Fractions through sewing" ready to generate.

---

## 4. The public-facing website: what is missing

wellofwisdom.app already has the right structure (hero, lenses, comparison table, how it works, pricing, FAQ, waitlist). These are the gaps, ordered by impact.

1. **No pictures of the product.** The hero shows a mock card of the Course Studio. There is no screenshot or video of the learner's world map, the boss fight, or a printed report. Educators buy on the child's screen; coders star on a GIF. Record a 30-second loop of a learner walking the path and beating a boss, and put it in the hero and in the README.
2. **Social proof that may not be real.** The "Trusted by" section quotes a "Homeschool pilot family" and a "Co-op guide, 6 learners". If these are not real people who agreed to be quoted, remove the section today: fabricated testimonials break trust with exactly the audience you want and fall foul of endorsement rules. Replace with something true: "17 open courses", "698 automated tests", "AGPL since day one", and named early users when you have them.
3. **Visible keyword chips** ("homeschool curriculum generator", "AI course creator", "self hosted LMS") under the hero read as keyword stuffing to a human and to Google. Turn each into a real link to a real page: `/for-homeschools`, `/for-co-ops`, `/for-teachers`, `/self-host`, each with its own copy and its own courses.
4. **No Privacy Policy, Terms, or COPPA statement pages.** The site takes Google sign-ins and email addresses. Google's OAuth verification requires a privacy policy URL, and a homeschool parent will look for one. Add `/privacy`, `/terms`, and a plain-English `/children` page (what is stored, what leaves the box, how a parent deletes everything).
5. **No "For teachers" page.** A classroom teacher needs: standards alignment, a gradebook export, printable lesson plans, a way to add thirty learners at once (CSV), and a statement on accessibility (WCAG 2.1 AA target). None of that is on the site even where the product half-does it.
6. **No pedagogy page.** The spaced review, the Socratic strictness modes, the misconception spotting, and the "guide reviews every word" rule are research-backed choices. One page with citations (Ebbinghaus, Cepeda et al. on spacing, Bloom's two-sigma, Chi on self-explanation) makes educators take the project seriously.
7. **No docs site.** The README is doing the job of docs. A `/docs` route built from the existing markdown (self-host, env vars, course format, API, contributing) is a weekend with a static generator and it is what coders click first.
8. **No blog or changelog.** Growth on GitHub comes from having something to post. A `/changelog` fed from release notes and a monthly "what shipped" post gives you a reason to show up on Hacker News, Reddit, and Mastodon.
9. **No community link.** Discussions on GitHub, a Matrix or Discord room, and a newsletter form. The waitlist form exists; label one option "just updates" and treat it as the newsletter.
10. **One Tap covers the hero on desktop.** The roadmap calls it an accepted wart; on a first visit it hides the primary button for a moment. Delay One Tap until the visitor scrolls or until three seconds pass.
11. **Pricing says "coming soon" with no number.** Even a placeholder range ("from $9 a month per family, co-op pricing on request") converts better than a blank. Educators need a number to put in a budget request.
12. **Sample outputs to download.** A real `.wow-course.json`, a printed quarterly report PDF, an attendance CSV. Let a reviewer hold the artifact.

---

## 5. Attractive to both educators and coders

**For educators**
- Standards tags on every lesson (Common Core, NGSS, and a free-text state field), shown on the course page and exported in the report. This is the single most requested feature by classroom teachers and it unlocks grant applications.
- Bulk learner import (CSV), classroom codes, and a projector mode for the lesson player.
- Lesson plan PDF per lesson (objectives, materials, timing) beside the worksheet print.
- An accessibility statement and a real audit (axe in CI).
- Evidence: a pilot with three named families or one co-op, with a written case study on the site.

**For coders**
- A demo GIF in the README above the fold.
- `docs/API.md` or an OpenAPI file generated from the routes. The public API already exists; document it.
- A plugin point: custom lesson item kinds registered in one file, and custom AI providers in `server/lib/providers/`. The provider folder is already the pattern; name it in the docs.
- **An MCP server** (`wellofwisdom-mcp`) exposing courses, learners, and progress as tools, so any Claude or other agent can author courses into a family's instance. This is the kind of thing that gets a repo shared on AI-developer channels.
- Twenty well-written `good first issue` tickets with file paths and acceptance criteria, before launch day. A `hacktoberfest` topic on the repo (registration opens mid-September; the timing is right).
- A CHANGELOG, tagged releases, and a published Docker image that `docker pull` actually finds.

---

## 6. Becoming a GitHub repo of the week

Trending is a burst of stars in a short window from people who found the project through the same channel. It does not happen by accident and it does not happen to a repo with no picture. Sequence:

**Week 0 (prep, 5 days)**
- Fix the four High items in section 2, tag `v0.1.0`, publish the image.
- README: GIF, one-line pitch, three screenshots (world map, Studio, printed report), a "why not Khan" table (already there), and a "self-host in 30 seconds" block.
- Twenty good first issues, Discussions enabled, `hacktoberfest` and `education` `homeschool` `self-hosted` `lms` `ai` topics set on the repo.
- Seed the demo with real activity and put "Play as learner" first.
- Privacy and terms pages live.

**Week 1 (launch day, one day, everything at once)**
- Show HN post at 8 to 9 am Eastern on a Tuesday or Wednesday: "Show HN: Well of Wisdom, a self-hosted Khan Academy alternative that generates courses through what your kid loves (AGPL)". First comment from you: architecture, the trust boundary, why AGPL, what does not work yet.
- Same morning: r/selfhosted, r/homeschool, r/opensource, r/Teachers (read each sub's rules on self-promotion first), Lobsters if you have an invite, Mastodon with `#selfhosted #education`, Bluesky.
- Product Hunt the same day or the day after.
- Submit to `awesome-selfhosted` (needs a release and a Docker image, which is why week 0 tags one), `awesome-education`, `awesome-lms`, and the selfh.st and noted.lol newsletters.
- Email five homeschool YouTubers and podcasters with the demo link and an offer of a free hosted family.

**Weeks 2 to 6 (keep the curve up)**
- One release a week with a changelog post.
- One "how we built X" technical post: the trust boundary, the spaced review scheduler, the kie audio cache, the Postgres job queue with `SKIP LOCKED`. Coders share these.
- Answer every issue within a day for the first month.

---

## 7. Funding, grants and free AI usage

Terms change; treat each as "apply and confirm", not a promise.

**Grants that fit this exact shape**
- **NLnet NGI Zero Commons Fund** (EU, calls roughly every two months, typical awards 5 000 to 50 000 EUR, open to anyone worldwide building open-source internet commons). The application is a short form. Pitch: privacy-preserving, self-hosted, offline-capable learning with local AI. The roadmap already flags this; it is the best single fit.
- **The Tools Competition** (Learning Engineering, run by The Learning Agency; opens each autumn; awards from about 50 000 to 300 000 USD for ed-tech tools that generate learning data). Pitch the spaced-review and misconception engine plus the open course format.
- **Digital Public Goods Alliance registration.** Not money directly, but DPG status is a prerequisite for UNICEF, GIZ and several foundation channels, and an open-source AGPL ed platform with COPPA posture is a strong candidate. Needs a privacy policy and a documented data model, which section 4 already asks for.
- **Mozilla** programs (Builders, Technology Fund) have funded open-source AI for public benefit; check the current call.
- **Shuttleworth Foundation Flash Grants** are nominations, so get on the radar of existing fellows in open education.
- **Chan Zuckerberg Initiative** and **Siegel Family Endowment** fund education technology with evidence; these need a pilot with data first (section 5).
- **Kickstarter or Crowdfundr for the Steam edition** (section 8). A "learning game your kids own" campaign is legible to parents in a way GitHub Sponsors is not.

**Recurring**
- GitHub Sponsors is already wired in `FUNDING.yml`; also set up **Open Collective** (transparent budget, educators and co-ops can pay from an institution) and **Ko-fi** for parents.
- Managed hosting is the business. Publish a price.

**Free or discounted AI and cloud credits**
- **Google for Startups Cloud Program** (Gemini and Cloud credits; the app already supports Gemini).
- **AWS Activate** (credits for early startups; also usable for Bedrock models).
- **Microsoft for Startups Founders Hub** (Azure and OpenAI credits, no funding required to apply).
- **NVIDIA Inception** (free to join; cloud credits and hardware access; useful for local-model work in section 9).
- **Anthropic** and **OpenAI** both run startup and research credit programs; apply with the education and child-safety angle.
- **Groq, Together, Fireworks, DeepInfra** offer free tiers or developer credits for open-weight models; the OpenAI-compatible layer already works with them. Groq also exposes Whisper for speech input.
- **Cloudflare for Startups** and **DigitalOcean Hatch** for hosting credits when the hosted tier grows past one Hetzner box.
- **Cheapest of all:** keep DeepSeek and Gemini Flash as the default "included" tier and make Ollama the documented zero-cost path. Publish the per-course cost (it is already tracked) so families see that a course costs cents.

---

## 8. Steam and desktop: the plan

**Do you need Rust?** No. Not to ship an exe, and not to ship on Steam. Rust becomes worth it only if you later want a native renderer for the world map (Bevy). The recommended path uses a Rust-based shell (Tauri) but you write almost no Rust.

**The one real blocker is Postgres.** A Steam game cannot ask a parent to run a database. Two options, and the second is better:
- SQLite via a query-dialect layer (large rewrite of 30 migrations and every query).
- **PGlite** (Postgres compiled to WebAssembly, runs inside Node, persists to a directory). Same SQL dialect, same migrations, near-zero query changes. `db.js` gains a second driver behind the same `query()` interface, selected by `DB_DRIVER=pglite`. Test the 698 tests against it first; where a PG extension is missing, replace with plain SQL.

**Phase A: desktop build (3 to 4 weeks)**
1. Add the PGlite driver and an `embedded` mode: `DATA_DIR` holds the database, uploads and audio cache.
2. Package the Node server as a single binary (Node 22 single-executable application, or `pkg`) so no Node install is needed.
3. Wrap in **Tauri v2** with the server as a sidecar process; the webview loads `http://127.0.0.1:<port>`. Tauri gives a 10 MB shell, auto-update, code signing hooks, and Windows, macOS and Linux builds from one config. (Electron is the fallback if the sidecar model fights you: heavier, but the server runs in-process.)
4. First-run flow: create the family locally, no email. AI is optional: bring a key, or install the optional local model pack (see section 9).
5. Bundle all 17 courses and the 18 adventure templates as content. This is the "game": the learner side, full screen, with the guide console behind a parent PIN.

**Phase B: Steam (4 to 6 weeks after A)**
1. Steamworks partner account, the Steam Direct fee (100 USD per app), tax and bank forms.
2. Store page: capsule art, six screenshots, a trailer (the same 30-second loop as the site), tags `Education`, `Family Friendly`, `Casual`, `Free to Play` or a price, and the content questionnaire.
3. Steamworks integration through `steamworks.js` (a Node binding, works in the sidecar) or the `steamworks` Rust crate inside Tauri: **achievements** map one-to-one onto the existing `badges` table, **Steam Cloud** syncs `DATA_DIR` (keep it under 1 GB; audio cache stays local), **overlay** works with the webview.
4. Upload builds with SteamPipe (`steamcmd`), a `beta` branch for playtesters, a `default` branch for release. Wire this into `release.yml` so a tag ships to Steam.
5. **Steam Deck verification** wants controller-only play, readable text at 1280x800, and no OS keyboard. Sections 8b and 9 are what make it pass.
6. Playtest with Steam Playtest (free), then Early Access with a clear "what is coming" list, then 1.0.

**Phase C: business model on Steam**
- Free base with the public-domain courses; paid **course packs** as DLC (the premium curriculum packs already in the roadmap); AI generation stays bring-your-own-key or an in-app credit purchase through the Steam microtransaction API.

### 8b. Controller support

The whole learner UI is HTML, so a controller is a focus-navigation problem, not a rendering problem.

1. **Gamepad API** in the browser (`navigator.getGamepads()` polled in `requestAnimationFrame`). In Tauri and Electron it works out of the box; on Steam, Steam Input presents any controller as XInput.
2. A `useGamepad` hook and a **spatial focus manager**: left stick or d-pad moves focus to the nearest focusable element in that direction (compute from `getBoundingClientRect`), A activates, B goes back, X reads the item aloud, Y opens the hint, right trigger toggles the narrator, start opens the map. Show a small button legend in the HUD when a pad is connected.
3. **Answer entry without a keyboard:** MCQ maps to the four face buttons; numeric answers get an on-screen number pad including `/` and `.`; text answers get an on-screen keyboard or, better, speech (section 9).
4. **Rumble** on correct and on boss hits through `gamepad.vibrationActuator`.
5. Mark every interactive node with `data-nav` so the manager can skip decorative buttons; the path and world map nodes already are buttons.
6. Ship it behind a setting first ("Controller mode") and turn it on automatically when a pad connects.

---

## 9. Speech input and output

**Output already exists in two tiers:** kie Gemini TTS cached per scene, and browser `speechSynthesis` as fallback. Add a third for offline and Steam: **Piper** (small, fast, runs as a sidecar, many voices) or **Kokoro** (ONNX, runs in the browser with WebGPU). The narrator button, companion line, and read-aloud all route through one `speak()` with provider selection, so the change is in one place.

**Input (new).** Three tiers so it works everywhere and stays private:
1. **Browser Web Speech API** (`SpeechRecognition`): free, no server, Chrome and Edge only, audio goes to the browser vendor. Fine for the hosted demo, not for strict-privacy families.
2. **Server-side transcription** through the existing AI layer: an OpenAI-compatible `/v1/audio/transcriptions` endpoint (Groq, OpenAI, DeepInfra all serve Whisper) with the same spend caps and the same vault settings. New route `POST /api/stt`, new provider file, `STT_MODEL` env, a card in the AI vault.
3. **Fully offline**: `whisper.cpp` as a sidecar in the desktop build, or `whisper-tiny` through Transformers.js in the browser for short answers. Nothing leaves the box, which is the Steam and strict-mode default.

**The pipeline, per answer**
- Push-to-talk (button, space bar, or controller trigger) records 16 kHz mono through an `AudioWorklet`; a small voice-activity detector (Silero VAD, ONNX) trims silence.
- Transcribe. Then **normalize for the answer type**: number words to digits ("three quarters" to `3/4`, "one and a half" to `1 1/2`), letter names to MCQ choice ids ("B" or "the second one"), and pass text answers through as typed.
- Show the transcript in the answer box and require a confirm (tap or A button). A child must never be marked wrong by a mishearing without seeing it.
- Grade exactly as typed answers are graded. The audio is discarded unless the guide turns on "keep recordings".

**New item kind: `spoken`.** A prompt the learner answers aloud, graded by the same rubric path as projects (AI drafts, guide confirms) or by exact match for short answers. This is the base for language learning and for early readers who cannot type yet.

**Tutor voice mode.** Push-to-talk into the tutor, tutor reply through the narrator voice, with the transcript in the thread as now. Strict modes keep working because the text path is unchanged.

---

## 10. Teaching a language

The pieces are mostly present: lenses, an AI `translate` route, spaced review, TTS with per-character voices, image generation for picture vocabulary, and a public-domain literature library (Alice, Holmes, Oz, Pooh) that can become graded readers.

**Course generation:** add `target_language` and a **CEFR level** (A1 to C1) to the Studio. "Spanish A1 through horses" is a lens plus a language. The generator writes in the target language at the level, with the learner's native language for instructions.

**Item kinds to add** (each is one entry in the item registry, one grader, one player component):
- **Vocabulary card**: word, picture (kie image), audio (TTS in the target voice), example sentence. Feeds the existing spaced-review scheduler unchanged.
- **Listen and choose**: TTS plays, learner picks the meaning. MCQ underneath.
- **Listen and repeat**: TTS prompt, learner speaks, STT transcribes, score is word-level match against the target with per-word feedback. Later, real pronunciation scoring (goodness of pronunciation from a wav2vec2 CTC model) as an optional offline model.
- **Cloze**: fill the gap in a sentence, exact or AI-tolerant grading.
- **Translate**: free text graded by the rubric path with tolerance for valid alternatives.
- **Dialogue**: a role-play with the tutor in the target language, with strictness levels reused (hints only, corrections after, full explanations).
- **Graded reader**: a public-domain chapter rewritten at level, with tap-a-word glosses and comprehension questions. This is where the IP library pays off twice.

**Prerequisite: the UI itself must be translatable.** Every string is hard-coded English and `index.html` says `lang="en"`. Extract strings to one dictionary per language (a small `t()` helper; no library needed), set `lang` per learner, and let TTS and STT pick the voice and model from it. Start with Spanish (largest homeschool demand in the US), then French and Latin (Latin needs no speech, so it is a good first test of the rest).

---

## 11. The overall plan, in order

Each line is one to two weeks for one person. Parallel wells can take separate lines.

1. **Harden and publish** (section 2 High items, `v0.1.0` tag, image on ghcr, privacy and terms pages, demo seeded with activity, README GIF).
2. **Launch week** (section 6).
3. **Quality floor**: frontend lint and tests, Postgres in CI, route integration tests, code splitting, whole-family export, storage adapter.
4. **Educator pack**: standards tags, CSV learner import, lesson-plan PDF, accessibility audit, "For teachers" page, first named pilot.
5. **Land Well 2**: audio item type and migration 031 onto main; retire the branch.
6. **Controller mode and speech input** (sections 8b and 9), because they unlock Steam Deck, early readers, and language learning at once.
7. **Language learning v1**: Spanish A1 with the seven item kinds above and a translated learner UI.
8. **Desktop build** (section 8, Phase A) with PGlite and Tauri.
9. **Steam** (Phase B): page, playtest, Early Access.
10. **Grants in parallel from week 1**: NLnet first (short form), DPGA registration, then Tools Competition when the call opens.
