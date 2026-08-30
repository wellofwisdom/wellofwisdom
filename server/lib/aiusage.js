// SPDX-License-Identifier: AGPL-3.0-or-later
// AI usage accounting: per-family token + cost log. Fail-open by design —
// a logging problem must never take learning features down.
const db = require("./db");

// Per-1M-token prices [in, out] by model; override anything via AI_PRICES env
// JSON: {"deepseek-chat":[0.14,0.28]}. Unknown models cost 0 (flagged null).
const DEFAULT_PRICES = {
  "deepseek-chat": [0.14, 0.28],
  "deepseek-v4-flash": [0.14, 0.28],
  "deepseek-v4-pro": [0.44, 1.58],
  "deepseek-reasoner": [0.44, 1.58],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
};

function prices() {
  if (!process.env.AI_PRICES) return DEFAULT_PRICES;
  try {
    return { ...DEFAULT_PRICES, ...JSON.parse(process.env.AI_PRICES) };
  } catch {
    return DEFAULT_PRICES;
  }
}

function estimateCost(model, tokensIn, tokensOut) {
  const m = String(model || "");
  const all = prices();
  // exact match first, then prefix (providers report versions like deepseek-v4-flash)
  const key = all[m] ? m : Object.keys(all).find((k) => m.startsWith(k));
  const p = key && all[key];
  if (!p || !tokensIn || !tokensOut) return null;
  return Number(((tokensIn / 1e6) * p[0] + (tokensOut / 1e6) * p[1]).toFixed(6));
}

/** Fire-and-forget usage log. Never throws. */
function logUsage({ familyId, task, model, tokensIn, tokensOut, note }) {
  if (!db.configured()) return;
  db.query(
    `insert into ai_usage (family_id, task, model, tokens_in, tokens_out, cost, note)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      familyId || null,
      String(task || "unknown").slice(0, 50),
      model ? String(model).slice(0, 80) : null,
      Number(tokensIn) || 0,
      Number(tokensOut) || 0,
      estimateCost(model, Number(tokensIn) || 0, Number(tokensOut) || 0),
      note ? String(note).slice(0, 200) : null,
    ]
  ).catch((err) => console.error(`[aiusage] log failed (ignored): ${err.message}`));
}

async function familySummary(familyId) {
  const totals = await db.query(
    `select count(*)::int as calls,
            coalesce(sum(tokens_in),0)::int as tokens_in,
            coalesce(sum(tokens_out),0)::int as tokens_out,
            coalesce(sum(cost),0) as cost
       from ai_usage
      where family_id = $1 and created_at >= date_trunc('month', now())`,
    [familyId]
  );
  const byTask = await db.query(
    `select task, count(*)::int as calls, coalesce(sum(cost),0) as cost
       from ai_usage
      where family_id = $1 and created_at >= date_trunc('month', now())
      group by task order by cost desc`,
    [familyId]
  );
  const recent = await db.query(
    `select task, model, tokens_in, tokens_out, cost, created_at
       from ai_usage where family_id = $1 order by id desc limit 15`,
    [familyId]
  );
  return { month: totals.rows[0], byTask: byTask.rows, recent: recent.rows };
}

module.exports = { logUsage, familySummary, estimateCost };
