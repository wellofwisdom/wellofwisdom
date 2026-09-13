// SPDX-License-Identifier: AGPL-3.0-or-later
// One vault for every API this app touches. Providers + models + vision +
// kie image/video + voice + music + vision + prices + limits, plus spend.
// One save for the top vault (mirrors to media), one save for limits, one
// honest chart. Secrets are never shown in full: masked last 4, paste to
// replace.
import { useEffect, useMemo, useState } from "react";
import { api, niceError } from "../api";
import { Field, Panel, StatBar } from "./ui";

interface AiConfig {
  aiProvider?: string | null;
  aiBaseUrl?: string | null;
  aiApiKey?: string | null;
  aiModelPro?: string | null;
  aiModelFlash?: string | null;
  aiVisionModel?: string | null;
  aiPrices?: Record<string, [number, number]> | null;
  kieKey?: string | null;
  openaiKey?: string | null;
  googleTtsOnKie?: string | null;
  sunoMusicOnKie?: string | null;
  aiMonthlyCap?: number | null;
  aiDailyCap?: number | null;
}

interface Spend {
  month: { calls: number; tokens_in: number; tokens_out: number; cost: string | null };
  byTask: { task: string; calls: number; cost: string | null }[];
  recent: { task: string; model: string | null; tokens_in: number; tokens_out: number; cost: string | null; created_at: string }[];
  daily: { day: string; cost: string | null; calls: number; tokens_in: number; tokens_out: number }[];
  byModel: { model: string; calls: number; cost: string | null; tokens_in: number; tokens_out: number }[];
  limits: { monthly: number; daily: number };
  monthSpend: number;
  daySpend: number;
}

function isMasked(v?: string | null) {
  return typeof v === "string" && v.startsWith("•••••");
}

function BarChart({ daily }: { daily: Spend["daily"] }) {
  const max = Math.max(0.001, ...daily.map((d) => Number(d.cost || 0)));
  if (!daily.length) return <p className="muted small">No spend yet.</p>;
  return (
    <div className="aivault-bars" role="img" aria-label="Daily spend">
      {daily.map((d) => {
        const c = Number(d.cost || 0);
        const h = Math.max(2, Math.round((c / max) * 48));
        return (
          <div key={String(d.day).slice(0, 10)} className="aivault-barwrap">
            <span className="aivault-bar" style={{ height: h }} title={`${String(d.day).slice(0, 10)}: $${c.toFixed(3)} · ${d.calls} calls`} />
            <span className="aivault-day">{String(d.day).slice(5, 10).replace("-", "/")}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AiVault() {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = () => {
    api<{ config: AiConfig | null }>("/api/ai/config")
      .then((r) => setCfg(r.config || {} as AiConfig))
      .catch(() => setCfg({} as AiConfig));
    api<Spend>("/api/ai/spend").then(setSpend).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const set = (k: keyof AiConfig, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v } as AiConfig));

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      // Prices: accept JSON string or object. Normalize here so the vault round-trips.
      const body: Record<string, unknown> = { ...(cfg || {}) };
      if (typeof body.aiPrices === "string") {
        const s = String(body.aiPrices).trim();
        body.aiPrices = s ? JSON.parse(s) : null;
      }
      await api("/api/ai/config", { method: "PUT", body });
      setMsg("✓ Saved. The app now uses these settings.");
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally { setBusy(false); }
  };

  const saveLimits = async () => {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/ai/limits", {
        method: "PUT",
        body: { aiMonthlyCap: cfg?.aiMonthlyCap, aiDailyCap: cfg?.aiDailyCap },
      });
      setMsg("✓ Limits saved.");
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally { setBusy(false); }
  };

  const monthCost = useMemo(() => Number(spend?.month.cost || 0), [spend]);
  const monthCalls = spend?.month.calls ?? 0;

  if (cfg === null) return <p className="muted small">Loading…</p>;

  return (
    <>
      <div className="checkitem">
        <span className="dot done" style={{ borderColor: monthCost || monthCalls ? "var(--good)" : "var(--border)", background: monthCost || monthCalls ? "var(--good)" : "transparent" }} />
        <span className="t">
          {monthCalls ? `${monthCalls} calls this month · $${monthCost.toFixed(3)}` : "No AI calls yet. Set the provider below, then generate a course."}
        </span>
      </div>

      <Field label="Provider" hint="OpenAI-compatible is the default (DeepSeek, OpenAI, Ollama).">
        <select className="input" value={cfg.aiProvider || ""} onChange={(e) => set("aiProvider", e.target.value)}>
          <option value="">auto (OpenAI-compatible) · aiApiKey flows through OpenAI path unless provider says otherwise</option>
          <option value="openai">openai · OpenAI-compatible (DeepSeek, OpenAI, LM Studio)</option>
          <option value="anthropic">anthropic · Claude on api.anthropic.com</option>
          <option value="gemini">gemini · Google GenAI</option>
        </select>
      </Field>

      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><Field label="AI base URL" hint="Ollama: http://localhost:11434/v1 · DeepSeek: https://api.deepseek.com/v1 · Claude: https://api.anthropic.com · Gemini: https://generativelanguage.googleapis.com"><input className="input" value={cfg.aiBaseUrl || ""} onChange={(e) => set("aiBaseUrl", e.target.value)} placeholder="https://api.openai.com/v1" /></Field></div>
        <div className="grow"><Field label="AI API key" hint="Claude or Gemini need this. OpenAI-compat can also use a bearer key."><input className="input" type={isMasked(cfg.aiApiKey || "") ? "text" : "password"} value={cfg.aiApiKey || ""} onChange={(e) => set("aiApiKey", e.target.value)} placeholder={isMasked(cfg.aiApiKey || "") ? "saved. Paste new to change" : "sk-ant-… or sk-…"} /></Field></div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><Field label="Model · pro (course generation)" hint="Quality tier. e.g. claude-sonnet-4-5, gemini-1.5-pro, gpt-4o, deepseek-chat"><input className="input" value={cfg.aiModelPro || ""} onChange={(e) => set("aiModelPro", e.target.value)} placeholder="gpt-4o-mini" /></Field></div>
        <div className="grow"><Field label="Model · flash (tutor, hints)" hint="Speed tier. e.g. claude-haiku-4-5, gemini-1.5-flash"><input className="input" value={cfg.aiModelFlash || ""} onChange={(e) => set("aiModelFlash", e.target.value)} placeholder="gpt-4o-mini" /></Field></div>
      </div>

      <Field label="Vision model (photo to worksheet)" hint="Needs the same provider as above. OpenAI: gpt-4o-mini · Claude: claude-sonnet-4-5 · Gemini: gemini-2.0-flash · Ollama: llava">
        <input className="input" value={cfg.aiVisionModel || ""} onChange={(e) => set("aiVisionModel", e.target.value)} placeholder="leave empty to keep paste-only import" />
      </Field>

      <details style={{ margin: "10px 0" }}>
        <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>kie.ai + voice + music (share one key)</summary>
        <div style={{ marginTop: 10 }}>
          <Field label="kie.ai API key" hint="Powers Nano Banana images, Seedance or Veo video, Gemini TTS, Suno music. One bill.">
            <input className="input" type={isMasked(cfg.kieKey || "") ? "text" : "password"} value={cfg.kieKey || ""} onChange={(e) => set("kieKey", e.target.value)} placeholder={isMasked(cfg.kieKey || "") ? "saved. Paste new to change" : "kie key"} />
          </Field>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="OpenAI key (images alternative)"><input className="input" type={isMasked(cfg.openaiKey || "") ? "text" : "password"} value={cfg.openaiKey || ""} onChange={(e) => set("openaiKey", e.target.value)} placeholder={isMasked(cfg.openaiKey || "") ? "saved. Paste new to change" : "sk-…"} /></Field></div>
            <div className="grow"><Field label="Voice model (Gemini TTS on kie)"><input className="input" value={cfg.googleTtsOnKie || ""} onChange={(e) => set("googleTtsOnKie", e.target.value)} placeholder="gemini-3.1-flash-tts" /></Field></div>
          </div>
          <Field label="Music model (Suno on kie)" hint="$0.06 per loop, one per chapter, cached."><input className="input" value={cfg.sunoMusicOnKie || ""} onChange={(e) => set("sunoMusicOnKie", e.target.value)} placeholder="suno-generate-music" /></Field>
        </div>
      </details>

      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save AI settings"}</button>
        {msg && <span className="small">{msg}</span>}
      </div>

      <Panel title="Spend" side="this family, real costs">
        {spend ? (
          <>
            <StatBar
              stats={[
                { label: "This month", value: `$${Number(spend.monthSpend || monthCost).toFixed(3)}` },
                { label: "Today", value: `$${Number(spend.daySpend || 0).toFixed(3)}` },
                { label: "Calls (month)", value: spend.month.calls },
                { label: "Tokens", value: `${spend.month.tokens_in.toLocaleString()} in · ${spend.month.tokens_out.toLocaleString()} out` },
              ]}
            />
            <BarChart daily={spend.daily} />
            <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
              <span className="muted small">By task</span>
              {spend.byTask.slice(0, 6).map((t) => (
                <span key={t.task} className="chip">{t.task} · ${Number(t.cost || 0).toFixed(3)} · {t.calls}</span>
              ))}
            </div>
            {spend.byModel.length > 0 && (
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <span className="muted small">By model</span>
                {spend.byModel.map((m) => (
                  <span key={m.model} className="chip">{m.model} · ${Number(m.cost || 0).toFixed(3)} · {m.calls}</span>
                ))}
              </div>
            )}
            {spend.recent.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small" style={{ cursor: "pointer" }}>Recent calls</summary>
                <div style={{ marginTop: 8 }}>
                  {spend.recent.slice(0, 8).map((r, i) => (
                    <div key={i} className="checkitem"><span className="t">{r.task} · {r.model || "unknown"} · {r.tokens_in}+{r.tokens_out} tok · ${Number(r.cost || 0).toFixed(4)}</span><span className="muted small">{new Date(r.created_at).toLocaleDateString()}</span></div>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="muted small">Loading spend…</p>
        )}
      </Panel>

      <Panel title="Limits" side="caps that actually stop generation">
        <p className="hint" style={{ marginTop: 0 }}>0 means no limit. Limits are checked before any AI call (course generation, tutor, worksheet OCR, rubric grading). Grading and learning paths stay fail-open, they are not capped.</p>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><Field label="Monthly cap (USD)" hint="Applies to ai_usage cost sum for this month."><input className="input" type="number" min="0" step="0.5" value={String(cfg.aiMonthlyCap ?? "")} onChange={(e) => set("aiMonthlyCap", e.target.value)} placeholder="e.g. 20" /></Field></div>
          <div className="grow"><Field label="Daily cap (USD)"><input className="input" type="number" min="0" step="0.5" value={String(cfg.aiDailyCap ?? "")} onChange={(e) => set("aiDailyCap", e.target.value)} placeholder="e.g. 5" /></Field></div>
        </div>
        {spend && (Number(spend.limits?.monthly || 0) > 0 || Number(spend.limits?.daily || 0) > 0) && (
          <p className="muted small">
            Current: {spend.limits.monthly ? `$${spend.limits.monthly}/mo` : "no monthly cap"} · {spend.limits.daily ? `$${spend.limits.daily}/day` : "no daily cap"}
            {" · "}spent ${Number(spend.monthSpend || 0).toFixed(3)} this month, ${Number(spend.daySpend || 0).toFixed(3)} today
          </p>
        )}
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={saveLimits}>{busy ? "Saving…" : "Save limits"}</button>
          {msg && <span className="small">{msg}</span>}
        </div>
      </Panel>

      <details style={{ marginTop: 12 }}>
        <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }} onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? "Hide" : "Show"} advanced (prices, raw config)</summary>
        <div style={{ marginTop: 10 }}>
          <Field label="AI prices (per 1M tokens, JSON)" hint='Override per-model prices: {"deepseek-chat":[0.14,0.28]}. Leave empty to use built-ins for deepseek and gpt-4o family.'>
            <textarea className="input" rows={3} value={cfg.aiPrices ? JSON.stringify(cfg.aiPrices, null, 2) : ""} onChange={(e) => set("aiPrices", e.target.value as unknown as string)} placeholder='{"deepseek-chat":[0.14,0.28],"gpt-4o-mini":[0.15,0.6]}' />
          </Field>
          <p className="hint">Unknown models cost $0 until you set a price here. The app never invents a cost.</p>
        </div>
      </details>
    </>
  );
}
