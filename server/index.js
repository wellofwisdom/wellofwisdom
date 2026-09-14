// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom: server entrypoint.
const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const db = require("./lib/db");
const learners = require("./lib/learners");
const seo = require("./lib/seo");
const share = require("./lib/share");
const { publicTree } = require("./routes/public");
const ai = require("./lib/ai");
const auth = require("./lib/auth");
const csp = require("./lib/csp");
const { migrate } = require("./lib/migrate");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");

// How many reverse proxies sit in front of this process. The number decides
// which X-Forwarded-For entry is the client, which is what the login and demo
// rate limiters key on. `true` (trust every hop) lets any client spoof its
// address by sending its own X-Forwarded-For, so it is never the default:
//   1 (default)  one proxy: Traefik, nginx, Caddy, or Coolify on its own
//   2            Cloudflare in front of that proxy (wellofwisdom.app)
//   false        the app is exposed directly, no proxy at all
function trustProxySetting(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "") return 1;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  if (v === "true") return true; // allowed, but you have to ask for it
  if (/^\d+$/.test(v)) return Number(v);
  return v; // a CIDR list ("loopback, 10.0.0.0/8") passes straight to Express
}
app.set("trust proxy", trustProxySetting(process.env.TRUST_PROXY));

// Behind Cloudflare, read the client from CF-Connecting-IP instead of a
// rewritten X-Forwarded-For. See server/lib/clientIp.js for when that is safe.
const clientIp = require("./lib/clientIp").clientIpMiddleware(process.env.CLIENT_IP_HEADER);
if (clientIp) app.use(clientIp);

// A request id on every response, so a self-hoster can quote one line from
// their logs in a bug report and we can find the matching server error.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});

// The big things people paste: a whole course package, a worksheet's text,
// a photo of a worksheet as base64. These get their own limit so the general
// one can stay small. express.json skips a body it has already parsed, so the
// larger parser has to be mounted first.
app.use(
  ["/api/courses/import", "/api/courses/worksheet-import", "/api/courses/worksheet-ocr", "/api/community/import"],
  express.json({ limit: process.env.IMPORT_BODY_LIMIT || "25mb" })
);
app.use(express.json({ limit: "2mb" }));

// Basic security headers (no framework needed).
app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  next();
});
app.use(csp.cspMiddleware);
app.use(auth.cookies);
app.use(auth.attachUser);
// An observer may read anything in their family and change nothing. Enforced
// once, here, so a route added later cannot forget it.
app.use("/api", auth.denyReadOnly);

// "View as learner": a guide can walk the learner app to see how it works.
// The identity swap and the read-only guard both live here rather than in each
// route, so a preview can never write, including through routes added later.
// /api/me is in this list on purpose: it is the SPA's session bootstrap, so
// without it preview never actually swaps the view. The app would answer "you
// are the guide", render the guide console, and still attach the preview header
// to every request, which then made ordinary guide writes to the routes below
// fail with preview_read_only and no banner to explain it.
const preview = require("./lib/preview");
app.use(["/api/me", "/api/learn", "/api/worlds", "/api/tutor"], preview.attachPreview);
app.use("/api", preview.denyPreviewWrites);

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

// Who am I (null when logged out. The SPA's session bootstrap).
app.get("/api/me", async (req, res) => {
  const me = req.user;
  if (!me) return res.json({ user: null });
  if (me.role !== "parent") return res.json({ user: me });
  const rows = await learners.listForFamily(db, me.familyId).catch(() => []);
  // The UI hides server-wide settings from everyone else; the routes enforce it.
  const instanceAdmin = await require("./lib/instanceAdmin").forRequest(req);
  res.json({ user: { ...me, instanceAdmin }, learners: rows });
});

app.use("/api/demo", require("./routes/demo"));
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
app.use("/api/worlds", require("./routes/worlds"));
app.use("/api/tutor", require("./routes/tutor"));
app.use("/api/guides", require("./routes/guides"));
app.use("/api/work", require("./routes/work"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/assessments", require("./routes/assessments"));
app.use("/api/waitlist", require("./routes/waitlist"));
app.use("/api/community", require("./routes/community"));
app.use("/api/narration", require("./routes/narration"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/music", require("./routes/music"));

// Media streaming sits at the app root, not under /api, so a <video src> is a
// plain URL. auth.attachUser has already run, so the handler can tell whether
// the viewer is in the owning family; public files need no session at all.
app.get("/media/:id/captions.vtt", require("./routes/uploads").captionsHandler);
app.get("/media/:id", require("./routes/uploads").streamHandler);

// AI vault routes (usage + spend) live on /api/ai (see server/routes/ai.js).

app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

// SPA: built frontend when present, plain placeholder otherwise (bare clone).
// index.html is never served by the static handler: the shell goes out through
// sendShell so each response carries its own CSP nonce on the inline script.
const distDir = path.join(__dirname, "..", "web", "dist");
const staticDir = fs.existsSync(distDir) ? distDir : path.join(__dirname, "..", "public");
app.use(express.static(staticDir, { index: false }));

function readShell() {
  return fs.readFileSync(path.join(staticDir, "index.html"), "utf8");
}

function sendShell(res, html) {
  res.type("html").send(csp.injectNonce(html, res.locals.nonce));
}

// Discovery surface for published courses and for machines. These are the only
// routes that answer without a session besides /api/public and the static shell.
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

app.get("/llms.txt", (req, res) => {
  res.type("text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(seo.llmsTxt(seo.origin(req)));
});

// Plain-text course, the highest-signal thing to hand a research tool: no
// chrome, no markup, answer keys stripped (built from the public projection).
// Registered before /c/:slug so the .txt suffix wins rather than being read as
// part of the slug.
app.get("/c/:slug.txt", async (req, res, next) => {
  try {
    if (!db.configured()) return next();
    const tree = await publicTree(String(req.params.slug));
    if (!tree) return next();
    res.type("text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    res.set("Access-Control-Allow-Origin", "*"); // a research tool may fetch it cross-origin
    res.send(share.courseText(tree, { url: `${seo.origin(req)}/c/${tree.public_slug}` }));
  } catch {
    next();
  }
});

// A shared course must be readable by things that do not run JavaScript
// crawlers, link unfurlers, research tools. Inject real metadata into the
// shell rather than shipping an empty <div id="root">.
app.get("/c/:slug", async (req, res, next) => {
  try {
    if (!db.configured()) return next();
    const meta = await seo.publishedMeta(String(req.params.slug));
    if (!meta) return next();
    sendShell(res, seo.injectHead(readShell(), seo.courseHead(meta, seo.origin(req))));
  } catch {
    next();
  }
});

// Static marketing and legal pages get a server-rendered head so crawlers and
// link unfurlers see a real title and description without running JavaScript.
// Every page listed in server/lib/site.json (the gallery at /c renders its own).
const STATIC_ROUTES = seo.SITE.pages.map((p) => p.path).filter(Boolean);
// The home page head comes from site.json too, so the shell's generic tags are replaced.
app.get("/", (req, res, next) => {
  try {
    sendShell(res, seo.injectHead(readShell(), seo.staticHead("", seo.origin(req))));
  } catch (err) { next(err); }
});
for (const id of STATIC_ROUTES) {
  app.get(`/${id}`, (req, res, next) => {
    try {
      sendShell(res, seo.injectHead(readShell(), seo.staticHead(id, seo.origin(req))));
    } catch (err) { next(err); }
  });
}

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  try {
    sendShell(res, readShell());
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Production keeps one line per failure. Anywhere else the stack goes to the
  // log too, because "internal" with no trace is what makes a bug report
  // useless. The request id ties the two together.
  const where = `${req.method} ${req.originalUrl || req.url}`;
  // The body parser signals client mistakes with a status: a body over the
  // limit (413) or JSON that does not parse (400). Those are answers, not
  // failures, so they get a code the client can show and no stack trace.
  const status = Number(err.status || err.statusCode) || 500;
  if (status < 500) {
    const code = status === 413 ? "payload_too_large" : err.type === "entity.parse.failed" ? "bad_json" : "bad_request";
    if (res.headersSent) return;
    return res.status(status).json({ error: code, requestId: req.id });
  }
  if (process.env.NODE_ENV === "production") {
    console.error(`[error] id=${req.id} ${where} ${err.message}`);
  } else {
    console.error(`[error] id=${req.id} ${where}\n${err.stack || err.message}`);
  }
  if (res.headersSent) return;
  res.status(500).json({ error: "internal", requestId: req.id });
});

async function boot() {
  // Migrations run on boot; failure logs loudly but the app stays up
  // (degraded, no DB features): fail soft, per docs/ARCHITECTURE.md.
  try {
    await migrate();
  } catch (err) {
    console.error(`[migrate] FAILED (app continues degraded): ${err.message}`);
  }
  if (db.configured()) {
    ai.setUsageLogger(require("./lib/aiusage").logUsage);
    require("./lib/jobs").startJobs();
    require("./lib/digest").startDigestSchedule();
    if (process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1") {
      require("./routes/demo").backfillDemoFamilies().catch(() => {});
    }
  }
  if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Well of Wisdom listening on :${PORT} (db=${db.configured()}, ai=${ai.configured() ? "on" : "off"}, csp=${csp.mode()}, trustProxy=${JSON.stringify(app.get("trust proxy"))})`);
    });
  }
}

boot();

module.exports = app;
module.exports.trustProxySetting = trustProxySetting;
