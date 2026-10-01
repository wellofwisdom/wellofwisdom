# Embedded mode

Well of Wisdom can run without Postgres. Embedded mode uses [PGlite](https://pglite.dev), an embedded Postgres that lives in a directory on disk, so a desktop app, a self-host on a small box, or a single-file demo can start with no database server at all.

## How it works

Two drivers behind the same interface in `server/lib/db.js`:

* `DB_DRIVER=pg` (default) uses `DATABASE_URL` and the `pg` pool, the existing behaviour.
* `DB_DRIVER=pglite` creates an embedded database under `DATA_DIR/pglite` and answers `query(sql, params)` with the same shape `{ rows, rowCount }`. `health()` reports `{ driver: "pglite" }`.

`server/lib/migrate.js` runs on boot in both modes. Under PGlite it creates `DATA_DIR/pglite` if needed, then applies every `server/migrations/*.sql` file in name order tracking `_migrations`. Jobs and digests start when `db.configured()` is true, which under PGlite is always true, so scheduling works the same as on Postgres. The first-family owner is the instance admin in both modes; see `server/lib/instanceAdmin.js`. A fresh embedded database has no families, so the logged-out page is the sign up form and the first owner becomes the admin.

## Where data lives

`DATA_DIR` holds the database files. It must be persistent or every restart wipes the data. The desktop shell (Well 10) puts it in the user's app data folder. On a server set `DATA_DIR=/app/data` (the Docker image already defaults to that).

* Database: `DATA_DIR/pglite`
* Uploads: `DATA_DIR/uploads` when the storage driver is local (the default), otherwise S3.

Do not put `DATA_DIR` on a network share that does not support file locking.

## Running embedded

From the repo:

```
# one-time: build the web assets
npm run build

# run with an embedded database in ./data
DB_DRIVER=pglite DATA_DIR=./data PORT=3000 npm start
# or: DB_DRIVER=pglite DATA_DIR=./data node server/index.js
```

For the desktop shell, see `desktop/` (Well 10). It starts the server as a sidecar with `DB_DRIVER=pglite`, `DATA_DIR` in app data, and `HOST=127.0.0.1`.

The server honours `HOST` (default `0.0.0.0`, `127.0.0.1` in the desktop). Most installs do not need it.

## Offline voice

Speech comes in three tiers, checked in this order by the client: a server tier first, then the browser's own voices. The server reports which tiers the deployment brought up in `/api/stt/status` and `/api/stt/config` under `tiers`, so an operator can see the ladder at a glance:

* `tts.kie`: speech output synthesized on kie.ai (`KIE_API_KEY` set).
* `tts.sidecar`: speech output from a local Piper HTTP container (`TTS_BASE_URL` set).
* `stt.sidecar`: speech input through a local whisper.cpp container (`STT_BASE_URL` set).
* `browser`: the browser's own speech recognition and synthesis, always present as the last rung; the client decides what its browser can use.

One command brings the sidecars up next to the app:

```
docker compose --profile offline-voice up -d
```

That starts two containers on the compose network:

* `whisper` (whisper.cpp server, image `ghcr.io/ggml-org/whisper.cpp:main`) listens on port 9000 and serves its inference endpoint at `/v1/audio/transcriptions`, the OpenAI shape the app already posts to. The image ships ffmpeg and the `base.en` model, so the app's webm recordings are converted and transcribed out of the box.
* `piper` (Piper's HTTP server, built from the pinned `piper-tts` pip package) listens on port 5000 and serves speech as WAV: `POST /synthesize` with `{"text": "..."}`. The `en_US-lessac-medium` voice downloads into the `piper-voices` volume on first start (about 65 MB) and is reused after that.

Then point the app at them in `.env` and restart it:

```
STT_BASE_URL=http://whisper:9000/v1
TTS_BASE_URL=http://piper:5000
```

`STT_BASE_URL` is the existing speech-input setting: with it set, the microphone sends recordings to the whisper sidecar and no audio leaves the box. `TTS_BASE_URL` is where the Piper container serves speech; setting it turns the `tts.sidecar` tier on in the status responses. Narration still synthesizes on kie and the browser speaks when that is not configured; see `docs/ROADMAP.md`, "Speech input (voice answers) and a third voice-output tier".

Both env names are passed through the compose `app` service, so the same `.env` works for `docker compose up -d` and `docker compose --profile offline-voice up -d`. On a plain (non-docker) self-host, set the same variables to the sidecar addresses the host can reach.

## Backup and restore

The database is just files. With the server stopped, copy `DATA_DIR`:

```
# backup
tar -czf wow-data-2026-09-14.tgz -C /app data

# restore (stop the server first)
tar -xzf wow-data-2026-09-14.tgz -C /app
```

A file-level copy of `DATA_DIR` is the backup. Do not copy while the server is running.

## Single executable (SEA)

`npm run build:sea` builds `wellofwisdom-server` (`wellofwisdom-server.exe` on Windows) at the repo root, exactly where Well 10's desktop shell expects it. Build the web assets first.

```
npm run build
npm run build:sea
# produces ./wellofwisdom-server or ./wellofwisdom-server.exe
```

What is inside: the Node runtime plus a small loader, about 87 MB on Windows. Node's SEA cannot embed node_modules, and PGlite reads `postgres.wasm` and `postgres.data` from `node_modules` on disk at runtime, so the executable needs the repo tree beside it: `server/`, `node_modules/` and `web/dist/`. The loader looks for `server/index.js` next to the executable (then two levels up, then the working directory) and requires it, so `node server/index.js` and the executable run exactly the same code. With no tree found it exits at once and prints the paths it checked.

Run it like the server, from the repo root:

```
DB_DRIVER=pglite DATA_DIR=./data ./wellofwisdom-server
# then open http://localhost:3000 in a browser, sign up, generate a template course, and play it
```

The build verifies itself: after injection the script boots the executable with `DB_DRIVER=pglite` and a temp `DATA_DIR` and probes `/api/health`, so a build that cannot serve fails loudly. Set `PORT=0` to pick a free port; the listen line prints the real port.

For shipping outside a repo checkout (the desktop bundle), ship the tree beside the binary and point `DATA_DIR` at the user's app data folder; see `docs/DESKTOP.md`.

Limits:

* One platform and arch per build. Build on the platform you ship.
* The blob holds the loader only, not the app: `server/`, `node_modules/` and `web/dist/` must ship beside the executable.
* Code signing is not included. Sign the executable after building if you ship it.
* Requires Node 20+ built with SEA support and `postject` (installed as a dev dependency). See `scripts/build-sea.js` error messages.

## Tests

```
# against Postgres (needs DATABASE_URL or TEST_DATABASE_URL, skips otherwise)
npm test

# against PGlite in a temp directory, no Postgres needed
npm run test:pglite
```

`npm run test:pglite` runs the full `node --test` suite with `DB_DRIVER=pglite` and `DATA_DIR` in a temp directory. It uses `--test-concurrency=1` because PGlite's WASM module cannot be instantiated in parallel workers. No migration file needed changing.

## .env.example

```
# DB_DRIVER=pg
# DATABASE_URL=postgres://wow:wow@localhost:5432/wellofwisdom
# PGlite embedded mode: DB_DRIVER=pglite, DATA_DIR is where the files live.
# Example: DB_DRIVER=pglite and DATA_DIR=/app/data
# When DB_DRIVER=pglite, DATABASE_URL is ignored.
# DATA_DIR=
# HOST=127.0.0.1   # only needed for the Tauri sidecar; default is 0.0.0.0
# Offline voice (docker compose --profile offline-voice up -d):
# STT_BASE_URL=http://whisper:9000/v1
# TTS_BASE_URL=http://piper:5000
```

## Troubleshooting

* `pglite_not_installed`: run `npm install` (`@electric-sql/pglite` is an optional dependency).
* `postject` not found when building the SEA: `npm install -D postject` or ensure `npx` can fetch it. The script tries a local `node_modules/.bin/postject` first.
* `sea blob generation failed`: use Node 20 or later built with SEA support. `node --experimental-sea-config sea-config.json` must work.
* Port already in use: set `PORT` or `HOST` differently. The SEA verify step boots with `PORT=0` and probes `/api/health` on the port from the listen line.
