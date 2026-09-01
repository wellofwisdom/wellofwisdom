<div align="center">

# 🌰 Well of Wisdom

**Self-hosted, AI-first learning: a free, open-source platform for homeschools, classrooms, co-ops, and self-learners.**

Plan a whole year. Generate courses through what you love. Remember everything.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/wellofwisdom/wellofwisdom/actions/workflows/ci.yml/badge.svg)](https://github.com/wellofwisdom/wellofwisdom/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why

In Irish mythology, nine hazel trees grow over the Well of Wisdom. Their nuts drop
into the water, and the Salmon of Knowledge eats them. One nut for each of the
worlds. The point of the myth: **wisdom doesn't come one way. It comes in many flavors.**

Khan Academy changed education, and it's free. But it's a walled garden: you can't
create your own courses, content gets retired, review isn't scheduled by memory
science, and your family's data lives on someone else's servers.

**Well of Wisdom is the alternative you own.**

## What it does

### 🧭 Learning paths: plan a whole semester or year
An AI assistant walks you through designing the arc (subject, goals, timeframe,
learners), then drafts the milestone sequence for your review. Or start from a
**built-in template**: Algebra 1, US History, Biology, Intro to Python, Creative
Writing, with **no AI key needed at all**. Each learner gets their own lens and
instructions on the same path.

### ✨ AI Course Studio: courses through what they love
Describe a topic, pick a lens, and get a full course (units, lessons, exercises,
projects) in about a minute. *"Fractions through sewing." "Physics through
skateboarding."* Ground it in your own sources (pasted text or links). Every
remembered note about a learner is applied automatically. You review and edit
every word before anyone sees it.

### 📝 Worksheets in, courses out
Paste any worksheet's text. The AI turns each question into a graded exercise
with an explanation and a hint. Paper curriculum becomes interactive.

### 🧠 Lessons that actually teach
Articles with real math (KaTeX), multiple choice, numeric answers that understand
`5/8` and `1 3/4`, written self-checks, YouTube videos with questions, hands-on
projects. Hints that nudge without telling. **"Why was I wrong?"**, an AI that
walks from the learner's mistake to the right idea. Read-aloud on every article.
Printable worksheets for screen-free days.

### 🔁 Spaced review: the memory-science advantage
Every graded exercise feeds a spaced-repetition scheduler (1 → 3 → 7 days, then
longer; mistakes return today). Learners get a "practice due now" queue across
all their courses. Most platforms don't do this at all.

### 📈 Progress that's real, reports that print
Live dashboards per learner (lessons, accuracy, active days). **Quarterly
reports** generated from real work: stats, per-course breakdown, an AI-written
narrative you can edit, printable with signature lines for any authority that
asks.

### 🗓️ Calendar & notifications
Events (sessions, deadlines, field trips, exams) merged with milestone target
dates on one month grid. **Weekly email digests** (each learner's week at a
glance) and **tomorrow-reminder emails**: via Resend, SparkPost, Amazon SES, or
your own SMTP, configured from the UI.

### 📚 A workspace, not a walled garden
A Notion-style free-form layer (nested pages, slash blocks, callouts, math) and
a resource library with four views (table, drag-and-drop board, calendar,
gallery). Export any course as a portable file; import courses from any other
instance: sharing between families needs no platform at all.

### 🔒 Yours
Self-hosted in one Docker command. Works with any OpenAI-compatible AI
including **fully local Ollama**, so nothing ever leaves your server.
AGPL-3.0. No accounts on our servers, no tracking, no ads.

## Quick start

```bash
git clone https://github.com/wellofwisdom/wellofwisdom.git
cd wellofwisdom
docker compose up -d
```

Open `http://localhost:3000`. That's it: app plus database, one command.

**Fully offline AI** (no cloud, no API keys):

```bash
docker compose --profile local-ai up -d
docker compose exec ollama ollama pull llama3.1
# then in .env:  AI_BASE_URL=http://ollama:11434/v1
```

Or point `AI_BASE_URL` at any OpenAI-compatible provider (DeepSeek, OpenAI, LM
Studio, …). See [`.env.example`](.env.example). No AI key? Templates, lessons,
review, progress, reports, calendar, and email all still work.

## How it compares

| | Khan Academy | Moodle | Kolibri | **Well of Wisdom** |
|---|---|---|---|---|
| Self-hostable | ❌ | ✅ | ✅ | ✅ |
| AI course creation | ❌ | ❌ | ❌ | ✅ |
| Learn through your interests | ❌ | ❌ | ❌ | ✅ |
| Works with no AI key | ✅ | ✅ | ✅ | ✅ |
| Spaced review built in | ❌ | plugin | ❌ | ✅ |
| Kid-safe AI tutor | paid add-on | ❌ | ❌ | ✅ |
| Year-long curriculum planning | ❌ | manual | ❌ | ✅ |
| Printable progress reports | ❌ | ✅ | ❌ | ✅ |
| Email digests & reminders | ❌ | ✅ | ❌ | ✅ |
| Course portability (export/import) | ❌ | ✅ | ❌ | ✅ |
| Works with fully local AI | ❌ | ❌ | n/a | ✅ |
| License | content CC BY-NC-SA | GPL-3.0 | MIT | **AGPL-3.0** |

## Roadmap

- [x] Foundation: auth, families, learners, Docker, AI routing
- [x] AI Course Studio + lesson player + explain-my-mistake
- [x] Spaced review + real progress tracking
- [x] Learning paths (AI + no-AI templates), per-learner lenses
- [x] Calendar, email digests, reminder emails
- [x] Quarterly reports (AI narrative, printable)
- [x] Worksheet import + course export/import
- [x] Workspace (Notion-style) + resource library (4 views)
- [ ] Essay/project grading with rubrics
- [ ] Photo → worksheet (camera capture + OCR)
- [ ] Audio overviews (podcast-style unit summaries)
- [ ] Community template gallery (contributed curricula)
- [ ] Co-op mode: multiple guides, shared learners

Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Contributing

We'd love your help, especially guides (parents, teachers, tutors) and
developers. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup (Node 20,
`npm install`, `npm test`). Adding a curriculum template is one JSON file.
Be kind; read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License & name

Code is licensed under the **GNU AGPL-3.0** ([LICENSE](LICENSE)): free for any
family, school, or co-op to run, forever. The name **"Well of Wisdom"** and the
project logo are reserved by the project: forks that diverge meaningfully
should rebrand, so the name always means the same thing to learners.
