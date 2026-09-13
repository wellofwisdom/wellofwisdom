// SPDX-License-Identifier: AGPL-3.0-or-later
// Monthly and daily spend caps. Uses ai_usage sums already kept per family.
// Limits live in server_settings key ai (aiMonthlyCap, aiDailyCap). 0 or
// absent means no limit. Check before enqueuing or calling AI, never inside
// grading or learning paths that must stay fail-open.
const db = require("./db");
const aiConfig = require("./aiConfig");

async function monthSpend(familyId) {
  const r = await db.query(
    `select coalesce(sum(cost),0) as s from ai_usage where family_id = $1 and created_at >= date_trunc('month', now())`,
    [familyId]
  );
  return Number(r.rows[0].s || 0);
}

async function daySpend(familyId) {
  const r = await db.query(
    `select coalesce(sum(cost),0) as s from ai_usage where family_id = $1 and created_at >= date_trunc('day', now())`,
    [familyId]
  );
  return Number(r.rows[0].s || 0);
}

async function limits() {
  const cfg = await aiConfig.resolveConfig();
  const monthly = cfg && cfg.aiMonthlyCap ? Number(cfg.aiMonthlyCap) : 0;
  const daily = cfg && cfg.aiDailyCap ? Number(cfg.aiDailyCap) : 0;
  return { monthly: monthly || 0, daily: daily || 0 };
}

async function checkFamily(familyId) {
  const lim = await limits();
  if (!lim.monthly && !lim.daily) return { ok: true, monthly: lim.monthly, daily: lim.daily, monthSpend: 0, daySpend: 0 };
  const m = lim.monthly ? await monthSpend(familyId) : 0;
  const d = lim.daily ? await daySpend(familyId) : 0;
  if (lim.monthly && m >= lim.monthly) return { ok: false, reason: "monthly_limit", monthly: lim.monthly, daily: lim.daily, monthSpend: m, daySpend: d };
  if (lim.daily && d >= lim.daily) return { ok: false, reason: "daily_limit", monthly: lim.monthly, daily: lim.daily, monthSpend: m, daySpend: d };
  return { ok: true, monthly: lim.monthly, daily: lim.daily, monthSpend: m, daySpend: d };
}

module.exports = { limits, checkFamily, monthSpend, daySpend };
