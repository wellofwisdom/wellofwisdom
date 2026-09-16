// SPDX-License-Identifier: AGPL-3.0-or-later
// One vault for every API this app touches. Providers + models + vision +
// kie image/video + voice + music + vision + prices + limits, plus spend.
// One save for the top vault (mirrors to media), one save for limits, one
// honest chart. Secrets are never shown in full: masked last 4, paste to
// replace. The provider vault and routing table live here too, so an admin
// can keep learner data on a no-training host and send open content elsewhere.
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

interface SttConfig {
  sttBaseUrl?: string | null;
  sttApiKey?: string | null;
  sttModel?: string | null;
  aiSttDailyCap?: number | null;
  sttKeepRecordings?: boolean | null;
}

interface Spend {
  month: { calls: number; tokens_in: number; tokens_out: number; cost: string | null };
  byTask: { task: string; calls: number; cost: string | null }[];
  byProvider?: { provider_id: string; calls: number; cost: string | null }[];
  recent: { task: string; model: string | null; tokens_in: number; tokens_out: number; cost: string | null; created_at: string }[];
  daily: { day: string; cost: string | null; calls: number; tokens_in: number; tokens_out: number }[];
  byModel: { model: string; calls: number; cost: string | null; tokens_in: number; tokens_out: number }[];
  limits: { monthly: number; daily: number };
  monthSpend: number;
  daySpend: number;
}

interface Provider {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string;
  trainsOnData: boolean;
  models: string[];
}

const TASK_KEYS = ["course-gen", "lesson-content", "exercise-gen", "lens", "tutor", "hint", "grading", "rubric", "translate", "stt"] as const;

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

function SpeechCard() {
  const [stt, setStt] = useState<SttConfig | null>(null);
  const [configured, setConfigured] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    api<{ configured: boolean; config: SttConfig }>("/api/stt/config")
      .then((r) => { setLocked(false); setStt(r.config || {}); setConfigured(Boolean(r.configured)); })
      .catch((e) => { setLocked((e as { status?: number }).status === 403); setStt({}); });
  };
  useEffect(() => { load(); }, []);

  const set = (k: keyof SttConfig, v: string | boolean) => setStt((c) => ({ ...(c || {}), [k]: v } as SttConfig));

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ configured: boolean }>("/api/stt/config", {
        method: "PUT",
        body: {
          sttBaseUrl: stt?.sttBaseUrl || "",
          sttApiKey: stt?.sttApiKey || "",
          sttModel: stt?.sttModel || "",
          aiSttDailyCap: stt?.aiSttDailyCap ?? 0,
          sttKeepRecordings: Boolean(stt?.sttKeepRecordings),
        },
      });
      setConfigured(Boolean(r.configured));
      setMsg("✓ Saved. The microphone appears in answer boxes and the tutor.");
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally { setBusy(false); }
  };

  if (stt === null) return <p className="muted small">Loading…</p>;
  if (locked) {
    return <p className="muted small">The speech endpoint and key are shared by every family on this server, so only the person who runs it can change them.</p>;
  }

  return (
    <>
      <Field label="Speech endpoint" hint="Any OpenAI-compatible /v1/audio/transcriptions. Groq: https://api.groq.com/openai/v1 · OpenAI: https://api.openai.com/v1 · your own faster-whisper: http://whisper:9000/v1. Empty turns speech off and hides the microphone.">
        <input className="input" value={stt.sttBaseUrl || ""} onChange={(e) => set("sttBaseUrl", e.target.value)} placeholder="https://api.groq.com/openai/v1" />
      </Field>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Field label="Speech API key" hint="Leave empty when the endpoint is the same host as the AI base URL above: that key is reused. A key for one provider is never sent to another provider's host.">
            <input className="input" type={isMasked(stt.sttApiKey || "") ? "text" : "password"} value={stt.sttApiKey || ""} onChange={(e) => set("sttApiKey", e.target.value)} placeholder={isMasked(stt.sttApiKey || "") ? "saved. Paste new to change" : "gsk_… or sk-…"} />
          </Field>
        </div>
        <div className="grow">
          <Field label="Speech model" hint="Groq: whisper-large-v3-turbo · OpenAI: whisper-1 · DeepInfra: openai/whisper-large-v3">
            <input className="input" value={stt.sttModel || ""} onChange={(e) => set("sttModel", e.target.value)} placeholder="whisper-1" />
          </Field>
        </div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Field label="Transcriptions per family per day" hint="0 means the money caps alone decide. Speech is cheap per call and easy to hold down by accident.">
            <input className="input" type="number" min="0" step="10" value={String(stt.aiSttDailyCap ?? "")} onChange={(e) => set("aiSttDailyCap", e.target.value as unknown as string)} placeholder="e.g. 200" />
          </Field>
        </div>
        <div className="grow">
          <Field label="Keep recordings" hint="Off: the audio exists only for the one request that transcribed it, nothing is written to disk. A family can override this for itself.">
            <label className="row small" style={{ gap: 8, marginTop: 6 }}>
              <input type="checkbox" checked={Boolean(stt.sttKeepRecordings)} onChange={(e) => set("sttKeepRecordings", e.target.checked)} />
              Save each recording to the family's media library
            </label>
          </Field>
        </div>
      </div>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save speech settings"}</button>
        <span className={`chip${configured ? " on" : ""}`}>{configured ? "speech input on" : "speech input off"}</span>
        {msg && <span className="small">{msg}</span>}
      </div>
      <p className="hint">Voice answers are priced per minute by every provider, so speech calls show in the spend list with a call count and no invented cost.</p>
    </>
  );
}

function ProvidersCard() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [routes, setRoutes] = useState<Record<string, { providerId: string; model: string | null }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draft, setDraft] = useState<Provider>({ id: "", name: "", kind: "openai-compatible", baseUrl: "", apiKey: "", trainsOnData: false, models: [] });

  const load = () => {
    api<{ providers: Provider[]; routes: typeof routes }>("/api/ai/providers")
      .then((r) => { setProviders(r.providers || []); setRoutes(r.routes || {}); })
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditing(null);
    setDraft({ id: "", name: "", kind: "openai-compatible", baseUrl: "", apiKey: "", trainsOnData: false, models: [] });
  };
  const startEdit = (p: Provider) => {
    setEditing(p);
    setDraft({ ...p, models: [...(p.models || [])] });
  };

  const saveProviders = async (nextProviders: Provider[], nextRoutes: typeof routes) => {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/ai/providers", { method: "PUT", body: { providers: nextProviders, routes: nextRoutes } });
      setMsg("✓ Saved.");
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    const id = draft.id.trim();
    const name = draft.name.trim() || id;
    if (!id || !/^[a-z0-9_-]+$/i.test(id)) { setMsg("Provider id must be letters, numbers, dash or underscore."); return; }
    const baseUrl = draft.baseUrl.trim();
    if (baseUrl) { try { const u = new URL(baseUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad"); } catch { setMsg("Provider URL must be http or https."); return; } }
    const entry: Provider = { ...draft, id, name, baseUrl, models: draft.models.map((m) => m.trim()).filter(Boolean).slice(0, 20) };
    let next: Provider[];
    if (editing) next = providers.map((p) => p.id === editing.id ? entry : p);
    else {
      if (providers.some((p) => p.id === id)) { setMsg("That provider id already exists."); return; }
      next = [...providers, entry];
    }
    await saveProviders(next, routes);
    setEditing(null);
    setDraft({ id: "", name: "", kind: "openai-compatible", baseUrl: "", apiKey: "", trainsOnData: false, models: [] });
  };

  const remove = async (id: string) => {
    const next = providers.filter((p) => p.id !== id);
    const nextRoutes = { ...routes };
    for (const [k, v] of Object.entries(nextRoutes)) if (v.providerId === id) delete nextRoutes[k];
    await saveProviders(next, nextRoutes);
  };

  const setRoute = (task: string, providerId: string, model: string) => {
    const nr = { ...routes };
    if (!providerId) delete nr[task];
    else nr[task] = { providerId, model: model.trim() || null };
    setRoutes(nr);
  };

  const saveRoutes = async () => {
    await saveProviders(providers, routes);
  };

  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        Add providers once, then route each task to the right one. Providers marked as trains on data are never used for learner data: tutor, hints, grading, rubrics, and any prompt with a learner's name, notes or interests fall back to the default provider and log a warning.
        Course generation may use a trains-on-data provider only when the course has no learner attached and is marked for open publishing.
      </p>

      <div style={{ marginBottom: 12 }}>
        {providers.length === 0 ? <p className="muted small">No extra providers yet. The default provider above is used for every task.</p> : null}
        {providers.map((p) => (
          <div key={p.id} className="checkitem" style={{ gap: 8 }}>
            <span className="t"><strong>{p.name}</strong> <span className="muted small">· {p.id} · {p.kind}</span>{p.trainsOnData ? <span className="chip" style={{ marginLeft: 6 }}>trains on data</span> : <span className="chip" style={{ marginLeft: 6 }}>no training</span>}{p.baseUrl ? <span className="muted small"> · {p.baseUrl}</span> : null}</span>
            <button className="btn ghost" type="button" onClick={() => startEdit(p)}>Edit</button>
            <button className="btn ghost" type="button" onClick={() => remove(p.id)}>Remove</button>
          </div>
        ))}
      </div>

      <details open={editing !== null || providers.length === 0} style={{ marginBottom: 12 }}>
        <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>{editing ? `Edit ${editing.id}` : "Add a provider"}</summary>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="Provider id" hint="Letters, numbers, dash or underscore. Used in the routing table."><input className="input" value={draft.id} onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))} placeholder="deepseek-main" disabled={Boolean(editing)} /></Field></div>
            <div className="grow"><Field label="Name"><input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="DeepSeek main" /></Field></div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="Kind"><select className="input" value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}><option value="openai-compatible">openai-compatible</option><option value="openai">openai</option><option value="anthropic">anthropic</option><option value="gemini">gemini</option></select></Field></div>
            <div className="grow"><Field label="Base URL"><input className="input" value={draft.baseUrl} onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} placeholder="https://api.deepseek.com/v1" /></Field></div>
          </div>
          <Field label="API key" hint="Stored in the vault. Reads come back masked."><input className="input" type={isMasked(draft.apiKey) ? "text" : "password"} value={draft.apiKey} onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))} placeholder={isMasked(draft.apiKey) ? "saved. Paste new to change" : "sk-…"} /></Field>
          <Field label="Models (comma separated)" hint="Used when a route sets no model: first for pro tasks, second for flash."><input className="input" value={draft.models.join(", ")} onChange={(e) => setDraft((d) => ({ ...d, models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} placeholder="deepseek-chat, deepseek-reasoner" /></Field>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={draft.trainsOnData} onChange={(e) => setDraft((d) => ({ ...d, trainsOnData: e.target.checked }))} /> This provider trains on data</label>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={saveDraft}>{busy ? "Saving…" : editing ? "Save provider" : "Add provider"}</button>
            {editing && <button className="btn" type="button" onClick={() => { setEditing(null); setDraft({ id: "", name: "", kind: "openai-compatible", baseUrl: "", apiKey: "", trainsOnData: false, models: [] }); }}>Cancel</button>}
            {!editing && <button className="btn" type="button" onClick={startNew}>Clear</button>}
          </div>
        </div>
      </details>

      {providers.length > 0 && (
        <>
          <h4 style={{ margin: "12px 0 8px" }}>Task routing</h4>
          <p className="hint" style={{ marginTop: 0 }}>Pick a provider and model per task. Empty means use the default provider above. The rule for learner data is shown at the top and enforced on the server.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {TASK_KEYS.map((task) => (
              <div key={task} className="row" style={{ gap: 8, alignItems: "flex-end" }}>
                <div style={{ minWidth: 140 }}><span className="small" style={{ fontWeight: 600 }}>{task}</span></div>
                <select className="input" style={{ maxWidth: 220 }} value={routes[task]?.providerId || ""} onChange={(e) => setRoute(task, e.target.value, routes[task]?.model || "")}>
                  <option value="">default</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
                <input className="input" style={{ flex: 1 }} value={routes[task]?.model || ""} onChange={(e) => setRoute(task, routes[task]?.providerId || "", e.target.value)} placeholder="model override, or empty" />
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" type="button" disabled={busy} onClick={saveRoutes}>{busy ? "Saving…" : "Save routing"}</button>
            {msg && <span className="small">{msg}</span>}
          </div>
        </>
      )}
      {msg && providers.length === 0 && <p className="small">{msg}</p>}
    </>
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

      <Panel title="Providers and task routing" side="per-task providers; learner data stays on no-training hosts">
        <ProvidersCard />
      </Panel>

      <details style={{ margin: "10px 0" }}>
        <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>Speech input (a learner talks instead of typing)</summary>
        <div style={{ marginTop: 10 }}>
          <SpeechCard />
        </div>
      </details>

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
            {spend.byProvider && spend.byProvider.length > 0 && (
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <span className="muted small">By provider</span>
                {spend.byProvider.map((p) => (
                  <span key={p.provider_id} className="chip">{p.provider_id} · ${Number(p.cost || 0).toFixed(3)} · {p.calls}</span>
                ))}
              </div>
            )}
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
