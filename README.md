<div align="center">

# 🌰 Well of Wisdom

**Self-hosted, AI-first learning — a free, open-source Khan Academy alternative.**

For homeschools, classrooms, co-ops, and self-learners. Generate full courses with AI — learn any subject through what you love.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/wellofwisdom/wellofwisdom/actions/workflows/ci.yml/badge.svg)](https://github.com/wellofwisdom/wellofwisdom/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why

In Irish mythology, nine hazel trees grow over the Well of Wisdom. Their nuts drop
into the water, and the Salmon of Knowledge eats them — one nut for each of the
worlds. The point of the myth: **wisdom doesn't come one way. It comes in many flavors.**

Khan Academy changed education, and it's free. But it's a walled garden:

- You **can't create your own courses** or exercises — the most-requested teacher feature, officially declined.
- **Content gets retired**, and your kids' progress disappears with it.
- Mastery levels **drop without warning**, review isn't scheduled by memory science, and the points can't buy anything.
- Your family's learning data lives on **someone else's servers**.

**Well of Wisdom is the answer for families who want more** — a platform you run
yourself, where AI builds the curriculum *for your specific learner*, and you own
everything.

## What it does

| | |
|---|---|
| 🧵 **Learn through what you love** | The same fractions through a sewing project, a Minecraft build, or a basketball season. One curriculum, many "lenses." |
| ✨ **AI Course Studio** | Describe a topic, level, and your learner's interests. Get a full course — units, lessons, explanations, exercises, quizzes, projects. Everything editable. Nothing reaches your kids unreviewed. |
| 🧠 **A tutor that doesn't cheat** | A Socratic AI tutor with strictness you control — from hints-only to full explanations. Every conversation visible to the parent. |
| 🔁 **Real memory science** | Spaced repetition (FSRS) schedules review. Mastery is transparent — no mystery downgrades. |
| 📚 **Homeschool records** | Attendance, hours by subject, portfolios, report cards, and transcripts that satisfy state requirements. |
| 🔒 **Private by design** | Self-hosted. Plug in any OpenAI-compatible AI — including fully local Ollama — and your family's data never leaves your server. |
| 🆓 **Free forever** | AGPL-3.0. No accounts on our servers. No tracking. No ads. Export everything, any time. |

## Quick start

```bash
git clone https://github.com/wellofwisdom/wellofwisdom.git
cd wellofwisdom
docker compose up -d
```

Open `http://localhost:3000`. That's it — app plus database, one command.

**Fully offline AI** (no cloud, no API keys):

```bash
docker compose --profile local-ai up -d
docker compose exec ollama ollama pull llama3.1
# then in .env:  AI_BASE_URL=http://ollama:11434/v1
```

Or point `AI_BASE_URL` at any OpenAI-compatible provider (DeepSeek, OpenAI, LM
Studio, …). See [`.env.example`](.env.example).

> ### ⚠️ Status: early development
> This repo is at the skeleton stage. The first alpha (Course Studio + lesson
> player + AI tutor) is under active construction. **Watch/star to follow along —
> or jump in, there are `good first issue`s.** Everything runs; there's just not
> much to learn yet.

## How it compares

| | Khan Academy | Moodle | Kolibri | **Well of Wisdom** |
|---|---|---|---|---|
| Self-hostable | ❌ | ✅ | ✅ | ✅ |
| AI course creation | ❌ | ❌ | ❌ | ✅ |
| Learn through your interests | ❌ | ❌ | ❌ | ✅ |
| Kid-safe AI tutor | paid add-on | ❌ | ❌ | ✅ |
| Spaced repetition | ❌ | plugin | ❌ | ✅ built in |
| Homeschool records & transcripts | ❌ | ❌ | ❌ | ✅ |
| Works with fully local AI | ❌ | ❌ | — | ✅ |
| License | content CC BY-NC-SA | GPL-3.0 | MIT | **AGPL-3.0** |

## Roadmap

- [x] **Phase 0** — repo, AGPL license, Docker one-command install, AI routing layer
- [ ] **Phase 1** — AI Course Studio + lesson player (exercises, math rendering)
- [ ] **Phase 2** — Socratic tutor + Lenses ("math through sewing")
- [ ] **Phase 3** — FSRS review, mastery, records, transcripts
- [ ] **Phase 4** — private beta (real teens, real schoolwork)
- [ ] **Phase 5** — public launch, course-sharing library

Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Contributing

We'd love your help — especially homeschool parents and teachers. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup (Node 20, `npm install`,
`npm test`). Be kind; read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License & name

Code is licensed under the **GNU AGPL-3.0** ([LICENSE](LICENSE)) — free for any
family, school, or co-op to run, forever. The name **"Well of Wisdom"** and the
project logo are reserved by the project: forks that diverge meaningfully should
rebrand, so the name always means the same thing to families.
