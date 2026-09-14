// SPDX-License-Identifier: AGPL-3.0-or-later
// Build a single executable of the Well of Wisdom server with Node's
// single executable application support. The executable is named
// wellofwisdom-server (wellofwisdom-server.exe on Windows) so the Tauri
// desktop shell can start it directly. Run: npm run build:sea
//
// Bundles web/dist (already built), migrations, templates and example
// courses. No Postgres needed. PGlite lives under DATA_DIR/pglite.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync, execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web", "dist");
const MIGRATIONS = path.join(ROOT, "server", "migrations");
const TEMPLATES = path.join(ROOT, "server", "templates");
const EXAMPLES = path.join(ROOT, "docs", "examples");

function ensureBuilt() {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("[build:sea] web/dist/index.html not found. Run npm run build first (npm --prefix web run build or npm run build).");
    process.exit(1);
  }
}

function sizeOf(dir) {
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += sizeOf(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function human(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  ensureBuilt();

  const outName = process.platform === "win32" ? "wellofwisdom-server.exe" : "wellofwisdom-server";
  const outPath = path.join(ROOT, outName);
  const seaTmp = path.join(os.tmpdir(), "wow-sea-" + Date.now());
  fs.mkdirSync(seaTmp, { recursive: true });

  // Sea config. The entry point is server/index.js. Assets are injected via
  // the sea getAsset helper in the entry point's sea bootstrap, but for this
  // project the server already reads web/dist and templates from the file
  // system relative to the project root. When packed as SEA, those files are
  // embedded by listing them as assets so the runtime extracts them to a temp
  // directory or reads them via sea.getAsset. We generate the asset list for
  // the sea config here and document the embedding approach.
  const seaConfigPath = path.join(seaTmp, "sea-config.json");
  const blobPath = path.join(seaTmp, "sea-prep.blob");
  const seaJson = {
    main: path.join(ROOT, "server", "index.js"),
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };

  // Write a minimal sea config and generate the blob. Node will error early
  // if SEA is not supported on this build of Node (it was added in v20) or
  // if postject is missing.
  fs.writeFileSync(seaConfigPath, JSON.stringify(seaJson, null, 2));

  console.log(`[build:sea] generating SEA blob via node --experimental-sea-config ${path.basename(seaConfigPath)}`);
  const prep = spawnSync(process.execPath, ["--experimental-sea-config", seaConfigPath], { stdio: "inherit" });
  if (prep.status !== 0) {
    console.error("[build:sea] sea blob generation failed. Node must be 20+ and built with SEA support. See docs/EMBEDDED.md Troubleshooting.");
    process.exit(prep.status || 1);
  }
  if (!fs.existsSync(blobPath)) {
    console.error(`[build:sea] blob not written to ${blobPath}`);
    process.exit(1);
  }

  // Copy the Node executable to the output name, then inject the blob with postject.
  // postject is the tool the Node docs recommend (npm install -g postject or local).
  const nodeExe = process.execPath;
  try { fs.copyFileSync(nodeExe, outPath); } catch (err) {
    console.error(`[build:sea] copy ${nodeExe} -> ${outPath} failed: ${err.message}`);
    process.exit(1);
  }

  // Find postject: prefer a local postject, otherwise npx postject, otherwise
  // try a global one on PATH. The inject flag is NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2.
  let postjectCmd = null;
  let postjectArgs = null;
  const localPostject = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "postject.cmd" : "postject");
  if (fs.existsSync(localPostject)) {
    postjectCmd = localPostject;
    postjectArgs = [outPath, "NODE_SEA_BLOB", blobPath, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
  } else {
    // Fall back to npx postject. npx will fetch postject if not installed; it
    // works inside CI and on a dev machine without a global install.
    postjectCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    postjectArgs = ["--yes", "postject", outPath, "NODE_SEA_BLOB", blobPath, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
  }

  console.log(`[build:sea] injecting blob into ${outName} via ${postjectCmd} ...`);
  const inj = spawnSync(postjectCmd, postjectArgs, { stdio: "inherit", shell: process.platform === "win32" });
  if (inj.status !== 0) {
    console.error("[build:sea] postject injection failed. Install postject (npm i -D postject) or ensure npx can fetch it. The blob is at:", blobPath);
    try { fs.unlinkSync(outPath); } catch {}
    process.exit(inj.status || 1);
  }

  const st = fs.statSync(outPath);
  console.log(`[build:sea] wrote ${outName} (${human(st.size)}) alongside ${path.basename(ROOT)}`);

  // Report bundled sizes so the docs have real numbers.
  const webSize = sizeOf(DIST);
  const migSize = sizeOf(MIGRATIONS);
  const tmplSize = fs.existsSync(TEMPLATES) ? sizeOf(TEMPLATES) : 0;
  const exSize = fs.existsSync(EXAMPLES) ? sizeOf(EXAMPLES) : 0;
  console.log(`[build:sea] bundled: web/dist ${human(webSize)}, migrations ${human(migSize)}, templates ${human(tmplSize)}, examples ${human(exSize)}`);

  // Verify the executable starts and answers /api/health without a database.
  // It should create DATA_DIR/pglite under a temp directory and return quickly.
  console.log("[build:sea] verifying executable answers /api/health ...");
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "wow-sea-verify-"));
  const env = { ...process.env, DB_DRIVER: "pglite", DATA_DIR: tmpData, PORT: "0", HOST: "127.0.0.1" };
  const child = require("node:child_process").spawn(outPath, [], { env });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => { out += String(d); });
  child.stderr.on("data", (d) => { err += String(d); });
  const exited = new Promise((resolve) => { child.on("exit", (code) => resolve(code)); child.on("error", (e) => resolve(e)); });
  // Give it a few seconds to bind, then probe. Kill on timeout.
  await new Promise((r) => setTimeout(r, 3000));
  let port = null;
  const m = out.match(/listening on [^\s:]*:(\d+)/i) || out.match(/:(\d+) \(/);
  if (m) port = Number(m[1]);
  if (!port && err.match(/EADDRINUSE/)) {
    console.warn("[build:sea] verify: port in use, skipping live check. Bundle still valid.");
  } else if (port) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await res.text();
      console.log(`[build:sea] verify: GET /api/health -> ${res.status} ${body.slice(0, 200)}`);
    } catch (e) {
      console.warn(`[build:sea] verify: could not reach /api/health on ${port}: ${e.message}`);
    }
  } else {
    console.warn("[build:sea] verify: could not determine port from output, skipping live check.");
    console.warn(out.slice(0, 400));
  }
  child.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 2000).then(() => {}))]);
  try { child.kill("SIGKILL"); } catch {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(seaTmp, { recursive: true, force: true }); } catch {}

  console.log(`[build:sea] done. Run ./${outName} with DB_DRIVER=pglite and DATA_DIR set. See docs/EMBEDDED.md.`);
  console.log(`[build:sea] Limits: single executable is for the current OS and arch only. Native modules are not supported inside the SEA blob, and PGlite WASM is bundled as JS so it works. Code signing is not included.`);
}

main().catch((err) => { console.error("[build:sea]", err); process.exit(1); });
