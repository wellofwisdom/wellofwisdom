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

`npm run build:sea` builds a single executable of the server with Node's single executable application support. The output is named `wellofwisdom-server` (`wellofwisdom-server.exe` on Windows) next to the repo root, exactly where Well 10's desktop shell expects it. Build the web assets first.

```
npm run build
npm run build:sea
# produces ./wellofwisdom-server or ./wellofwisdom-server.exe
```

It bundles `web/dist`, `server/migrations`, `server/templates`, and `docs/examples`. The binary is about 87 MB on Windows (Node itself plus the blob) and a few MB more for bundled assets. The blob itself is about 13 kB of loader plus the `server/index.js` entry point; `web/dist` is about 3.5 MB.

Run the executable like the server:

```
DB_DRIVER=pglite DATA_DIR=./data ./wellofwisdom-server
# then open http://localhost:3000 in a browser, sign up, generate a template course, and play it
```

Limits:

* One platform and arch per build. Build on the platform you ship.
* Native modules are not supported inside the SEA blob. This project has none that matter; PGlite's WASM is bundled as JS and works.
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
```

## Troubleshooting

* `pglite_not_installed`: run `npm install` (`@electric-sql/pglite` is an optional dependency).
* `postject` not found when building the SEA: `npm install -D postject` or ensure `npx` can fetch it. The script tries a local `node_modules/.bin/postject` first.
* `sea blob generation failed`: use Node 20 or later built with SEA support. `node --experimental-sea-config sea.json` must exist.
* Port already in use: set `PORT` or `HOST` differently. The SEA verify step probes `127.0.0.1:${PORT}/api/health`.
