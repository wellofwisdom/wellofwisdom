// SPDX-License-Identifier: AGPL-3.0-or-later
// AI vault routes: one place for every API setting this app touches.
// Instance-wide (server_settings key ai), env fallback, masked GET.
// Spend vault: usage, daily/monthly sums, limits, and a pretty chart
// the family can read. Limits live in the same ai key and are checked
// before generation, not inside grading. Providers + per-task routes live
// here too, so an admin can keep learner data on a no-training host.
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

const TASK_KEYS = ["course-gen", "lesson-content", "exercise-gen", "lens", "tutor", "hint", "grading", "rubric", "translate", "stt"];
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

router.get("/config", requireInstanceAdmin, async (_req, res, next) => {
  try {
    const cfg = await aiConfig.resolveConfig();
    res.json({
      config: aiConfig.mask(cfg),
      providers: ["openai", "anthropic", "gemini"],
      providerKinds: ["openai-compatible", "anthropic", "gemini"],
      tasks: TASK_KEYS,
    });
  } catch (err) { next(err); }
});

router.put("/config", requireInstanceAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cfg = {};
    for (const k of ALLOWED_KEYS) if (b[k] !== undefined && b[k] !== null && String(b[k]).trim() !== "") cfg[k] = b[k];
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

router.get("/providers", requireInstanceAdmin, async (_req, res, next) => {
  try {
    const cfg = await aiConfig.resolveConfig();
    const providers = Array.isArray(cfg && cfg.aiProviders) ? cfg.aiProviders : [];
    const routes = cfg && cfg.aiRoutes && typeof cfg.aiRoutes === "object" ? cfg.aiRoutes : {};
    res.json({
      providers: providers.map((p) => {
        const out = { ...p };
        if (out.apiKey) out.apiKey = "•••••" + String(out.apiKey).slice(-4);
        return out;
      }),
      routes,
      tasks: TASK_KEYS,
      kinds: ["openai-compatible", "anthropic", "gemini"],
    });
  } catch (err) { next(err); }
});

router.put("/providers", requireInstanceAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!db.configured()) return bad(res, "db_required", 503);
    const prevRow = await db.query("select value from server_settings where key = 'ai'");
    const prev = (prevRow.rows[0] && prevRow.rows[0].value) || {};
    const prevProviders = Array.isArray(prev.aiProviders) ? prev.aiProviders : [];

    let nextProviders = prevProviders;
    if (b.providers !== undefined) {
      if (!Array.isArray(b.providers)) return bad(res, "providers_invalid");
      if (b.providers.length > 20) return bad(res, "too_many_providers");
      const normalized = [];
      const seen = new Set();
      for (const p of b.providers) {
        if (!p || typeof p !== "object") return bad(res, "providers_invalid");
        const id = String(p.id || "").trim().slice(0, 80);
        if (!id || !/^[a-z0-9_-]+$/i.test(id)) return bad(res, "provider_id_invalid");
        if (seen.has(id)) return bad(res, "duplicate_provider_id");
        seen.add(id);
        const name = String(p.name || id).trim().slice(0, 120);
        if (!name) return bad(res, "provider_name_required");
        const kind = String(p.kind || "").trim().toLowerCase();
        if (!["openai-compatible", "openai", "anthropic", "gemini"].includes(kind)) return bad(res, "provider_kind_invalid");
        const baseUrl = String(p.baseUrl || "").trim().slice(0, 500);
        if (baseUrl) {
          try { const u = new URL(baseUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad"); } catch { return bad(res, "provider_url_invalid"); }
        }
        let apiKey = typeof p.apiKey === "string" ? p.apiKey.slice(0, 500) : "";
        const prevMatch = prevProviders.find((q) => q.id === id);
        if (/^•••••/.test(apiKey) && prevMatch && prevMatch.apiKey) apiKey = prevMatch.apiKey;
        if (!apiKey && !baseUrl && kind === "openai-compatible") { /* local Ollama may have neither */ }
        const trainsOnData = Boolean(p.trainsOnData ?? p.trains_on_data);
        const models = Array.isArray(p.models) ? p.models.map((m) => String(m).trim().slice(0, 120)).filter(Boolean).slice(0, 20) : [];
        normalized.push({ id, name, kind, baseUrl, apiKey, trainsOnData, models });
      }
      nextProviders = normalized;
    }

    let nextRoutes = prev.aiRoutes && typeof prev.aiRoutes === "object" ? { ...prev.aiRoutes } : {};
    if (b.routes !== undefined) {
      if (b.routes === null) nextRoutes = {};
      else {
        if (!b.routes || typeof b.routes !== "object" || Array.isArray(b.routes)) return bad(res, "routes_invalid");
        const allowedTasks = new Set(TASK_KEYS);
        const seenTasks = new Set();
        const cleaned = {};
        const ids = new Set(nextProviders.map((p) => p.id));
        for (const [task, r] of Object.entries(b.routes)) {
          if (!allowedTasks.has(task)) return bad(res, "unknown_task");
          if (seenTasks.has(task)) return bad(res, "duplicate_task");
          seenTasks.add(task);
          if (!r || typeof r !== "object" || Array.isArray(r)) return bad(res, "routes_invalid");
          const providerId = String(r.providerId || r.provider || "").trim().slice(0, 80);
          if (!providerId || !ids.has(providerId)) return bad(res, "route_provider_unknown");
          const model = r.model != null && String(r.model).trim() ? String(r.model).trim().slice(0, 120) : null;
          cleaned[task] = { providerId, model };
        }
        nextRoutes = cleaned;
      }
    }

    const merged = { ...prev, aiProviders: nextProviders, aiRoutes: nextRoutes };
    await db.query(
      `insert into server_settings (key, value, updated_at) values ('ai', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`,
      [JSON.stringify(merged)]
    );
    aiConfig.invalidateCache();
    res.json({ ok: true, providers: nextProviders.map((p) => ({ ...p, apiKey: p.apiKey ? "•••••" + String(p.apiKey).slice(-4) : "" })), routes: nextRoutes });
  } catch (err) { next(err); }
});

router.get("/spend", async (req, res, next) => {
  try {
    const fam = req.user.familyId;
    const summary = await aiusage.familySummary(fam);
    const lim = await aiLimits.limits();
    const mSpend = await aiLimits.monthSpend(fam);
    const dSpend = await aiLimits.daySpend(fam);
    const bars = await db.query(
      `select date_trunc('day', created_at)::date as day, coalesce(sum(cost),0) as cost, count(*)::int as calls, coalesce(sum(tokens_in),0)::int as tokens_in, coalesce(sum(tokens_out),0)::int as tokens_out
         from ai_usage where family_id = $1 and created_at >= now() - interval '14 days'
         group by 1 order by 1`,
      [fam]
    ).catch(() => ({ rows: [] }));
    const byModel = await db.query(
      `select coalesce(model,'(unknown)') as model, count(*)::int as calls, coalesce(sum(cost),0) as cost, coalesce(sum(tokens_in),0)::int as tokens_in, coalesce(sum(tokens_out),0)::int as tokens_out
         from ai_usage where family_id = $1 group by 1 order by cost desc limit 8`,
      [fam]
    ).catch(() => ({ rows: [] }));
    const byProvider = summary.byProvider || [];
    res.json({
      ...summary,
      limits: lim,
      monthSpend: mSpend,
      daySpend: dSpend,
      daily: bars.rows,
      byModel: byModel.rows,
      byProvider,
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
