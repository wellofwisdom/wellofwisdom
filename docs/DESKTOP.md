# Desktop app

Well of Wisdom runs as a desktop app via Tauri v2. The window hosts the same web app, with a local database so no Postgres is needed.

## How it works

The Tauri process starts the Well of Wisdom server as a sidecar on a free localhost port with `DB_DRIVER=pglite` and `DATA_DIR` in the user's app data folder. It waits for `/api/health`, then navigates the window to `http://127.0.0.1:<port>`. When the window closes, the sidecar is killed. Well 13 owns the server side of embedded mode; the desktop side coordinates with it.

In development the sidecar is `node server/index.js` from the repo. In release it is the single executable Well 13 produces (`wellofwisdom-server` next to the desktop binary). Until that binary exists, the desktop falls back to the node sidecar.

## Where data lives

`DATA_DIR` is the platform app data folder:

* Windows: `%APPDATA%\app.wellofwisdom.desktop\`
* macOS: `~/Library/Application Support/app.wellofwisdom.desktop/`
* Linux: `~/.local/share/app.wellofwisdom.desktop/`

Inside it, `pglite/` holds the database files. Back up or move the whole folder to back up or migrate. The `Open data folder` menu item opens it.

## Prerequisites

* Rust toolchain (rustup, stable). See https://rustup.rs
* Tauri CLI. Run `npm install` inside `desktop/` to pull `@tauri-apps/cli`
* Linux only: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev`
* Node 20+

## Development

```bash
npm install
npm --prefix web install
npm --prefix web run build

cd desktop
npm install
npx tauri dev
```

`tauri dev` starts the sidecar, waits for health, and opens the window with a working local database and no Postgres installed.

## Build

```bash
cd desktop
npx tauri build
```

Bundles are written to `desktop/src-tauri/target/release/bundle/`:

* Windows: `.msi` and `.exe` (NSIS)
* macOS: `.app` and `.dmg`
* Linux: `.deb` and `.AppImage`

There is a GitHub workflow at `.github/workflows/desktop.yml` (`workflow_dispatch` only) that builds all three as artifacts. No signing yet, no release upload.

## Icons

Every size Tauri needs is generated from `web/public/icon-512.png` (navy, 512 square) into `desktop/src-tauri/icons/`:

* `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `256x256.png`, `512x512.png`, `icon.png`, `icon.ico`

Regenerate if the source icon changes.

## What signing and Steam still need

* Code signing: Apple Developer ID (macOS), Authenticode cert (Windows). No signing is configured. Until then, macOS will quarantine the unsigned app and Windows SmartScreen will warn.
* Notarization (macOS) and hardened runtime entitlements.
* Auto update is not wired. Consider `tauri-plugin-updater` when releases go to GitHub.
* Steam: Steamworks SDK, depot build, and Steam overlay handling still need to be added. The desktop bundle is independent of Steam for now.

## Troubleshooting

* If the window stays on "Starting..." the sidecar did not become healthy in 60 seconds. Check the terminal where `tauri dev` runs for `[desktop]` messages.
* A single instance is enforced: launching the app again focuses the existing window.
