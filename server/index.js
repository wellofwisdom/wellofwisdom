// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom — server entrypoint.
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const db = require("./lib/db");
const ai = require("./lib/ai");
const auth = require("./lib/auth");
const { migrate } = require("./lib/migrate");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.set("trust proxy", true); // behind Coolify/traefik; gives req.ip for rate limiting
app.use(express.json({ limit: "2mb" }));
app.use(auth.cookies);
app.use(auth.attachUser);

// Health probe: always 200 if the process is up; component states inside.
app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    app: "wellofwisdom",
    version: require("../package.json").version,
    uptimeSec: Math.round(process.uptime()),
    db: await db.health(),
    ai: ai.health(),
  });
});

// Who am I (null when logged out — the SPA's session bootstrap).
app.get("/api/me", async (req, res) => {
  const me = req.user;
  if (!me) return res.json({ user: null });
  if (me.role !== "parent") return res.json({ user: me });
  const { rows } = await db
    .query(
      `select id, name, username, grade_level, interests, reading_level
         from users where family_id = $1 and role = 'learner' order by created_at`,
      [me.familyId]
    )
    .catch(() => ({ rows: [] }));
  res.json({ user: me, learners: rows });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/family", require("./routes/family"));

app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

// SPA: built frontend when present, plain placeholder otherwise (bare clone).
const distDir = path.join(__dirname, "..", "web", "dist");
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "..", "public");
app.use(express.static(staticDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(staticDir, "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: "internal" });
});

async function boot() {
  // Migrations run on boot; failure logs loudly but the app stays up
  // (degraded, no DB features) — fail soft, per docs/ARCHITECTURE.md.
  try {
    await migrate();
  } catch (err) {
    console.error(`[migrate] FAILED (app continues degraded): ${err.message}`);
  }
  if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Well of Wisdom listening on :${PORT} (db=${db.configured()}, ai=${ai.configured() ? "on" : "off"})`);
    });
  }
}

boot();

module.exports = app;
