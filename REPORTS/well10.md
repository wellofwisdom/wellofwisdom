# Well 10 report: desktop bundle (well10/desktop-bundle)

## Branch
`well10/desktop-bundle` from `dac4dd2`. No migration.

## Folder
Only `C:\Users\kevin\ZCodeProject\wellofwisdom-well10` (branch already checked out).

## Scope
Only `desktop/**` and `docs/DESKTOP.md`.

## What shipped
* `desktop/src-tauri/tauri.conf.json` now lists `bundle.resources` for five CC-BY example courses plus all 20 adventure templates and 5 plan templates, so the gallery works offline on first run with no network.
  * Courses: Comparing Fractions, Fractions Through Sewing, Photosynthesis Through Cooking, Your Horoscope Is Not Science, River Ecology Field Study. Target `data/courses/*.wow-course.json`. All five pass `npm run validate-course`.
  * Templates: `server/templates/adventures` (20) to `data/adventures`, `server/templates/plans` (5) to `data/plans`. The app falls back to these when `docs/examples` is not on disk.
  * No extra build step needed. Verify with `npx tauri build` and inspect `desktop/src-tauri/target/release/bundle/`.
* `DATA_DIR` per platform verified via `app.path().app_data_dir()` in `desktop/src-tauri/src/lib.rs`: Windows `%APPDATA%\app.wellofwisdom.desktop\`, macOS `~/Library/Application Support/app.wellofwisdom.desktop/`, Linux `~/.local/share/app.wellofwisdom.desktop/`. Inside, `pglite/` holds the database files. The `Open data folder` menu item calls `tauri_plugin_opener::reveal_item_in_dir` on that path (capability `opener:allow-reveal-item-in-dir` in `desktop/src-tauri/capabilities/default.json`).
* `docs/DESKTOP.md` documents signing prep (Apple Developer ID via `bundle.macOS.signingIdentity`, Authenticode via `bundle.windows.certificateThumbprint` and `TAURI_SIGNING_PRIVATE_KEY`, hardened-runtime entitlements and `xcrun notarytool` notarization on macOS; key stays in GitHub Actions secrets) and auto update prep (`tauri-plugin-updater`, `plugins.updater.pubkey`, per-release `latest.json` with signatures, test update `0.0.1` to `0.0.2` before auto install).

## Install
Ran `npm install` and `npm --prefix web install` from `wellofwisdom-well10`, plus `npm install` inside `desktop/` for `@tauri-apps/cli`.

## Five gates before push (2026-09-24)
* `npm run check`: 757 tests, 0 fail
* `npm test`: 772 tests, 0 fail
* `npm --prefix web run build`: Vite build ok in 7s
* `npm run test:pglite`: 772 tests, 0 fail (temp dir removed)
* `npm run verify:install`: migrations 43, db health ok driver pglite, outline then per-lesson end to end passed

## Files changed vs dac4dd2
* `desktop/src-tauri/tauri.conf.json` (bundle.resources added)
* `docs/DESKTOP.md` (Bundled content for first run offline + Signing and auto update prep)
