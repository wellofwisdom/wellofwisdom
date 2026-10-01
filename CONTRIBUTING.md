# Contributing to Well of Wisdom

Thanks for helping build a free, open education platform. Whether you're a
homeschool parent, a teacher, a developer, or just curious, you're welcome here.

## Dev setup

```bash
git clone https://github.com/wellofwisdom/wellofwisdom.git
cd wellofwisdom
npm install                # server dependencies
npm --prefix web install   # web app dependencies
npm --prefix web run build # build the app UI into web/dist
npm run dev                # server with auto-reload on :3000
```

Without the web build the server still runs, but `/app` serves a skeleton
page instead of the real UI.

A database is required before anything can sign up. With none configured the
server boots and serves pages, but creating the first account fails. Two
options:

- Any Postgres: point `DATABASE_URL` at it.
- No Postgres at all: set `DB_DRIVER=pglite` and a persistent `DATA_DIR`
  (any folder) and the server runs its own embedded database there. Delete
  the folder and you delete the data.

Configuration goes in `.env`. One thing to know: outside Docker, nothing
reads that file. `docker compose` picks it up automatically, but a plain
`npm run dev` does not. Either export the variables yourself, or run the
server with Node's flag (Node 20.6+):

```bash
node --env-file=.env server/index.js
```

Copy `.env.example` to `.env` as a starting point and fill in a
`DATABASE_URL` (or the pglite pair above) and, when you want AI features, an
`AI_BASE_URL` (any OpenAI-compatible endpoint: [Ollama](https://ollama.com)
is free and local).

## Before you open a PR

```bash
npm run check                            # syntax check + no em dashes
npm test                                 # unit tests (node --test)
npm --prefix web run build               # type check + Vite build
```

All three must pass: CI runs them on every push.

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
open a Discussion: feature feedback from real homeschool use is the most
valuable contribution there is.

## Reporting safety problems

Anything involving child safety or data exposure: email the maintainers directly
(see the org profile) instead of opening a public issue.
