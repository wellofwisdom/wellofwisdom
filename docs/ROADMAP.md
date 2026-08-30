# Roadmap

Status legend: ✅ shipped · 🚧 in progress · 📋 planned

## Phase 0 — Foundation ✅

- [x] Repo, AGPL-3.0 license, CI
- [x] Docker one-command self-host (app + Postgres, optional Ollama profile)
- [x] AI routing layer: any OpenAI-compatible endpoint, task tiers (pro/flash),
      env-overridable routes, graceful degradation
- [x] Health endpoint, placeholder landing page

## Phase 1 — Course Studio + lesson player 📋

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
- "Explain my mistake" — AI diagnosis after wrong answers
- Printable worksheet export
- Postgres schema: families, learners, courses, units, lessons, items, attempts

## Phase 2 — Socratic tutor + Lenses 📋

- Tutor chat with per-learner strictness (hints-only → full explanations)
- Full parent visibility of every conversation; guardrails on all learner chats
- **Lenses**: generate the same subject through a context the learner loves
  ("fractions through sewing," "physics through skateboarding")
- Learner profiles (age, level, interests) feeding all generators

## Phase 3 — Memory + progress 📋

- FSRS spaced-repetition scheduling for every skill ("review due today")
- Transparent mastery (BKT-based; learner and parent can always see the math)
- Progress: time by subject, portfolios (photos of real projects), summary
  reports, certificates, and transcripts where you need them
- AI weekly planner (constraints → schedule)
- Photo-worksheet import (OCR → draft exercises)
- Read-aloud (Piper/Kokoro) + dictation (Whisper)
- Essay/project grading: AI drafts rubric feedback, parent approves

## Phase 4 — Private beta 📋

- Two real teens + a teacher daily-driving it on actual schoolwork
- Weekly feedback loop; polish; export/import; backups
- Lens A/B acceptance test; guardrail red-teaming

## Phase 5 — Public launch 📋

- Hosted public demo instance
- Docs site; awesome-selfhosted submission
- Launch week (Show HN + r/selfhosted, concentrated in one window)
- Course-sharing library (CC-BY) — community publishes their lenses

## Later (research queue)

- **Audio overviews** (NotebookLM-style): AI-written two-voice podcast summary of
  any unit, read by local TTS (Piper/Kokoro) — car-schooling gold
- **Free content importers**: Wikipedia/Wikiversity (CC BY-SA), Project Gutenberg
  EPUBs (public-domain literature for ELA), OpenStax chapters (CC BY-NC-SA —
  free use only, never in paid packs)
- Code courses with sandboxed execution (Piston)
- Language learning: pronunciation scoring (GOP), conversation practice
- Offline/low-connectivity mode (Kolibri-inspired)
- Multi-language course generation
- Co-op / microschool mode (multiple families, one teacher)
- AP/SAT/ACT alignment layers on community courses
- Community course marketplace with fair revenue share for authors
