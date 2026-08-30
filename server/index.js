// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom — server entrypoint.
const express = require("express");
const path = require("node:path");
const db = require("./lib/db");
const ai = require("./lib/ai");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

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

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res) => res.status(404).json({ error: "not_found" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: "internal" });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Well of Wisdom listening on :${PORT} (db=${db.configured()}, ai=${ai.configured() ? "on" : "off"})`);
  });
}

module.exports = app;
