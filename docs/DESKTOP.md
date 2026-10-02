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

## Triple platform CI (desktop-build.yml)

`.github/workflows/desktop-build.yml` proves on every push and PR that touches desktop code (and on manual dispatch) that all three platforms build and boot. A matrix over `ubuntu-latest`, `macos-latest` and `windows-latest` runs these steps per runner:

1. `npm run build`: web/dist for that runner.
2. `npm run build:sea:ci`: `scripts/build-sea.js --out-dir dist-desktop` postjects the SEA blob into the official node binary of that same platform and writes `dist-desktop/wellofwisdom-server-<windows|macos|linux>-<arch>[.exe]`.
3. Boot proof: the sidecar starts with `DB_DRIVER=pglite`, a throwaway `DATA_DIR` under the runner temp, and a fixed local port; the job polls `/api/health` until it answers 200 (two minute budget, a cold boot applies every migration). No 200, red build.
4. `cargo build --release` of the Tauri shell in `desktop/src-tauri` (compile only).

Artifacts per run: `sidecar-<os>` (the exe from step 2) and `shell-<os>` (the compiled Tauri binary from step 4).

The CI bar stops there on purpose. The full Tauri window cannot open headlessly on the Linux runner and faking it proves nothing, so a green run means: web builds, the sidecar injects and serves on this OS, and the shell compiles on this OS. It does not mean someone has seen the window work.

`macos-latest` is Apple Silicon, so the macOS sidecar artifact is `macos-arm64`. An Intel Mac build needs a `macos-13` job added to the matrix; until then Intel desktop is untested.

## What still needs a human on real hardware

Per OS, on a real machine, before calling a platform shippable:

* Windows: install the `.msi` or NSIS `.exe` from `npx tauri build` (or the desktop.yml artifact); the window opens and serves, `Open data folder` lands in `%APPDATA%\app.wellofwisdom.desktop`, launching twice focuses the existing window, uninstall is clean. SmartScreen warns on the unsigned binary (`More info` then `Run anyway`) until Authenticode lands.
* macOS: open the `.dmg`, drag to Applications. The build is unsigned, so the first launch needs a right-click `Open`, or clear quarantine with `xattr -dr com.apple.quarantine "Well of Wisdom.app"`. Check window, menu, data folder in `~/Library/Application Support/app.wellofwisdom.desktop/`. The sidecar is ad-hoc signed (Apple Silicon refuses binaries with no signature at all) and its boot log prints `Unsigned macOS build: ...` on every start.
* Linux: the AppImage needs libfuse2, the `.deb` installs with apt. Open the window on a real desktop with webkit2gtk-4.1 installed. CI never opens a window, so the Linux desktop experience is always a human check.

## Icons

Every size Tauri needs is generated from `web/public/icon-512.png` (navy, 512 square) into `desktop/src-tauri/icons/`:

* `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `256x256.png`, `512x512.png`, `icon.png`, `icon.ico`

Regenerate if the source icon changes.

## Bundled content for first run offline

The desktop bundle ships five example courses and all adventure and plan templates as Tauri resources, so the gallery works on first run with no network.

* Courses (CC-BY-4.0) in `data/courses/`: Comparing Fractions, Fractions Through Sewing, Photosynthesis Through Cooking, Your Horoscope Is Not Science, River Ecology Field Study. Validated by `npm run validate-course` before build.
* Adventure templates (20) in `data/adventures/` and plan templates (5) in `data/plans/`, copied from `server/templates/`. The app falls back to these when `docs/examples` is not on disk.

Tauri `bundle.resources` in `desktop/src-tauri/tauri.conf.json` maps each source path to its resource target. No extra build step is needed. Verify the bundle contains them with `npx tauri build` and inspecting `desktop/src-tauri/target/release/bundle/`.

## Signing and auto update prep

No signing or updater is wired yet. When ready:

* Code signing: set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in CI, add `bundle.macOS.signingIdentity` for Apple Developer ID and `bundle.windows.certificateThumbprint` plus `bundle.windows.digestAlgorithm` for Authenticode. Keep the private key in GitHub Actions secrets, never in the repo.
* Notarization (macOS): add `bundle.macOS.entitlements` for hardened runtime and run `xcrun notarytool` in the workflow after `tauri build`. Until signed and notarized, macOS quarantines the unsigned app and Windows SmartScreen warns.
* Auto update: add `tauri-plugin-updater` (`npx tauri add updater`), point `plugins.updater.pubkey` at the public key, and publish a `latest.json` with each GitHub Release. The desktop workflow should then build with `TAURI_SIGNING_PRIVATE_KEY` set so `latest.json` carries valid signatures. Test an update from `0.0.1` to `0.0.2` before enabling auto install.
* Steam: see the depot layout section below. Steamworks SDK, AppInfo wiring, and Steam overlay handling still need to be added.

Exactly what Kevin must provide when signing time comes (none of it exists today):

* Apple, to sign: a paid Apple Developer Program membership (Developer ID certificates require it). Then a `Developer ID Application` certificate, created in the developer portal and exported as a `.p12` plus its password; both go into GitHub Actions secrets (base64 the p12), never the repo. The signing identity string looks like `Developer ID Application: NAME (TEAMID)` and goes in `bundle.macOS.signingIdentity`.
* Apple, to notarize: an App Store Connect API key (Issuer ID, Key ID, and the `.p8` file, as secrets) or an Apple-ID app-specific password. The workflow imports the cert into a temporary keychain, then runs `xcrun notarytool submit` and `xcrun stapler staple` after `tauri build`.
* Windows, to sign: an Authenticode code signing certificate. OV works; EV clears SmartScreen reputation sooner. Provide the `.pfx` plus password as secrets and set `bundle.windows.certificateThumbprint` and `bundle.windows.digestAlgorithm`.

Until then everything ships unsigned, and that is expected: the macOS sidecar prints `Unsigned macOS build: ...` in the boot log on every start (the SEA loader in scripts/build-sea.js emits the line), the macOS app bundle is unsigned, and the Windows binary triggers SmartScreen.

## Steam depot layout

What our build emits, and where it lands:

* Sidecar exe: `npm run build:sea` writes `wellofwisdom-server[.exe]` in the repo root (local builds). CI writes `dist-desktop/wellofwisdom-server-<windows|macos|linux>-<arch>[.exe]` and uploads it as the `sidecar-<os>` artifact of desktop-build.yml.
* Shell binary: `desktop/src-tauri/target/release/wellofwisdom-desktop[.exe]` (from `cargo build`, uploaded as `shell-<os>`).
* Installers: `desktop/src-tauri/target/release/bundle/` from `npx tauri build` or desktop.yml (`.msi` and NSIS `.exe` on Windows, `.app` and `.dmg` on macOS, `.deb` and `.AppImage` on Linux).

The sidecar is not self-contained: it embeds only the Node runtime and a loader, and reads everything else from disk next to it. A shippable folder must carry, beside the two binaries:

* `server/` (index.js, lib/, routes/, migrations/, templates/)
* `node_modules/`
* `web/dist/`
* `docs/examples/` (optional: the Tauri resources already carry copies of the courses and templates under `data/`, so this is belt and braces)

Steam wants one depot per platform; depot IDs and the AppInfo build wiring are Kevin's Steamworks job. Inside each depot's content folder, mirror the layout above and rename the sidecar to the plain name the shell looks for:

```
<depot content>/                 one per OS
  wellofwisdom-desktop.exe       the shell (macOS: Well of Wisdom.app, Linux: binary or extracted AppImage)
  wellofwisdom-server.exe        sidecar, renamed from the platform-suffixed artifact name
  server/
  node_modules/
  web/dist/
```

The shell finds its sidecar by exact name next to its own binary (`wellofwisdom-server`, or `wellofwisdom-server.exe` on Windows, one directory up also tried), see `wellofwisdom_exe()` in `desktop/src-tauri/src/lib.rs`. On macOS that means the sidecar goes inside the app bundle at `Contents/MacOS/` beside the shell executable. The per-OS depots carry the same `node_modules` tree: every dependency is pure JS plus PGlite's wasm, nothing is platform specific. Steam launch options point each platform entry at the shell binary; overlay behavior over the webview is untested and belongs on the real-hardware checklist above.

## Troubleshooting

* If the window stays on "Starting..." the sidecar did not become healthy in 60 seconds. Check the terminal where `tauri dev` runs for `[desktop]` messages.
* A single instance is enforced: launching the app again focuses the existing window.
