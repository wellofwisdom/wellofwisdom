// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom — server entrypoint.
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const db = require("./lib/db");
const learners = require("./lib/learners");
const seo = require("./lib/seo");
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
  const rows = await learners.listForFamily(db, me.familyId).catch(() => []);
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
app.use("/api/events", require("./routes/events"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/media", require("./routes/media"));
app.use("/api/public", require("./routes/public"));
app.use("/api/uploads", require("./routes/uploads"));

// Media streaming sits at the app root, not under /api, so a <video src> is a
// plain URL. auth.attachUser has already run, so the handler can tell whether
// the viewer is in the owning family; public files need no session at all.
app.get("/media/:id", require("./routes/uploads").streamHandler);

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

// Discovery surface for published courses. These are the only routes that
// answer without a session besides /api/public and the static shell.
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(seo.robotsTxt(seo.origin(req)));
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    res.type("application/xml").send(await seo.sitemapXml(seo.origin(req)));
  } catch {
    res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// A shared course must be readable by things that do not run JavaScript —
// crawlers, link unfurlers, research tools. Inject real metadata into the
// shell rather than shipping an empty <div id="root">.
app.get("/c/:slug", async (req, res, next) => {
  try {
    if (!db.configured()) return next();
    const meta = await seo.publishedMeta(String(req.params.slug));
    if (!meta) return next();
    const shell = fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
    res.type("html").send(seo.injectHead(shell, seo.courseHead(meta, seo.origin(req))));
  } catch {
    next();
  }
});

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
