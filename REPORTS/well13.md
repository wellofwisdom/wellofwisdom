# Well 13 - well13/sea-build

## Scope
Owns server/lib/db.js, server/lib/migrate.js, server/lib/db.test.js,
scripts/build-sea.js, docs/EMBEDDED.md. Branch from dac4dd2. No migration.

## What this round delivered

The PGlite health and migrate-once-per-process work from the earlier commit
on this branch (c3d3274) was already in place and is covered by tests:
health() reports driver, dataDir, persistent and ok; a failed open no longer
poisons later queries; migrate() joins its own in-flight run so two boots in
one process cannot apply a file twice. This round finished the other half of
the task: the Node SEA single executable for the desktop sidecar actually
works now.

### The SEA executable was broken, and why

`npm run build:sea` produced an 87 MB wellofwisdom-server.exe that crashed on
startup with `ERR_UNKNOWN_BUILTIN_MODULE: express`. Node SEA embeds only the
entry file into the blob; it has no module resolver for node_modules. The old
script pointed the sea config at server/index.js and its verify step skipped
the live check ("could not determine port"), so the broken exe shipped
silently. Bundling the server with esbuild first was tried and rejected:
PGlite reads postgres.wasm and postgres.data from its dist directory on disk
at runtime, so a bundle still needs files beside it, and migrations and
web/dist would need asset-extraction surgery in files outside this scope.

### The fix: loader-based executable (scripts/build-sea.js)

The blob now embeds a 25-line loader. It finds server/index.js next to the
executable (exe dir, two levels up, then the working directory) and loads it
through `createRequire`, because a SEA entry's bare require() resolves Node
builtins only. The result: `node server/index.js` and the exe run exactly the
same code, and the exe needs the repo tree beside it (server/, node_modules/,
web/dist/). With no tree found it exits 1 and prints the paths it checked
(verified by running the exe in a bare temp dir).

The verify step is now a real gate: it polls for the listen line for up to 30
seconds, boots with PORT=0, and probes /api/health. A build that cannot serve
fails loudly instead of printing a warning nobody reads.

### Two one-line fixes outside the declared scope, required by this work

* server/index.js: under the SEA loader require.main is the loader, so the
  `require.main === module` guard meant the server migrated and then never
  listened. Added an `isSea()` check beside that guard. The listen callback
  also logs the real bound port (`this.address()`) so PORT=0 no longer logs
  ":0" and the verify step can find the port.
* server/routes/music.js: `require("../http")` pointed at a nonexistent file
  (server/lib/http.js is the real one). Latent until the music route's
  URL-download path ran; esbuild's resolver caught it. Plain node never loads
  that path in tests, which is why check.js and the suite stayed green.

Also: .gitignore now lists wellofwisdom-server / wellofwisdom-server.exe so
the 87 MB artifact cannot be committed by accident.

### docs/EMBEDDED.md

The SEA section claimed the exe bundles web/dist, migrations, templates and
examples, and that "PGlite's WASM is bundled as JS". Both were false. The
section now states what is embedded (Node plus the loader), what must ship
beside the exe and why, the self-verifying build, and the bare-tree failure
behavior.

## Five gates (final tree, 2026-09-24)

1. `npm run check` - 150 server files OK, no em dashes; built-in unit sweep
   766 pass, 0 fail.
2. `npm run test:pglite` - 781 tests, 18 suites, 0 fail (full suite under
   DB_DRIVER=pglite in a temp DATA_DIR, concurrency 1).
3. Web: `npm --prefix web run lint` 0 errors (2 pre-existing warnings:
   AiVault, ProjectItem); `npm --prefix web run build` (tsc + vite) pass;
   `npm --prefix web test` 186 pass, 21 files.
4. `npm run verify:install` - 43 migrations on fresh pglite, health
   `{driver: "pglite", persistent: true, ok: true}`, outline then per-lesson
   generation end to end with mocked AI, language menu and prompt plumbing ok.
5. `npm run build:sea` - wellofwisdom-server.exe 87.3 MB; verify step booted
   the exe and got `GET /api/health -> 200` with
   `db: {driver: "pglite", persistent: true, ok: true}`; a manual run also
   served the SPA shell on GET /.

## Notes for the next well that touches this

* The desktop shell (Well 10) can keep using `node server/index.js` in dev.
  For a release bundle, ship server/, node_modules/ and web/dist/ beside the
  wellofwisdom-server binary (Tauri resources) and set DATA_DIR to the app
  data folder. docs/DESKTOP.md's "single executable Well 13 produces" is now
  real, with the tree-beside-the-exe caveat.
* Do not try to inline pglite into the SEA blob: postgres.wasm and
  postgres.data are runtime file reads, not bundled JS.
* pglite tests remain in one file (server/lib/db.test.js).
