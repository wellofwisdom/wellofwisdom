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

// Basic security headers (no framework needed).
app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  next();
});
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
app.use("/api/courses", require("./routes/courses"));
app.use("/api/learn", require("./routes/learn"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/plans", require("./routes/plans"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/resources", require("./routes/resources"));
app.use("/api/mail", require("./routes/mail"));

// AI usage for this family (parent only) — spend transparency.
app.get("/api/ai/usage", auth.parentOnly, async (req, res, next) => {
  try {
    res.json(await require("./lib/aiusage").familySummary(req.user.familyId));
  } catch (err) {
    next(err);
  }
});

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
  if (db.configured()) {
    ai.setUsageLogger(require("./lib/aiusage").logUsage);
    require("./lib/jobs").startJobs();
    require("./lib/digest").startDigestSchedule();
  }
  if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Well of Wisdom listening on :${PORT} (db=${db.configured()}, ai=${ai.configured() ? "on" : "off"})`);
    });
  }
}

boot();

module.exports = app;
