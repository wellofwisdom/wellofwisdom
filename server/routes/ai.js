// SPDX-License-Identifier: AGPL-3.0-or-later
// AI vault routes: one place for every API setting this app touches.
// Instance-wide (server_settings key ai), env fallback, masked GET.
// Spend vault: usage, daily/monthly sums, limits, and a pretty chart
// the family can read. Limits live in the same ai key and are checked
// before generation, not inside grading.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const aiConfig = require("../lib/aiConfig");
const aiLimits = require("../lib/aiLimits");
const aiusage = require("../lib/aiusage");
const { requireInstanceAdmin } = require("../lib/instanceAdmin");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

const ALLOWED_KEYS = [
  "aiProvider", "aiBaseUrl", "aiApiKey", "aiModelPro", "aiModelFlash",
  "aiVisionModel", "aiPrices", "kieKey", "openaiKey",
  "googleTtsOnKie", "sunoMusicOnKie", "aiMonthlyCap", "aiDailyCap",
];

router.get("/usage", async (req, res, next) => {
  try { res.json(await require("../lib/aiusage").familySummary(req.user.familyId)); } catch (err) { next(err); }
});

router.get("/status", async (_req, res, next) => {
  try { res.json(await aiConfig.status()); } catch (err) { next(err); }
});

// The vault is the whole server's, not one family's: see lib/instanceAdmin.js.
router.get("/config", requireInstanceAdmin, async (_req, res, next) => {
  try {
    const cfg = await aiConfig.resolveConfig();
    res.json({
      config: aiConfig.mask(cfg),
      providers: ["openai", "anthropic", "gemini"],
      tasks: ["course-gen", "lesson-content", "exercise-gen", "lens", "tutor", "hint", "grading", "rubric", "translate"],
    });
  } catch (err) { next(err); }
});

router.put("/config", requireInstanceAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cfg = {};
    for (const k of ALLOWED_KEYS) if (b[k] !== undefined && b[k] !== null && String(b[k]).trim() !== "") cfg[k] = b[k];
    // Normalize caps: numbers, 0 means no limit. Negative is rejected.
    if (cfg.aiMonthlyCap != null) {
      const n = Number(cfg.aiMonthlyCap);
      if (!Number.isFinite(n) || n < 0) return bad(res, "monthly_cap_invalid");
      cfg.aiMonthlyCap = n;
    }
    if (cfg.aiDailyCap != null) {
      const n = Number(cfg.aiDailyCap);
      if (!Number.isFinite(n) || n < 0) return bad(res, "daily_cap_invalid");
      cfg.aiDailyCap = n;
    }
    // aiPrices: allow object or JSON string.
    if (cfg.aiPrices != null && typeof cfg.aiPrices === "string") {
      try { cfg.aiPrices = JSON.parse(cfg.aiPrices); } catch { return bad(res, "ai_prices_invalid"); }
    }
    if (cfg.aiPrices != null && (typeof cfg.aiPrices !== "object" || Array.isArray(cfg.aiPrices))) return bad(res, "ai_prices_invalid");
    if (!db.configured()) return bad(res, "db_required", 503);
    const prevRow = await db.query("select value from server_settings where key = 'ai'");
    const prev = (prevRow.rows[0] && prevRow.rows[0].value) || {};
    for (const f of aiConfig.SECRET_FIELDS) {
      if (/^•••••/.test(String(cfg[f] || "")) && prev[f]) cfg[f] = prev[f];
    }
    const merged = { ...prev, ...cfg };
    await db.query(
      `insert into server_settings (key, value, updated_at) values ('ai', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(merged)]
    );
    aiConfig.invalidateCache();
    // media routes also read KIE_API_KEY / googleTtsOnKie etc from env; in this instance
    // the DB ai key wins for media only when media's own row is not set. For now keep
    // the two rows separate: write through to media when kieKey changes so a guide has
    // one vault, not two save buttons.
    if (cfg.kieKey != null) {
      try {
        const prevMedia = await db.query("select value from server_settings where key = 'media'").then((r) => (r.rows[0] && r.rows[0].value) || {});
        const m = { ...prevMedia };
        if (cfg.kieKey) m.kieKey = cfg.kieKey;
        await db.query(
          `insert into server_settings (key, value, updated_at) values ('media', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`,
          [JSON.stringify(m)]
        );
        require("../lib/media").invalidateCache();
      } catch { /* keep ai save even if media mirror fails */ }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Spend vault: richer than the plain month summary.
router.get("/spend", async (req, res, next) => {
  try {
    const fam = req.user.familyId;
    const summary = await aiusage.familySummary(fam);
    const lim = await aiLimits.limits();
    const mSpend = await aiLimits.monthSpend(fam);
    const dSpend = await aiLimits.daySpend(fam);
    // Daily bars for the chart (last 14 days). One query, no cross-family leak.
    const bars = await db.query(
      `select date_trunc('day', created_at)::date as day, coalesce(sum(cost),0) as cost, count(*)::int as calls, coalesce(sum(tokens_in),0)::int as tokens_in, coalesce(sum(tokens_out),0)::int as tokens_out
         from ai_usage where family_id = $1 and created_at >= now() - interval '14 days'
         group by 1 order by 1`,
      [fam]
    ).catch(() => ({ rows: [] }));
    // Model breakdown (all time, top 8)
    const byModel = await db.query(
      `select coalesce(model,'(unknown)') as model, count(*)::int as calls, coalesce(sum(cost),0) as cost, coalesce(sum(tokens_in),0)::int as tokens_in, coalesce(sum(tokens_out),0)::int as tokens_out
         from ai_usage where family_id = $1 group by 1 order by cost desc limit 8`,
      [fam]
    ).catch(() => ({ rows: [] }));
    res.json({
      ...summary,
      limits: lim,
      monthSpend: mSpend,
      daySpend: dSpend,
      daily: bars.rows,
      byModel: byModel.rows,
    });
  } catch (err) { next(err); }
});

router.put("/limits", requireInstanceAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const monthly = b.aiMonthlyCap != null ? Number(b.aiMonthlyCap) : null;
    const daily = b.aiDailyCap != null ? Number(b.aiDailyCap) : null;
    if (monthly != null && (!Number.isFinite(monthly) || monthly < 0)) return bad(res, "monthly_cap_invalid");
    if (daily != null && (!Number.isFinite(daily) || daily < 0)) return bad(res, "daily_cap_invalid");
    if (!db.configured()) return bad(res, "db_required", 503);
    const prevRow = await db.query("select value from server_settings where key = 'ai'");
    const prev = (prevRow.rows[0] && prevRow.rows[0].value) || {};
    const merged = { ...prev };
    if (monthly != null) merged.aiMonthlyCap = monthly;
    if (daily != null) merged.aiDailyCap = daily;
    await db.query(
      `insert into server_settings (key, value, updated_at) values ('ai', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(merged)]
    );
    aiConfig.invalidateCache();
    res.json({ ok: true, ...merged });
  } catch (err) { next(err); }
});

module.exports = router;
