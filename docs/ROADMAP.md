# Roadmap

Status legend: ✅ shipped · 🚧 in progress · 📋 planned

## Phase 0: Foundation ✅

- [x] Repo, AGPL-3.0 license, CI
- [x] Docker one-command self-host (app + Postgres, optional Ollama profile)
- [x] AI routing layer: any OpenAI-compatible endpoint, task tiers (pro/flash),
      env-overridable routes, graceful degradation
- [x] Health endpoint, placeholder landing page

## Phase 1: Course Studio + lesson player 📋

- Family + parent + learner accounts (parent-created, COPPA-friendly)
- AI Course Studio: topic + level + interests → full editable course draft
  (units → lessons → exercises → quizzes → projects)
- **Source Library** (NotebookLM-style grounding): attach PDFs, web pages,
  YouTube videos, and pasted text as sources; the Studio builds every lesson
  from the family's approved sources **with citations** back to them
- **Video lesson items**: assign any YouTube video to a lesson/course (embedded
  player, per YouTube's terms) with comprehension questions
- Lesson player: text lessons with KaTeX math, exercise types (multiple choice,
  numeric, expression via MathLive), instant feedback
- "Explain my mistake": AI diagnosis after wrong answers
- Printable worksheet export
- Postgres schema: families, learners, courses, units, lessons, items, attempts

## Phase 2: Socratic tutor + Lenses 📋

- Tutor chat with per-learner strictness (hints-only → full explanations)
- Full parent visibility of every conversation; guardrails on all learner chats
- **Lenses**: generate the same subject through a context the learner loves
  ("fractions through sewing," "physics through skateboarding")
- Learner profiles (age, level, interests) feeding all generators

## Phase 3: Memory + progress 📋

- FSRS spaced-repetition scheduling for every skill ("review due today")
- Transparent mastery (BKT-based; learner and parent can always see the math)
- Progress: time by subject, portfolios (photos of real projects), summary
  reports, certificates, and transcripts where you need them
- AI weekly planner (constraints → schedule)
- Photo-worksheet import (OCR → draft exercises)
- Read-aloud (Piper/Kokoro) + dictation (Whisper)
- Essay/project grading: AI drafts rubric feedback, parent approves

## Phase 4: Private beta 📋

- Two real teens + a teacher daily-driving it on actual schoolwork
- Weekly feedback loop; polish; export/import; backups
- Lens A/B acceptance test; guardrail red-teaming

## Phase 5: Public launch 📋

- Hosted public demo instance
- Docs site; awesome-selfhosted submission
- Launch week (Show HN + r/selfhosted, concentrated in one window)
- [x] Course-sharing library (CC-BY): community publishes their lenses (shipped, see Working plan)

## Later (research queue)

- **Audio overviews** (NotebookLM-style): AI-written two-voice podcast summary of
  any unit, read by local TTS (Piper/Kokoro): car-schooling gold
- **Free content importers**: Wikipedia/Wikiversity (CC BY-SA), Project Gutenberg
  EPUBs (public-domain literature for ELA), OpenStax chapters (CC BY-NC-SA
  free use only, never in paid packs)
- Code courses with sandboxed execution (Piston)
- Language learning: pronunciation scoring (GOP), conversation practice
- Offline/low-connectivity mode (Kolibri-inspired)
- Multi-language course generation
- Co-op / microschool mode (multiple families, one teacher)
- AP/SAT/ACT alignment layers on community courses
- Community course marketplace with fair revenue share for authors

---

# Working plan (2026-09-01)

Everything below came out of a strategy review. It is the actual to-do list:
the phases above describe the original build, this describes what happens next
and why. Anything marked shipped has a commit and is live.

## Shipped since the original phases

- [x] **Course sharing** (`dac1f90`, `f58c816`). Publish is opt-in per course and
      puts it at `/c/<slug>`: read-only, no session, licensed (CC BY / BY-SA /
      CC0 / all rights reserved) with optional credit.
- [x] **The portable package.** `/api/public/courses/:slug/export` is the same
      `.wow-course.json` the importer already accepts, so a published course
      round-trips. There is a test asserting exactly that.
- [x] **Import by URL.** Paste any instance's `/c/` link and the course copies
      across. SSRF-guarded through `safeSourceUrl`.
- [x] **Two projections, on purpose.** The public PAGE never carries answers,
      explanations or hints (allowlist, so a new field cannot leak by default).
      The downloadable PACKAGE does, unless the publisher opts out, because a
      teacher importing it needs to grade.
- [x] **Discoverability.** `/c/<slug>` is server-rendered with title,
      description, Open Graph and schema.org `Course` JSON-LD, plus
      `/robots.txt` and `/sitemap.xml`. A SPA shell is invisible to crawlers,
      unfurlers and research tools.
- [x] **Video uploads** (`1d6c64f`). A lesson video can be an uploaded file as
      well as a YouTube id, which is what makes a NotebookLM download usable.
      `courses.trailer_upload_id` renders at the top of a shared course page.
      `/media/:id` streams with byte ranges so scrubbing works.
- [x] **World foundation** (`3eae588`, `a043898`). Game types, encounters,
      characters including learner-made ones, loot, inventory, real rewards,
      per-learner encounter progress, plus the API over all of it.
- [x] **Sharing that keeps its answers straight** (`2d7090c`). A package
      published without answers used to come in with keys invented for it:
      choice one "correct" on every multiple choice question, 0 on every
      numeric one, written questions dropped. The normalizer now never invents
      a key, carries a real one to its renumbered choice, and a course with any
      unanswered question cannot go live to learners until each has one.
- [x] **Maths survives the normalizer** (`0ee7650`). The tag stripper ate
      everything between a "<" and the next ">", so every inequality lost its
      maths ("3 < 5 or 7 > 4" became "3  4"). Item edits now cross the same
      normalizer as everything else, checked first so a person's edit is
      refused with a reason rather than quietly changed.
- [x] **Pasted links stay outside** (`3adea7b`). Source pages, import by URL
      and PeerTube lookups fetch through `lib/safefetch.js`: every resolved
      address checked at connect time, every redirect re-validated, bodies
      capped. `FETCH_BLOCK_CIDRS` names the server's own public address.
- [x] **House style enforced** (`900363c`, `d6bfb7a`). No em dashes anywhere in
      our own source; `npm run check` fails on any dash character.

## Now

- [ ] **Publish four or five genuinely good courses** from this instance,
      including one only this app would ever produce. Sharing is not real until
      something is shared.
- [x] **Plain-text course view** at `/c/<slug>.txt` (`e55a947`). No chrome, no
      markup, the highest-signal thing to hand a research tool. Built from the
      public projection (`share.courseText`), so the answer key cannot leak into
      the text; a test asserts even a future secret field stays out. Registered
      before `/c/:slug` so the suffix wins.
- [x] **Copy source links** button on a public course (`e55a947`): text URL,
      page URL and export URL on the clipboard, plain-text first as the one to
      feed a notebook. A visible "View as plain text" link ships alongside it,
      which also gives a crawler a real anchor to the `.txt`.
- [~] **`community-courses` git repository + in-app library.** The courses live in
      git, the teachers live in the app. Two halves:
  - [x] **Everything the repository needs from this one.**
        `scripts/validate-course.js` (`lib/coursecheck.js`) reads a package
        exactly as an import will and names every place something would be
        dropped, cut to size, changed, or left without an answer key, with an
        open-licence rule for a library; a test holds its idea of what
        survives to what `normalizeCourse` actually keeps. Import by URL takes
        a GitHub file page and fetches the raw file behind it. The guide's own
        Export now carries the course's licence and author.
        `docs/COMMUNITY-COURSES.md` is the layout, the rules and the CI
        workflow; `docs/examples/*.wow-course.json` (5 courses, all validated)
        are the templates. Staged at `C:/tmp/community-courses-staging` with
        `courses/<slug>/course.wow-course.json` + README per course and
        `.github/workflows/validate.yml`.
  - [ ] **The repository itself.** PAT cannot create org repos via API (needs
        org owner via browser). One click at `https://github.com/new?org=wellofwisdom`
        with name `community-courses`, then push the staged dir. Your browser is
        already logged in via chrome-devtools MCP, token `github_pat_11B7GF…` in
        `~/.zcode/cli/config.json` is ready.
  - [ ] **In-app community library (no GitHub for teachers).** Browse inside
        the app, not on GitHub. Plan: a tab on the Courses page (Your courses /
        Community library), cards from the community repo, [Add to my library]
        that calls the import you already have. The repo stores courses, the app
        shows them. Teachers never touch git. See note below.

> **How the in-app library works (for the next PR):** The app never clones git.
> It fetches the community repo's file list via the GitHub API (or a cached
> `courses/index.json` in that repo) and shows cards (title, grade, lens,
> description). [Add to my library] just imports the `course.wow-course.json`
> file the teacher picked, the same code path as pasting a URL today. The repo
> stays plain files so forks inherit it. Teachers browse, tap Add, done.
- [x] **World UI** (`48c9ced`, `69c7156`). The learner's world view: chapters as
      a journey, encounter cards that are locked, open or won, loot, crew and
      real rewards. The guide's builder on the course page: pick a game type,
      build the encounters, attach a win video, make loot, set up and grant real
      rewards, approve learner-invented characters.
- [x] **Encounter prose** (`2884e8a`). AI writes a beat for every encounter,
      set in the world, gesturing at the real skill without naming the subject.
      Runs as a job, fails soft per chapter.
- [x] **Encounter art.** Already shipped and the box was never ticked:
      `questgen.illustrateWorld` is the "world-art" job, the guide triggers it
      from the World builder ("Illustrate", disabled when nothing is waiting),
      and `WorldView` renders `art_url` on the card. One house style per world,
      never re-illustrates something that has art, capped per run, and a single
      failure is skipped rather than aborting the batch.
- [x] **Loot on encounters from the UI** (`ac779b6`). Chips to remove, dropdown
      to add, hidden entirely when the family has no loot yet.

## Next

- [x] **YouTube ids must be validated** against the oEmbed endpoint before they
      are saved (`9f05789`). The generator is told to only use ids it is
      certain of, which is not a guarantee: a model will produce a plausible
      eleven-character string that points at nothing. `pruneDeadVideos` checks
      every generated id once and drops the dead ones; a pasted id goes through
      `checkYouTube`. Shipped earlier and the box was never ticked.
- [x] **Paste-a-link video** for guides, alongside the AI's own choices
      (`2ae10ef`). The add-item endpoint already verified a pasted URL via
      oEmbed; this is the UI in the course Videos panel.
- [x] **Vimeo and PeerTube** through the same oEmbed path (`ad9931f`). PeerTube
      matters to the self-hosting audience: their own instance, embedded.
      `resolveVideoUrl` is the one place a pasted URL becomes a verified,
      structured source; every fetch and every stored host is SSRF-guarded
      through `safeSourceUrl`, and `normalizeVideo` re-validates on import so a
      private-host source cannot cross the trust boundary. The player rebuilds
      each embed from structured pieces, never a free-form URL.
- [x] **Direct file URL** video (MP4/WebM on someone's own server) (`ad9931f`).
      Validated by extension and `safeSourceUrl` with no server-side fetch (the
      browser fetches it at play time); rendered in a plain `<video>`.
- [x] **Multiple guides per family** (migration 021). More than one guide, each
      with a role, joined by a single-use invite.
- [x] **Roles:** owner (billing, delete), guide (full teaching), assistant
      (assigned learners only), observer (read-only). Defined and tested in
      `perm.js` (021), and now actually ENFORCED at the routes (scoping in
      `438b2d3`, the requirePerm pass alongside this note): perm.js was the
      single source of truth for who may do what, but
      most write routes only checked `parentOnly`, so an assistant had a guide's
      powers. Every owner/guide-only action now carries `requirePerm` (course
      delete/publish/share, learner create/edit/delete, reward granting, paid
      media generation and provider config), and observer writes were already
      blocked globally by `denyReadOnly`.
- [x] **Per-learner scoping** (`438b2d3`). A hired tutor sees one student, not
      the family. The progress overview, the reports (list, preview, generate,
      read, edit, delete) and the learner roster all filter to the caller's
      visible learners via `perm.visibleLearnerIds` / `canSeeLearner`, which
      existed and were tested but no read route asked them. An assistant with no
      assignments sees nobody, never everybody.
- [x] **Invite links with expiry** (migration 021). Single-use, expiring invites
      carry the role and the assigned learners; a join code no longer has to be
      the whole story.
- [x] **Accessibility, measured not guessed.** Reviewed properly on 2026-09-01
      (`1c44e6b`). Two of the items below turned out to be overstated when
      checked against the code, which is recorded rather than quietly dropped.
      The gaps, worst first:
  - [x] ~~Alt text on AI-generated art~~. CORRECTED: all 4 images already carry
        alt text. The original count of 2 was taken before later work added
        more, and it was never the exclusion I described.
  - [x] **Maths is now readable to a screen reader.** KaTeX was set to output
        "html", which emits aria-hidden visual spans and NO MathML, so a blind
        learner met silence. Now "htmlAndMathml". Note for whoever touches
        this: do NOT add an aria-label to the wrapper, it overrides the MathML
        and makes readers announce raw TeX.
  - [x] **Grading feedback is announced**, via role="status" and aria-live
        polite, which speaks the verdict without stealing focus.
  - [x] **The modal traps focus and restores it.** CORRECTED: it always closed
        on Escape and focused its first control. What it lacked was the trap,
        so Tab walked out into the page behind.
  - [x] **The library board has a keyboard path** (`2ecd247`). Each card
        carries left/right move controls (and answers ArrowLeft/ArrowRight while
        focused) that shift it to the adjacent status column, labelled with the
        destination; focus follows the card so a run of moves is not punished.
        Drag still works for a mouse.
  - [x] **Learner, course and plan cards are real anchors now** (`aa89ad0`,
        `7e47335`). The title is a genuine `<a href>` (announced as a link,
        Tab-focusable, middle-clickable); the card click stays a mouse
        convenience. That closes the `role="link"` card pattern across the
        guide console.
  - [x] **Contrast is verified and enforced.** 410 pairs measured across every
        accent, every background wash, both themes: button labels, accent text,
        soft surfaces, body and muted text. 77 failed. Fixed by softening the
        decorative washes to 65% and nudging five light accents, because
        decoration carries no meaning and an accent palette does. Now 0 failing
        with headroom, locked by a test that fails the build on a regression.
        Nothing was dropped: all 8 accents and all 12 backgrounds survived.
  - [x] **Reading font and line spacing controls**, beside reading size. System
        faces only, so nothing downloads and choosing one sends nothing
        anywhere. Maths and code keep their own font, because changing those
        changes what they mean.
  - [x] **Captions on uploaded video (and audio).** A guide uploads or types a
        WebVTT track (free, always available), or auto-generates one on kie.ai
        (ElevenLabs Scribe, elevenlabs/speech-to-text) using the same key and
        credits as image and video generation. Auto is a job (upload the file to
        kie's temporary store, transcribe, build cues from the word timings),
        gated on a configured kie key and a size ceiling, and it fails soft, so
        it never blocks a request. The track lives on the upload, so it follows
        the file to every place it plays (lesson, win cutscene, trailer). Served
        at /media/:id/captions.vtt with the same public/family visibility as the
        file; the player shows a CC button only when a track exists.
  - [x] **Form labels are tied to their controls.** Found while testing the
        assessments dialog, after this list was called clear: the shared
        `Field` rendered a `<label>` with no `htmlFor`, so every form in the
        app named its inputs only by their placeholder, which a screen reader
        reads as an example rather than a name, and clicking a label did
        nothing. `Field` now gives a single native control an id, points the
        label at it, and links the hint as its description. One component, so
        every form in the app picked it up at once.
- [x] **Per-state compliance pack.** All three things states ask for now exist:
      days of instruction (`ceca483`), a portfolio (`18f453b`) and assessments.
  - [x] **Days of instruction.** Derived from the work, because a day a learner
        answered something, finished a lesson or handed work in is a day of
        school. Migration 025 stores only the guide's decisions on top: a day
        they claim that the app never saw (a museum, a co-op class) and a day
        they strike that it counted. Storing only the overrides means the log
        cannot drift away from the record. Every claimed day carries what backs
        it, and the CSV export leaves excluded days out entirely: it is the
        claim, not the working.
  - [x] **Portfolio.** A read-only, unsaved assembly of a period: days, the
        coursework, the work samples with the guide's returned feedback, and the
        badges earned. Printable. It saves nothing, so it cannot go stale.
  - [x] **Assessments.** A standardised-test result or a teacher's written
        evaluation is a record a family gets from somewhere else, so the guide
        copies in what the report said: the date, who gave it, the grade at the
        time, a score per area as the report wrote it (a number, a stanine or
        "Above grade level" are all real answers, so it is text) with an
        optional percentile, and the evaluator's words. Migration 026; the
        panel sits under the day log and each result prints in the portfolio
        for the period it falls in. A percentile outside 1 to 99 and a date in
        the future are refused out loud rather than clamped, because a typo in
        a filed record should be caught, not smoothed over. Gated on a new
        `record_assessment` permission (a tutor may record their own student's
        result) and the same `loadLearner` gate as attendance.
  - **The same line, held again:** the app records a result and never judges
        one. There is no pass column and no threshold, because whether a score
        is enough is set by the law of one place and the facts of one family.
        A test asserts the normalizer's output carries only the report's fields
        and that no verdict word or state name appears in the logic.
  - **The line this feature must not cross:** the app does not know what any
        state requires. The requirement is a number the guide types in and a
        label they write, because homeschool law varies by state, changes, and
        turns on facts about a family that no app knows. A test fails the build
        if a state name or a default day count ever appears in the logic, so
        adding one has to be an argument somebody wins rather than a line
        somebody slips in.

## Then

- [x] **Socratic tutor chat** (`f40dddf`, `77bd719`). Per-learner strictness,
      full guide visibility of every conversation, and the safety model that
      matters: in hints and guided mode the answer is NEVER SENT to the model,
      so it cannot be talked into revealing one. Only full mode passes it
      through, and an unconfigured learner defaults to the strictest.
- [ ] **Try the tutor with a real learner and read the transcripts.** The
      prompt's tone is a judgement call. Whether it actually reads as patient
      to a frustrated child is not something a test can answer.
- [ ] **Review the self-harm pre-check regex.** It is deliberately narrow so
      that "this is killing me" and "i give up" pass through as ordinary
      frustration, which is asserted. That balance deserves a second opinion.
- [x] **Misconception detection across attempts** (`64478fc`). A guide-triggered
      pass over a learner's WRONG answers that names the habit behind them
      ("adds numerators and denominators straight across"), not just the count.
      The model sees only the missed questions as "asked X, chose Y, answer was
      Z" (ids resolved to text), is told to ground every pattern in them and to
      report no pattern when the misses are just slips, and its output crosses a
      normalizer. Below three usable misses it returns a note with no AI call.
      Family-scoped and honours `canSeeLearner`. NOT yet smoke-tested against a
      live model: the offline paths (normalizer, not-enough) are tested, the
      real analysis runs when a guide clicks "Spot patterns" on the Progress
      page. Read one before trusting the tone, the way the tutor prompt wants.
- [x] **Timestamped video comprehension** (`e2ff3ea`). A video question can now
      carry `atSec`, the moment its answer is given. Miss it and the player
      moves the play head back to ten seconds before that, with a "Watch from
      2:05" button beside the verdict. The transcript comes from the caption
      track already on the upload, so no new provider and no scraping: only an
      uploaded video can be drafted from or scrubbed, because an embedded
      YouTube or Vimeo player is another origin. `lib/videoqa.js` parses the
      VTT, groups and caps the transcript, and normalizes the model's output
      into the SAME question shape the course generator makes, so a drafted
      question is an ordinary one everywhere downstream; the answer comes from
      answerIndex rather than any field the model set, and an anchor past the
      end is clamped rather than scrubbing a learner into blackness. Guide
      triggered (`POST /api/courses/items/:id/video-questions`, gated on
      `edit_course`), and it fills the editor rather than the item: the guide
      keeps, edits or deletes each question and saves. Not smoke-tested with a
      live model yet. The video edit dialog grew a real question editor along
      the way, which closes an older gap: video questions existed in the data
      and the player but could not be edited anywhere.
- [x] **Essay and project grading** against a rubric (`e71bc26`). A project item
      was a brief a learner read and nothing more. Now they write their work in
      the lesson player, keep it as a draft as long as they like, and hand it
      in, which freezes it; the guide reads it in a Submitted Work console,
      asks for a drafted response if they want one, and sends back their own
      words. The AI drafts, a person decides: the draft lands in `ai_feedback`,
      which no learner route selects, only guide-written `feedback` crosses
      back, there is no auto-grade path, and the outcome is a word (not yet,
      nearly, met, exceptional) that a person picks rather than a score a model
      computed. The criteria are pinned to the rubric the guide actually wrote,
      so the model cannot grade against one it invented. Gated on
      `requirePerm("grade")` and `canSeeLearner`. Migration 024, pure logic in
      `lib/rubric.js`, invariants asserted from source in `routes/work.test.js`.
      A handed-in project now counts toward lesson completion too: before this,
      a lesson ending in a project could never be finished. Not smoke-tested
      with a live model yet: the SQL ran against a scratch database, the
      offline paths are tested, and the drafting pass runs when a guide clicks
      "Draft feedback". Read one before trusting the tone.
- [x] **Reading-level rewriting** (`9aa612e`). In the article editor a guide
      picks a level (simpler, grade 3/5/8, advanced) and drafts a rewrite
      (`POST /api/courses/rewrite`): the same lesson for a different reader, with
      every fact, step, the markdown and the `$math$` kept and only the sentences
      and vocabulary changed. It is a draft that fills the editor; the guide
      reviews and Saves, or Cancels to keep the original. Nothing auto-applied.
      This is the on-demand-tool version; keeping three levels live at once per
      learner would need storage and is a follow-up. Not smoke-tested with a
      live model yet.
- [x] **Boss fight mechanics** (`a53ff00`). A boss or miniboss encounter is no
      longer cleared by a click: the learner answers a streak of the course's own
      questions correctly in a row (5 for a boss, 3 for a miniboss, tunable per
      encounter), each against a per-question clock, with no hints. A miss (wrong,
      or out of time) resets the streak but never ends the run, so it stays
      practice, not a wall. On the win the cutscene plays and the existing payout
      (XP, loot, real rewards) fires. The run is server-authoritative end to end:
      which questions and their order, the grading, and the clock all live on the
      server (`encounter_progress.boss_run`, migration 023), so a client cannot
      grade itself, pick easy questions, or post its way past the fight (the plain
      resolve route now refuses `won` on a boss). Decision logic is pure and
      tested (`quest.bossRules/bossStep/bossQuestionId`); the fight arena is
      `BossFight` in WorldView. The pool cycles when a course has fewer questions
      than the streak needs, and boss answers count as real practice (they feed
      attempts, spaced review, badges and XP). Not smoke-tested against a live DB
      yet: the pure paths are tested, the wiring runs after deploy.
- [x] **AI art per character and chapter.** One guide click in the World
      builder now illustrates the whole world: the encounters (as before), a
      cover for every chapter, and a portrait for every approved crew member.
      Chapter covers need no new AI writing (the chapter already carries its
      title and hook, the world its setting), portraits are built from what
      the character row itself says, and the art lands where the views already
      read from: `world.chapters[i].artUrl` and
      `adventure_characters.portrait_url`. All of it is the existing paid-path
      discipline: one confirmed count before anything is spent, never
      redrawing what already has art, a per-run cap, fail-soft per image, and
      unapproved learner inventions are never drawn (a guide may still remove
      them). The art route also carries `spend_media` now, like every other
      paid route: an assistant could trigger it before.
- [x] **Photo to worksheet (OCR into the existing import pipeline).** Snap a
      printed worksheet with a phone, the vision model reads it to text, the
      guide corrects it, then the same worksheet pipeline turns it into graded
      exercises. Same trust boundary, no new OCR vendor, one optional env
      (`AI_VISION_MODEL`): without it the dialog stays paste-only, with it the
      photo button reads via `POST /api/courses/worksheet-ocr` (family-scoped,
      image allowlist, 12 MB cap) and the extracted text is edited before it is
      ever a job. `server/lib/ocr.js` + two routes in `courses.js`.
- [x] **Local models: wired.** `docker compose --profile local-ai up -d` brings
      Ollama alongside app + Postgres (`docker-compose.yml` profile `local-ai`).
      Point `AI_BASE_URL=http://ollama:11434/v1` + pull `llama3.1` for normal
      AI, `llava` + `AI_VISION_MODEL=llava` for photo to worksheet. Worked
      since before this session; docs now spell it out in README and
      `.env.example`. "Runs entirely on your own hardware" is true today.
- [ ] **Uploaded video at scale**: object storage, transcoding, quotas. Only
      once hosting revenue exists.
- [x] **Webcam recording** for a guide's two-minute explainer: `RecordButton`
      (`web/src/components/RecordButton.tsx`) in the Videos panel on the course
      page. Browser MediaRecorder (webm/mp4, whatever the browser supports),
      2 minute cap, live preview with timer, then upload through the same
      `POST /api/uploads` path so quotas and streaming just work. No new server
      endpoint, no new dependency. Needs https or localhost + camera permission;
      falls back to file upload when blocked.

## Launch readiness

The single biggest lever is a **public demo instance**, which course sharing
now makes possible. Everything else here is cheap by comparison.

- [x] **Seeded public demo: LIVE and verified 2026-09-12.** DEMO_MODE and
      DEMO_SINGLE_FAMILY are set on the instance, one click on Try the demo
      signs a visitor into the shared Demo Family with the Keep this banner,
      and the gallery seeds all five example courses (`70a802c`; found and
      fixed live: .dockerignore had kept the seed packages out of the image
      entirely, and the shared family never re-seeded, so every demo visitor
      until then landed in an empty console). NOT reset nightly: retention
      converts to cloud, not a wipe.
- [x] **README first screen: SHIPPED 2026-09-11.** One sentence hero plus demo CTA and `og.svg` preview at the top. Install command sits right below.
- [x] **Screenshots and OG: SHIPPED.** `web/public/og.svg` (1200 by 630) referenced in `web/index.html` and README.
- [x] **FUNDING: SHIPPED.** `.github/FUNDING.yml` with `github: wellofwisdom` live from day one; Ko-fi and custom are commented until you add real handles. `SECURITY.md` shipped; `CHANGELOG.md` editorial and the git log serves for now.
- [x] **Good first issues: SHIPPED 2026-09-11.** Checklist at `.github/ISSUE_TEMPLATE/good-first-issue-checklist.md` lists a dozen genuine code issues. File each as a real GitHub issue with the `good first issue` label when you open them.
- [x] **v0.1.0 tagged: SHIPPED 2026-09-11.** `v0.1.0` points at the marketing plus demo plus Google commit and is pushed. Docker publish waits on a token with `workflow` scope: see commit `829ff7e` and the release workflow that was held back for that reason.
- [ ] Verify the one-command install on a clean box. It is claimed; make it true.
- [ ] Launch in one window: Show HN, r/selfhosted, r/homeschool,
      awesome-selfhosted, Lobsters, with the demo live.

## 🚀 Public demo + marketing site (NEW: 2026-09-11)

Confirmed NOT in HANDOFF.md: none of these ship yet. This is the whole public
face that turns a working app into a trending launch. Ordered sodemo-seed
can be tested independently of the marketing copy, and the copy can be iterated
without touching the database.

### Demo that sells cloud

The demo is the top of the cloud funnel, not a throwaway. A visitor has to
leave it *wanting to keep* what they built, which is exactly what a cloud
subscription lets them do. Architecture is in `docs/ARCHITECTURE.md`: self-host
and cloud share one image and one feature set; only plumbing differs.

- [x] **Frictionless demo login: SHIPPED.** `POST /api/demo/login` creates an
      ephemeral demo family (or reuses a single shared family when
      `DEMO_SINGLE_FAMILY` is set), signs the visitor in immediately, and lands
      them in the guide console. Rate limited, no email ever asked. Enabled with
      `DEMO_MODE=true`. Uses the real normalizers so seeded courses cannot drift
      from what the app stores.
- [x] **Google sign in for guides: SHIPPED 2026-09-11.** `GOOGLE_CLIENT_ID` in env, `GET /api/auth/config` carries it, `POST /api/auth/google` verifies the credential via `https://oauth2.googleapis.com/tokeninfo` (aud, expiry, email_verified) and either signs in an existing parent (by google_sub or email, linking on first use) or creates a new family + owner in one tap. Logged-out page shows "Continue with Google" above the email forms plus a One Tap nudge when enabled; nothing shows when the env is empty. Migration 028 adds `users.google_sub`.
- [x] **Demo seed that shows the best: SHIPPED 2026-09-11.** Four publish-ready courses in `docs/examples`: Comparing Fractions, Fractions Through Sewing (the lens-only course only this app would make), Photosynthesis Through Cooking, and Your Horoscope Is Not Science. Each is small, fully keyed, and passes `lib/coursecheck` with an open licence so the demo gallery is never empty.
- [x] **Demo retention plus Keep this upgrade that sells cloud: SHIPPED 2026-09-11.**
      No nightly wipe: the demo family is the cloud lead. Migration 029 adds
      `families.is_demo` and `demo_created_at`, and `server/routes/demo.js`
      marks families on creation and now exposes `GET /api/demo/me` and
      `POST /api/demo/upgrade` (email plus password or Google credential, rate
      limited, flips `is_demo` to false). The Keep this. Make it mine banner
      lives in `web/src/components/DemoBanner.tsx` and is mounted by
      `web/src/components/Shell.tsx` so every guide page inherits it. Styles in
      `web/src/styles.css` as `.demobanner`, OG fallback at `web/public/og.svg`.
      Self-hosters leave `DEMO_MODE` off; managed hosting links it to real billing.
- [x] **Managed hosting CTA + waitlist.** The pricing cards on the landing
      now have a real waitlist form (`POST /api/waitlist` public, throttle +
      lower(email) dedupe, `GET /count` for an honest count). Guide export at
      `GET /api/waitlist?format=csv`, migration `030_waitlist.sql`. The same
      CTA lives in the demo's Keep this banner path when ready (Stripe later).
      Two cloud tiers match the plan in "Paying for it".

### Marketing site (the logged-out Landing)

This replaces the three-tile placeholder that is there now. Every section is
1 to 2 lines per block, card and tile layouts, never a paragraph wall (per
`AGENTS.md`). Keywords are in the headings, not hidden in metadata.

- [x] **Hero with real proof: SHIPPED.** One sentence, a live proof tile for the Studio, the install command, and Try the demo. Every claim has a button.
- [x] **Comparison table: SHIPPED.** Khan vs Moodle vs Kolibri vs Well of Wisdom, 12 rows, tick/cross, on the page buyers scan.
- [x] **Lens catalog: SHIPPED.** Sewing, Minecraft, skateboarding, baking, horses, space, dinosaurs, basketball tiles, each with one real exercise.
- [x] **How it works in 4 steps: SHIPPED.** Topic, lens, sources, review, with the trust boundary spelled out.
- [x] **Features grid: SHIPPED.** Course Studio, Spaced review, World, Tutor, Attendance plus portfolio, offline AI, self-host in one command.
- [x] **Open source strip: SHIPPED.** License, GitHub link, privacy copy ("your server, your data"), self-host vs managed hosting explainer (AGPL-clean).
- [x] **Social proof strip.** Two pilot-family quotes + AGPL/open-source + "your
      data stays yours" tiles. Honest placeholders until post-launch real counts
      (courses generated, GitHub stars) replace them. Better true than fabricated.
- [x] **FAQ answering purchase anxiety: SHIPPED.** AI key, child data, state filing, offline, demo, and license, 1 to 2 sentences each.
- [x] **Repeated CTA: SHIPPED.** Try the demo appears hero, mid-page, and footer, never more than one screen without a way in.

### SEO and distribution

Per `AGENTS.md`, this site IS a marketing site, so short structured sections
plus lists and tables, never a wall. SEO is the heading and the tiles, not a
hidden blob.

- [x] **Document head: SHIPPED.** Title, description, canonical, Open Graph and Twitter card, favicon, one H1: Self-hosted, AI-first learning for homeschools.
- [x] **Structured data: SHIPPED.** JSON-LD SoftwareApplication on the landing, Course JSON-LD on /c/<slug> via `server/lib/seo.js`.
- [x] **Plain-text and llms.txt: SHIPPED.** `/llms.txt` plus /c/<slug>.txt and /api/public, discoverable for tools. Served from `server/index.js` via `seo.llmsTxt`.
- [x] **Sitemap and robots: SHIPPED.** Marketing pages indexed, private app routes out, via `server/lib/seo.js`.
- [x] **Keyword plan (in copy, not a dump): SHIPPED.** Headings a buyer actually types: homeschool curriculum generator, AI course creator, self hosted LMS, Khan Academy alternative, spaced repetition for kids, homeschool attendance tracker, printable homeschool portfolio.
- [x] **Performance and accessibility proofs (measured 2026-09-12, commit
      `f78dc41`).** Lighthouse on the live site, desktop and mobile, on BOTH
      the logged-out landing and the logged-in guide console: accessibility
      100, SEO 100, best practices 100. The first run caught three real
      failures and they were fixed in the same commit: the skip link pointed
      at a `#main` that only the public course page ever rendered (the
      console, the learner home and the landing all get a real main landmark
      now), the Settings caret was a 14px nested button-in-button (the whole
      Settings button toggles now, with `aria-expanded`), and llms.txt listed
      bare URLs instead of markdown links. Also verified by hand: one H1 per
      page, heading order never skips a level, every image has alt, and the
      keyboard path starts with the skip link then the marketing nav. Cold
      load: LCP 1.3s, CLS 0.05 desktop / 0.048 mobile, both inside the good
      thresholds. One known, accepted wart: on desktop, a visitor with no
      Google session gets a harmless "Not signed in with the identity
      provider" console line from Google's own Identity Services library when
      One Tap initializes; silencing it would mean dropping One Tap, and it
      does not appear on mobile (One Tap is large-screen only) or for signed
      in visitors.

## Paying for it

Ordered by when it becomes worth doing, not by size.

- [ ] **GitHub Sponsors + Ko-fi or Open Collective**, now. Sponsors is right for
      developers; homeschool parents will not use it, and Ko-fi is legible to
      them. `FUNDING.yml` costs nothing.
- [x] **Hosted-tier waitlist.** Live form on the pricing card + public
      `POST /api/waitlist` + `GET /waitlist?format=csv` for the guide.
- [ ] **Managed hosting**, once a co-op asks unprompted more than once. This is
      the actual business, and it is AGPL-clean: people pay for convenience,
      not for the code. Two tiers: bring your own AI key, or included
      generation up to an explicit cap. Spend is already tracked per family, so
      the cap can be shown honestly.
- [ ] **Co-op and school licences.** One invoice, thirty families, a
      decision-maker used to buying things. Where the real money is.
- [ ] **Grants.** NLnet funds exactly this shape of project. Worth an afternoon.
- [ ] **Premium curriculum packs**, sold by us, with community sharing staying
      free. Do not build a marketplace: it fights the CC-BY ethos and needs
      volume that does not exist yet.
- [ ] Patreon: skip, unless recurring *content* ships. It suits creators with an
      ongoing publication, not a software project, and an empty page costs more
      credibility than the money is worth.

## Positioning against Khan Academy

Not "better than Khan". Khan has twenty years of hand-built content, real
pedagogical research, and a brand every parent trusts. Compete where it
structurally cannot:

1. It is about *your* child. Khan teaches fractions one way to everyone.
2. You own it. Your server, your database, no ads, no engagement metrics.
3. The guide is in the loop: every course is editable before a child sees it.
4. Paperwork. Khan does not help with state reporting. We can.
5. Any subject at all: a co-op's local river-ecology unit, a farm curriculum,
   Latin. Khan will never build those.
