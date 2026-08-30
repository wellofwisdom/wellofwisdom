# Contributing to Well of Wisdom

Thanks for helping build a free, open education platform. Whether you're a
homeschool parent, a teacher, a developer, or just curious — you're welcome here.

## Dev setup

```bash
git clone https://github.com/wellofwisdom/wellofwisdom.git
cd wellofwisdom
npm install
npm run dev        # starts the server with auto-reload on :3000
```

Optional but recommended: copy `.env.example` to `.env` and fill in a
`DATABASE_URL` (any Postgres) and an `AI_BASE_URL` (any OpenAI-compatible
endpoint — [Ollama](https://ollama.com) is free and local).

## Before you open a PR

```bash
npm run check      # syntax check on server code
npm test           # unit tests (node --test)
```

Both must pass — CI runs them on every push.

## Ground rules

- **Kids first.** Every feature decision weighs: is this good for learners, and
  is it safe? No tracking, no dark patterns, no data leaving the server without
  the parent explicitly configuring it.
- **Degrade gracefully.** The app must stay usable with no database and no AI
  endpoint. Features fail soft; the server never crash-loops.
- **Small PRs.** One concern per PR, described in plain language.
- **Tests with behavior.** New server logic ships with `*.test.js` coverage.
- Match the existing code style. Plain Node, CommonJS, no framework churn.

## Good places to start

Issues labeled [`good first issue`](https://github.com/wellofwisdom/wellofwisdom/labels/good%20first%20issue)
are hand-picked landing spots. If you're a teacher or parent and not a coder,
open a Discussion — feature feedback from real homeschool use is the most
valuable contribution there is.

## Reporting safety problems

Anything involving child safety or data exposure: email the maintainers directly
(see the org profile) instead of opening a public issue.
