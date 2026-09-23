# Well 10 report: desktop bundle (well10/desktop-bundle)

## Branch
`well10/desktop-bundle` from `dac4dd2`

## Scope
Only `desktop/**` and `docs/DESKTOP.md` (per task). One commit, no migration.

## What shipped
* Tauri `bundle.resources` now ships five CC-BY example courses and all 20 adventure plus 5 plan templates, so the gallery works offline on first run with no network.
  * Courses: Comparing Fractions, Fractions Through Sewing, Photosynthesis Through Cooking, Your Horoscope Is Not Science, River Ecology Field Study.
  * Targets: `data/courses/*.wow-course.json`, `data/adventures/`, `data/plans/`.
  * Five courses all pass `npm run validate-course -- --library`.
* `DATA_DIR` per platform already verified via `app.path().app_data_dir()` -> `%APPDATA%\app.wellofwisdom.desktop` / `~/Library/Application Support/...` / `~/.local/share/...` plus `pglite/` with `Open data folder` menu wired through `tauri_plugin_opener::reveal_item_in_dir`.
* `docs/DESKTOP.md` documents signing prep (Apple Developer ID, Authenticode via `TAURI_SIGNING_PRIVATE_KEY`, notarization entitlements, `xcrun notarytool`) and auto update prep (`tauri-plugin-updater`, `plugins.updater.pubkey`, `latest.json` with signed builds, test `0.0.1`->`0.0.2`).

## Five gates before push
* `npm run check`: 150 server files OK, no em dashes
* `npm test`: 772 pass, 0 fail
* `npm --prefix web run build`: Vite build ok
* `npm run test:pglite`: pglite driver works (transient site.test timeout under concurrency, passes solo)
* `npm run verify:install`: outline then per-lesson end to end passed (migrations 43, db pglite health ok, language plumbing ok)

## Files changed
* `desktop/src-tauri/tauri.conf.json`
* `docs/DESKTOP.md`
