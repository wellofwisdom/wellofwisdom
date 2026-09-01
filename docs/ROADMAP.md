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
- [x] **House style enforced** (`900363c`, `d6bfb7a`). No em dashes anywhere in
      our own source; `npm run check` fails on any dash character.

## Now

- [ ] **Publish four or five genuinely good courses** from this instance,
      including one only this app would ever produce. Sharing is not real until
      something is shared.
- [ ] **Plain-text course view** at `/c/<slug>.txt`. No chrome, no markup. The
      highest-signal thing to hand a research tool, and it costs one route.
- [ ] **Copy source links** button on a public course: page URL, text URL and
      export URL on the clipboard, ready to paste into a notebook's sources.
- [ ] **`community-courses` git repository.** Courses are plain JSON and the
      importer already validates them, so: one directory per course, CI runs
      the normalizer on every PR, contributors submit a PR, any instance
      imports from a raw URL. This is what makes the project grow with the
      content rather than with the code, and a fork inherits all of it.
- [x] **World UI** (`48c9ced`, `69c7156`). The learner's world view: chapters as
      a journey, encounter cards that are locked, open or won, loot, crew and
      real rewards. The guide's builder on the course page: pick a game type,
      build the encounters, attach a win video, make loot, set up and grant real
      rewards, approve learner-invented characters.
- [x] **Encounter prose** (`2884e8a`). AI writes a beat for every encounter,
      set in the world, gesturing at the real skill without naming the subject.
      Runs as a job, fails soft per chapter.
- [ ] **Encounter art.** The illustrator line is already stored on each
      encounter by the prose pass. This is a job that feeds it to the image
      generator and hangs the result on the card, which is what will make the
      world look like a world rather than read like one.
- [x] **Loot on encounters from the UI** (`ac779b6`). Chips to remove, dropdown
      to add, hidden entirely when the family has no loot yet.

## Next

- [ ] **YouTube ids must be validated** against the oEmbed endpoint before they
      are saved. The generator is told to only use ids it is certain of, which
      is not a guarantee: a model will produce a plausible eleven-character
      string that points at nothing. One request, no API key.
- [ ] **Paste-a-link video** for guides, alongside the AI's own choices.
- [ ] **Vimeo and PeerTube** through the same oEmbed path. PeerTube matters to
      the self-hosting audience.
- [ ] **Direct file URL** video (MP4/WebM on someone's own server).
- [ ] **Multiple guides per family.** Two parents. The most common complaint
      this will get, and nearly free.
- [ ] **Roles:** owner (billing, delete), guide (full teaching), assistant
      (assigned learners only), observer (read-only, for a grandparent or an
      evaluator).
- [ ] **Per-learner scoping.** A hired tutor sees one student, not the family.
      This is what makes the app something you can pay a tutor to use.
- [ ] **Invite links with expiry**, rather than a join code that never rotates.
- [ ] **Accessibility, measured not guessed.** Current state: 154 aria
      attributes, 47 roles, focus-visible, reduced-motion, `lang="en"`, a skip
      link and a `prefers-contrast` block. The gaps, worst first:
  - [ ] Alt text on AI-generated art. There are two `alt` attributes in the
        whole frontend. The generator already knows the prompt it used.
  - [ ] Maths is unreadable to a screen reader. KaTeX renders visually; without
        a plain-language `aria-label` a blind learner gets nothing.
  - [ ] Grading feedback is not announced. It needs a live region.
  - [ ] The modal does not trap focus or close on Escape.
  - [ ] The drag-and-drop library board has no keyboard path.
  - [ ] Learner cards are `div role="link"` rather than real anchors.
  - [ ] Contrast is unverified across 8 accents by 12 backgrounds. Some of
        those 96 combinations certainly fail. Check them and drop the failures.
  - [ ] A dyslexia-friendly font and a line-height control, beside the existing
        reading-size setting.
  - [ ] Captions, which become mandatory the moment uploads are common.
- [ ] **Per-state compliance pack.** Roughly half of US states require
      homeschool families to file attendance, portfolios or assessments. The
      reports, transcripts and calendar already exist. This is the sharpest
      wedge available, because it is a chore nobody enjoys and nobody serves.

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
- [ ] **Misconception detection across attempts.** Every attempt is already
      stored. A pass over them that says "she inverts the fraction whenever the
      denominators differ" is worth more to a parent than any single lesson,
      and nothing else on the market does it for a family of two.
- [ ] **Timestamped video comprehension.** Fetch the transcript, anchor the
      questions to timestamps, and have a wrong answer scrub the player back to
      the ten seconds that explain it. Khan has fixed videos with fixed
      questions; this watches any video with the learner.
- [ ] **Essay and project grading** against a rubric, drafted by AI, approved or
      rewritten by the guide. Never auto-applied.
- [ ] **Reading-level rewriting**: the same article at three levels, so
      siblings can share a course.
- [ ] **Boss fight mechanics**: a timed streak of correct answers with no hints,
      with the win cutscene playing on success.
- [ ] **AI art per character and chapter.** The image path works; this is
      mostly wiring.
- [ ] **Photo to worksheet** (OCR into the existing import pipeline).
- [ ] **Local models.** The Ollama profile exists. "Runs entirely on your own
      hardware, nothing leaves the house" is a headline feature for the overlap
      between self-hosters and homeschoolers.
- [ ] **Uploaded video at scale**: object storage, transcoding, quotas. Only
      once hosting revenue exists.
- [ ] **Webcam recording** for a guide's two-minute explainer, after uploads.

## Launch readiness

The single biggest lever is a **public demo instance**, which course sharing
now makes possible. Everything else here is cheap by comparison.

- [ ] Seeded public demo, reset nightly.
- [ ] README first screen: one sentence, one screenshot or GIF, one install
      command. Everything else moves below.
- [ ] Screenshots of the Studio, a lesson, and a shared course page. Repo social
      preview set.
- [ ] Issue and PR templates, `SECURITY.md`, `CHANGELOG.md`, `FUNDING.yml`.
- [ ] A dozen genuine `good first issue` tickets. Contributors need a door.
- [ ] Tagged releases and a published Docker image, so "try it" is one command.
- [ ] Verify the one-command install on a clean box. It is claimed; make it true.
- [ ] Launch in one window: Show HN, r/selfhosted, r/homeschool,
      awesome-selfhosted, Lobsters, with the demo live.

## Paying for it

Ordered by when it becomes worth doing, not by size.

- [ ] **GitHub Sponsors + Ko-fi or Open Collective**, now. Sponsors is right for
      developers; homeschool parents will not use it, and Ko-fi is legible to
      them. `FUNDING.yml` costs nothing.
- [ ] **Hosted-tier waitlist**, now. A form is enough.
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
