# Changelog

What changed, newest first, grouped by the day it landed. Plain language on
purpose: a family running this should be able to read it.

Entries before `v0.1.0` are the build-up to the first tag. The repo is 153
commits and about two weeks old, so the first tag covers all of it.

## v0.1.0 (tag pending)

The first release heading. When the tag goes up, this becomes the section for
it. Everything below this line is what is in it.

### 13 September 2026

- Security: a Content-Security-Policy with a per-request nonce, so injected
  script has nothing to run under. Google sign-in is allowed through by name.
  KaTeX inline styles still work.
- Security: `TRUST_PROXY` replaces the old blanket trust of `X-Forwarded-For`.
  The default is one hop, so a self-hoster exposing port 3000 directly can no
  longer have their login limiter spoofed off.
- Security: `CLIENT_IP_HEADER=cf-connecting-ip` reads the client address from
  Cloudflare when the site sits behind it.
- Every response carries an `x-request-id`, and the error handler logs the
  stack outside production, so a bug report can quote one line.
- JSON bodies get a 25 MB limit on the four routes where people paste a course
  or a worksheet, and stay at 2 MB everywhere else.
- The login limiter now evicts the oldest address instead of clearing every
  counter at once.
- Unknown console paths get a real "that page does not exist" page with a link
  home, instead of a blank shell.
- `docs/OPERATIONS.md`: deploy checks, scratch database testing, backups and
  DNS, written down in the repo with no secrets in it.
- The public demo seeds every page with real work, and backfills demo families
  that were already created.
- The learner home gained a weeklies board, the path nodes show a mastery star,
  and the companion line landed with a state bug fixed.
- Docs: a full codebase review and growth plan, and one work packet per
  parallel Well.

### 12 September 2026

- The learner side became a game. A full screen shell with a HUD, a course path
  drawn as a map, and a world map as an SVG journey.
- A narrator voice on kie.ai (Gemini TTS) with a server-side cache, so a scene
  is paid for once. Chapter music loops come from Suno on the same key.
- A dailies board with a stamina bar, a quest log, scene transitions, a
  collection gallery and mastery stars.
- A photo finish animation when a lesson is completed.
- The AI vault in Settings: provider, models, vision model, kie key, voice and
  music switches, spending limits, and a spend chart. Backed by a unified
  settings store and real usage accounting.
- The community library lives in the app, so a teacher never needs GitHub to
  find a course.
- Waitlist panel in Settings, and a Gemini provider alongside the others.
- Claude (Anthropic) support through the same AI layer.
- Guide explainers recorded from the webcam, and local AI documented as the
  zero-cost path.
- Photo to worksheet: snap a page with a phone and AI vision reads it to text
  you can correct.
- Lighthouse findings fixed and the measured numbers written into the roadmap.
- Curriculum: the IP curriculum plan, plus 12 courses with matching adventure
  worlds (Wonderland, Holmes, Willows, Oz, Pooh, Grimm, Neverland, Treasure
  Island, Around the World in 80 Days, Frankenstein, Musketeers, Journey to
  the Center of the Earth).

### 11 September 2026

- The marketing site is now the logged-out page, with Google sign-up as the
  main button and a rebuilt footer.
- Demo funnel that keeps the visitor, and a Google upgrade path out of the
  demo.
- Accessibility: tab panels announce themselves, focus lands in the right
  place, and the learner sees a real empty state when a course has no lessons.
- Open Graph image has a PNG twin, so unfurlers show a picture.

### 10 September 2026

- Community courses: a validator, a documented format, and a worked example to
  copy. Importing checks the file before anything is stored.
- A question with no answer key is now refused at publish time, and the
  generator is never allowed to invent one.
- Pasted links cannot reach inside the network or redirect there.
- Inequalities survive the number normalizer, which they did not before, and
  item edits cross the same boundary.
- Assessments are recorded as the report gave them, with no verdict attached.
- Attendance: days of instruction counted from the work that was already there,
  with guide overrides on top.
- A portfolio page per learner, and a printed page that is actually styled.
- Video questions that know where in the video the answer is, and a "rewind to
  the answer" control.
- Project grading: a learner hands work in, the AI drafts feedback, a person
  writes the real answer and sends it back.
- Form labels that name their inputs.
- A dozen good first issues, and roadmap ticks for everything shipped.

### 7 September 2026

- Fix: "View as learner" locked the guide console instead of previewing it.

### 4 September 2026

- The role model is enforced at every write route, not just declared.
- Per-learner scoping: a tutor sees one learner, not the whole family.
- Boss fights: a run of clean answers to get through a wall, with the question
  list, the order and the clock all held on the server.
- Reading-level rewrite: the same article aimed at a different reader.
- Misconception detection: name the pattern behind a run of wrong answers.
- Video from Vimeo, PeerTube or a direct file, not only YouTube, and an
  uploaded video can carry captions.
- A keyboard path for the library board, and real links on learner and course
  cards instead of divs pretending.
- Plain-text course view, plus a button that copies every source link.
- Auto captions come from kie.ai (ElevenLabs Scribe).
- Contributor files: a security policy, issue templates and a pull request
  template.

### 3 September 2026

- Captions: upload or type a `.vtt`, or let the server transcribe.
- Contrast: 410 colour pairs measured, 77 failures fixed, and a test that keeps
  them fixed.
- A reading font and line spacing, plus an honest accessibility scorecard.
- Maths that can be heard by a screen reader, and verdicts that are announced.

### 1 September 2026

- More than one grown-up per family: invite someone, give them a role, and
  scope an assistant to named learners.
- "View as learner", and a separate answer key view for the guide.
- The Socratic tutor withholds the answer structurally, not by instruction, so
  a clever prompt cannot talk it into telling.
- Tutor UI in the lesson, with every word readable by the guide.
- Loot picker, and one picture per encounter.
- YouTube ids are checked before a learner meets a dead embed.
- Scrolling reads as distance covered, so a world feels like a journey.

### 31 August 2026

- The world system: game types, encounters, characters, loot, inventory, and
  real-life rewards a guide confirms by hand.
- World builder, so a guide can actually fill a world, and AI prose for every
  encounter in it.
- Video uploads, for NotebookLM exports, course trailers and lesson videos.
- Course sharing: public course pages, portable packages, and import by URL.
- Learner email: their own weekly note, and reminders for their events.
- Gamification completion: streaks, badges and character portraits.
- Real URLs instead of hash routes, and browser autofill stopped from typing a
  learner's username into the wrong box.
- The no-em-dash rule became self-enforcing in `npm run check`, after every em
  dash in the app was rewritten rather than substituted.

### 30 August 2026

The first day. Repo skeleton, AGPL-3.0 licence, one-command Docker install, and
the AI routing layer.

- App shell: accounts, database, parent console and learner space.
- AI Course Studio: topic plus a lens in, a full course out. Lesson player,
  exercises, and "why was I wrong".
- Spaced review on a 1, 3, 7 day ladder, mistakes back the same day, and a real
  progress page.
- Learning paths for a semester or a year, with an AI plan assistant and
  no-AI templates.
- Workspace: a free-form Notion-style layer. Resource library with four views.
- Email integrations: Resend, SparkPost, Amazon SES or your own SMTP.
- Calendar events with reminder emails.
- Quarterly reports from real work, with an AI narrative a guide can edit and
  a printable page.
- Worksheet import, course export and import, and the launch-ready README.
- Lesson articles read aloud, printable worksheets, and next-lesson navigation.
- AI usage accounting with a cost estimate, and an invite gate for public
  instances.
- Learner profiles with interests, AI notes and an optional email.
- Gamification and AI media through kie.ai images and videos.
- Architecture and design docs in the repo, written for the next maintainer.
