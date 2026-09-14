// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings: family + join code, appearance (mode + backgrounds), AI status.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import type { HealthResponse, MeResponse } from "../types";
import { Panel, Field } from "../components/ui";
import { IconCheck, IconCopy } from "../components/Icons";
import { AiVault } from "../components/AiVault";
import { linkProps } from "../router";
import GuidesPanel from "../components/GuidesPanel";

interface MailStatus {
  configured: boolean;
  provider: string | null;
  from: string | null;
  source: string | null;
}

interface MailConfig {
  provider: string;
  from: string | null;
  resendKey?: string | null;
  sparkpostKey?: string | null;
  sesKey?: string | null;
  sesSecret?: string | null;
  sesRegion?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
}

interface MailPrefs {
  digest: boolean;
  digestEmail: string | null;
  defaultTo: string | null;
  reminders: boolean;
  learnerDigest: boolean;
  learnerReminders: boolean;
  learnersWithEmail: number;
}

const SKIP_REASON: Record<string, string> = {
  no_content: "nothing to report yet. No lessons, reviews or dates coming up",
  already_sent: "already got this week's note",
  no_email: "no email on their profile",
  disabled: "learner notes are turned off",
  no_learner_emails: "no learner has an email yet",
  no_family: "family not found",
};

function explainSkip(reason?: string) {
  return (reason && SKIP_REASON[reason]) || reason || "not sent";
}

function EmailPanel({ admin }: { admin: boolean }) {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [prefs, setPrefs] = useState<MailPrefs | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<MailStatus>("/api/mail/status").then(setStatus).catch(() => setStatus(null));
    api<MailPrefs>("/api/mail/prefs")
      .then((d) => { setPrefs(d); setEmailInput(d.digestEmail || d.defaultTo || ""); })
      .catch(() => setPrefs(null));
  };

  useEffect(() => { load(); }, []);

  async function testSend() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ ok?: boolean; error?: string }>("/api/mail/test", { method: "POST", body: { to: emailInput } });
      setMsg(r.ok ? "✅ Sent. Check the inbox (and spam folder the first time)." : `❌ ${r.error}`);
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(patch: Record<string, unknown>, note = "✓ Saved.") {
    setBusy(true);
    try {
      await api("/api/mail/prefs", { method: "PUT", body: { digestEmail: emailInput, ...patch } });
      setMsg(note);
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function learnerNotesNow() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ ok?: boolean; skipped?: string; results?: { learner: string; ok?: boolean; skipped?: string }[] }>(
        "/api/mail/learner-notes-now", { method: "POST" });
      if (r.results) {
        setMsg(r.results.map((x) => `${x.learner}: ${x.ok ? "sent ✅" : explainSkip(x.skipped)}`).join(" · "));
      } else {
        setMsg(explainSkip(r.skipped));
      }
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function digestNow() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ ok?: boolean; skipped?: string; error?: string }>("/api/mail/digest-now", { method: "POST" });
      setMsg(r.ok ? "✅ Digest sent." : `Not sent: ${explainSkip(r.skipped) || r.error}`);
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="muted small">Loading…</p>;

  return (
    <>
      <div className="checkitem">
        <span className="dot done" style={{ borderColor: status.configured ? "var(--good)" : "var(--border)", background: status.configured ? "var(--good)" : "transparent" }} />
        <span className="t">
          {status.configured
            ? `Email active via ${status.provider} (from ${status.from})${status.source === "settings" ? " · configured here" : " · from server env"}`
            : "Email not set up yet. Pick a provider below (or an admin can set env vars)."}
        </span>
      </div>
      {admin && <ProviderForm onSaved={load} />}
      {status.configured && (
        <>
          <div className="row" style={{ margin: "10px 0" }}>
            <input className="input grow" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com" aria-label="Digest email address" />
            {admin && <button className="btn" type="button" disabled={busy || !emailInput.includes("@")} onClick={testSend}>Send test</button>}
          </div>
          <div className="row wrap">
            <button className="btn primary" type="button" disabled={busy || !emailInput.includes("@")}
              onClick={() => savePrefs({ digestOn: true }, "✓ Saved. The weekly digest arrives Mondays.")}>Save & enable weekly digest</button>
            {prefs && prefs.digest && (
              <>
                <span className="chip on">✓ Weekly digest on</span>
                <button className="btn ghost" type="button" disabled={busy} onClick={digestNow}>Send now</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => savePrefs({ digestOn: false }, "Weekly digest turned off.")}>Turn off</button>
              </>
            )}
          </div>
        </>
      )}
      {status.configured && prefs && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 4px" }}>Learners' own mail</h4>
          <p className="hint" style={{ marginTop: 0 }}>
            {prefs.learnersWithEmail > 0
              ? `${prefs.learnersWithEmail} learner${prefs.learnersWithEmail === 1 ? " has" : "s have"} an email on their profile.`
              : "No learner has an email yet. Add one on a learner's profile to turn this on for them."}{" "}
            Email is never needed to sign in; adding one is how a learner opts in.
          </p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn ghost" type="button" disabled={busy}
              onClick={() => savePrefs(
                { learnerDigestOn: !prefs.learnerDigest },
                prefs.learnerDigest ? "Learner weekly notes turned off." : "✓ Learners get their own Monday note.")}>
              {prefs.learnerDigest ? "✓ Weekly note on" : "Weekly note off"}
            </button>
            <button className="btn ghost" type="button" disabled={busy}
              onClick={() => savePrefs(
                { learnerRemindersOn: !prefs.learnerReminders },
                prefs.learnerReminders ? "Learner event reminders turned off." : "✓ Learners get tomorrow-reminders too.")}>
              {prefs.learnerReminders ? "✓ Event reminders on" : "Event reminders off"}
            </button>
            {prefs.learnerDigest && prefs.learnersWithEmail > 0 && (
              <button className="btn ghost" type="button" disabled={busy} onClick={learnerNotesNow}>Send notes now</button>
            )}
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="hint" style={{ marginTop: 8 }}>
        The Monday digest summarizes each learner's week (lessons, accuracy, reviews due) and milestones coming up.
        Learners with an email get their own note the same morning: only their own work, never a sibling comparison.
      </p>
    </>
  );
}

function ProviderForm({ onSaved }: { onSaved: () => void }) {
  const [envFallback, setEnvFallback] = useState<Record<string, boolean> | null>(null);
  const [provider, setProvider] = useState("resend");
  const [from, setFrom] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [sparkpostKey, setSparkpostKey] = useState("");
  const [sesKey, setSesKey] = useState("");
  const [sesSecret, setSesSecret] = useState("");
  const [sesRegion, setSesRegion] = useState("us-east-1");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ config: MailConfig | null; envFallback: Record<string, boolean> }>("/api/mail/config")
      .then((d) => {
        setEnvFallback(d.envFallback);
        const c = d.config;
        if (c) {
          setProvider(c.provider);
          setFrom(c.from || "");
          setResendKey(c.resendKey || "");
          setSparkpostKey(c.sparkpostKey || "");
          setSesKey(c.sesKey || "");
          setSesSecret(c.sesSecret || "");
          setSesRegion(c.sesRegion || "us-east-1");
          setSmtpHost(c.smtpHost || "");
          setSmtpPort(String(c.smtpPort || 587));
          setSmtpUser(c.smtpUser || "");
          setSmtpPass(c.smtpPass || "");
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/mail/config", {
        method: "PUT",
        body: {
          provider, from, resendKey, sparkpostKey, sesKey, sesSecret, sesRegion,
          smtpHost, smtpPort: Number(smtpPort), smtpUser, smtpPass,
        },
      });
      setMsg("✓ Saved");
      onSaved();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{ margin: "8px 0 12px" }}>
      <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>
        ⚙️ Configure email service{envFallback && Object.values(envFallback).some(Boolean) ? " (server env also available)" : ""}
      </summary>
      <div style={{ marginTop: 10 }}>
        <Field label="Provider">
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="resend">Resend: easiest, generous free tier</option>
            <option value="sparkpost">SparkPost</option>
            <option value="ses">Amazon SES: cheapest at volume</option>
            <option value="smtp">SMTP: self-hosted (Mailcow, Postfix…)</option>
          </select>
        </Field>
        <Field label="From address" hint="e.g. Well of Wisdom <learn@yourdomain.com>. The domain must be verified with the provider.">
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Well of Wisdom <learn@yourdomain.com>" />
        </Field>
        {provider === "resend" && (
          <Field label="Resend API key">
            <input className="input" value={resendKey} onChange={(e) => setResendKey(e.target.value)}
              placeholder={/^•/.test(resendKey) ? "saved. Paste a new key to change it" : "re_…"} />
          </Field>
        )}
        {provider === "sparkpost" && (
          <Field label="SparkPost API key">
            <input className="input" value={sparkpostKey} onChange={(e) => setSparkpostKey(e.target.value)}
              placeholder={/^•/.test(sparkpostKey) ? "saved. Paste a new key to change it" : ""} />
          </Field>
        )}
        {provider === "ses" && (
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="Access key"><input className="input" value={sesKey} onChange={(e) => setSesKey(e.target.value)} /></Field></div>
            <div className="grow"><Field label="Secret key"><input className="input" type="password" value={sesSecret} onChange={(e) => setSesSecret(e.target.value)} placeholder={/^•/.test(sesSecret) ? "saved. Paste new to change" : ""} /></Field></div>
            <div style={{ maxWidth: 140 }}><Field label="Region"><input className="input" value={sesRegion} onChange={(e) => setSesRegion(e.target.value)} /></Field></div>
          </div>
        )}
        {provider === "smtp" && (
          <>
            <div className="row" style={{ gap: 12 }}>
              <div className="grow"><Field label="SMTP host"><input className="input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></Field></div>
              <div style={{ maxWidth: 110 }}><Field label="Port"><input className="input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></Field></div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div className="grow"><Field label="Username"><input className="input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></Field></div>
              <div className="grow"><Field label="Password"><input className="input" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={/^•/.test(smtpPass) ? "saved. Paste new to change" : ""} /></Field></div>
            </div>
          </>
        )}
        <div className="row">
          <button className="btn primary" type="button" disabled={busy || !from} onClick={save}>
            {busy ? "Saving…" : "Save provider"}
          </button>
          {msg && <span className="small">{msg}</span>}
        </div>
      </div>
    </details>
  );
}


interface MediaStatus {
  configured: boolean;
  canImage: boolean;
  canVideo: boolean;
  canCaption: boolean;
  imageProvider: string | null;
  videoProvider: string | null;
  source: string | null;
}

function MediaPanel() {
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [models, setModels] = useState<{ imageModels: { id: string; label: string }[]; videoModels: { id: string; label: string }[]; imageSizes: string[]; videoResolutions: string[]; videoDurations: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api<MediaStatus>("/api/media/status").then(setStatus).catch(() => setStatus(null));
    api<typeof cfg & { config: Record<string, string> } & typeof models>("/api/media/config")
      .then((d) => { setCfg(d.config || {}); setModels(d); })
      .catch(() => setCfg({}));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/media/config", { method: "PUT", body: cfg });
      setMsg("✓ Saved");
      load();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="muted small">Loading…</p>;

  return (
    <>
      <div className="checkitem">
        <span className="dot done" style={{ borderColor: status.canImage ? "var(--good)" : "var(--border)", background: status.canImage ? "var(--good)" : "transparent" }} />
        <span className="t">Images: {status.canImage ? `via ${status.imageProvider}` : "not configured"}</span>
      </div>
      <div className="checkitem">
        <span className="dot done" style={{ borderColor: status.canVideo ? "var(--good)" : "var(--border)", background: status.canVideo ? "var(--good)" : "transparent" }} />
        <span className="t">Videos: {status.canVideo ? "via kie.ai" : "not configured (needs a kie.ai key)"}</span>
      </div>
      <div className="checkitem">
        <span className="dot done" style={{ borderColor: status.canCaption ? "var(--good)" : "var(--border)", background: status.canCaption ? "var(--good)" : "transparent" }} />
        <span className="t">Auto-captions: {status.canCaption ? "via kie.ai (ElevenLabs Scribe)" : "needs a kie.ai key. You can still upload or type captions without it."}</span>
      </div>
      <details style={{ margin: "10px 0" }}>
        <summary className="small" style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>⚙️ Configure generators</summary>
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="kie.ai API key" hint="Powers Nano Banana images + Seedance/Veo videos."><input className="input" type="password" value={cfg?.kieKey || ""} onChange={(e) => set("kieKey", e.target.value)} placeholder={(cfg?.kieKey || "").startsWith("•") ? "saved. Paste new to change" : "kie.ai key"} /></Field></div>
            <div className="grow"><Field label="OpenAI API key (images alternative)"><input className="input" type="password" value={cfg?.openaiKey || ""} onChange={(e) => set("openaiKey", e.target.value)} placeholder={(cfg?.openaiKey || "").startsWith("•") ? "saved. Paste new to change" : "sk-…"} /></Field></div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="Image model">
              <select className="input" value={cfg?.imageModel || ""} onChange={(e) => { set("imageModel", e.target.value); set("imageProvider", e.target.value.startsWith("google") ? "kie" : "openai"); }}>
                {(models?.imageModels || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field></div>
            <div style={{ maxWidth: 140 }}><Field label="Image size">
              <select className="input" value={cfg?.imageSize || "1536x1024"} onChange={(e) => set("imageSize", e.target.value)}>
                {(models?.imageSizes || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field></div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Field label="Video model">
              <select className="input" value={cfg?.videoModel || ""} onChange={(e) => set("videoModel", e.target.value)}>
                {(models?.videoModels || []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field></div>
            <div><Field label="Resolution">
              <select className="input" value={cfg?.videoResolution || "720p"} onChange={(e) => set("videoResolution", e.target.value)}>
                {(models?.videoResolutions || []).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field></div>
            <div><Field label="Length (s)">
              <select className="input" value={String(cfg?.videoDuration || "5")} onChange={(e) => set("videoDuration", e.target.value)}>
                {(models?.videoDurations || []).map((d) => <option key={d} value={String(d)}>{d}</option>)}
              </select>
            </Field></div>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Auto-captions use your kie.ai key (ElevenLabs Scribe). No separate key needed: set the kie.ai key above and the Auto-generate button appears on each uploaded video.
          </p>
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            {msg && <span className="small">{msg}</span>}
          </div>
        </div>
      </details>
      <p className="hint">Images appear on course covers and adventure art. Videos play as course cutscenes. Auto-captions transcribe an uploaded video or audio file when you click Auto-generate on it. Everything respects your AI spend tracking.</p>
    </>
  );
}

function TokensPanel() {
  const [tokens, setTokens] = useState<{ id: number; name: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[] | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const ALL_SCOPES = ["read", "courses:write", "learners:read", "progress:read"] as const;

  const load = useCallback(() => {
    api<{ tokens: typeof tokens }>("/api/tokens").then((d) => setTokens(d.tokens as never)).catch(() => setTokens([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ token: string }>("/api/tokens", { method: "POST", body: { name, scopes } });
      setNewToken(r.token);
      setName("");
      load();
    } catch (e) { setMsg(niceError(e)); }
    finally { setBusy(false); }
  }

  async function revoke(id: number) {
    setBusy(true); setMsg("");
    try { await api(`/api/tokens/${id}`, { method: "DELETE" }); load(); }
    catch (e) { setMsg(niceError(e)); }
    finally { setBusy(false); }
  }

  if (tokens === null) return <p className="muted small">Loading…</p>;
  return (
    <>
      {newToken && (
        <div style={{ background: "var(--card)", border: "1px solid var(--good)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Copy this token now. It will not be shown again.</p>
          <code style={{ display: "block", margin: "8px 0", padding: 8, background: "var(--bg)", borderRadius: 6, wordBreak: "break-all", fontSize: 13 }}>{newToken}</code>
          <button className="btn" type="button" onClick={() => { navigator.clipboard?.writeText(newToken); setMsg("Copied"); }}>Copy</button>
          <button className="btn ghost" type="button" style={{ marginLeft: 8 }} onClick={() => setNewToken(null)}>Dismiss</button>
        </div>
      )}
      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
        <input className="input" style={{ maxWidth: 220 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name (e.g. Claude Desktop)" aria-label="Token name" />
        <span className="small muted" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {ALL_SCOPES.map((s) => (
            <label key={s} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))} /> {s}
            </label>
          ))}
        </span>
        <button className="btn primary" type="button" disabled={busy || !name.trim() || !scopes.length} onClick={create}>{busy ? "Creating…" : "Create token"}</button>
      </div>
      {tokens.length === 0 ? <p className="muted small">No tokens yet.</p> : tokens.map((t) => (
        <div key={t.id} className="checkitem">
          <span className="t"><strong>{t.name}</strong> <span className="muted small">· {t.scopes.join(", ")} · {new Date(t.createdAt).toLocaleDateString()}</span>{t.lastUsedAt && <span className="muted small"> · last used {new Date(t.lastUsedAt).toLocaleDateString()}</span>}{t.revokedAt && <span className="muted small"> · revoked</span>}</span>
          {!t.revokedAt && <button className="btn ghost" type="button" disabled={busy} onClick={() => revoke(t.id)}>Revoke</button>}
        </div>
      ))}
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
      <p className="hint" style={{ marginTop: 8 }}>Tokens start with <code>wow_</code> and act as you, limited to the scopes you pick. Use <code>Authorization: Bearer wow_...</code>. See docs/MCP.md for Claude Desktop setup.</p>
    </>
  );
}

function WaitlistPanel() {
  const [rows, setRows] = useState<{ email: string; interest: string; note: string | null; source: string | null; created_at: string }[] | null>(null);
  useEffect(() => {
    api<{ entries: typeof rows }>("/api/waitlist").then((d) => setRows(d.entries as never)).catch(() => setRows([]));
  }, []);
  if (rows === null) return <p className="muted small">Loading…</p>;
  if (!rows.length) return <p className="muted small">No signups yet. The form lives on the public site at #pricing.</p>;
  return (
    <>
      <p className="hint" style={{ marginBottom: 8 }}>{rows.length} signed up</p>
      {rows.slice(0, 50).map((r) => (
        <div key={r.email} className="checkitem"><span className="t">{r.email} <span className="muted small">· {r.interest}</span></span><span className="muted small">{new Date(r.created_at).toLocaleDateString()}</span></div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <a className="btn" href="/api/waitlist?format=csv">Download CSV</a>
      </div>
    </>
  );
}

export default function Settings({ me }: { me: MeResponse }) {
  const user = me.user!;
  const admin = Boolean(user.instanceAdmin);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<HealthResponse>("/api/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  const aiOn = health?.ai.configured ?? false;
  const dbOk = health?.db.configured ? health.db.ok !== false : false;

  return (
    <>
      <Panel title="Family" side="how your kids sign in">
        <Field label="Family name">
          <input className="input" defaultValue={user.familyName} readOnly />
        </Field>
        <Field label="Family code" hint="Learners use this code + their username + PIN.">
          <div className="row">
            <code className="k" style={{ fontSize: 18, letterSpacing: "0.2em", padding: "6px 14px" }}>
              {user.joinCode}
            </code>
            <button
              className="btn"
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(user.joinCode).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <IconCheck /> : <IconCopy />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Field>
      </Panel>

      <Panel title="Appearance" side="themes & colors">
        <p className="muted" style={{ marginBottom: 10 }}>
          Backgrounds, accent colors, dark mode, reading size: everything lives in one place now.
        </p>
        <a className="btn primary" {...linkProps("experience")}>🎨 Open Experience</a>
      </Panel>

      {admin && (
        <Panel title="AI media: images & videos" side="course covers, adventures, cutscenes">
          <MediaPanel />
        </Panel>
      )}

      <GuidesPanel learners={(me.learners || []).map((l) => ({ id: l.id, name: l.name }))} />

      <Panel title="Email & weekly digest" side="notifications">
        <EmailPanel admin={admin} />
      </Panel>

      {admin ? (
        <>
          <Panel title="AI: provider, models, keys & voice & music" side="one vault, every API">
            <AiVault />
          </Panel>

          <Panel title="Waitlist" side="hosted signups">
            <WaitlistPanel />
          </Panel>
        </>
      ) : (
        <Panel title="Server settings" side="AI, email, media">
          <p className="muted">The AI provider, email provider and media keys are shared by every family on this server, so only the person who runs it can change them.</p>
        </Panel>
      )}

      <Panel title="API tokens" side="for MCP and integrations">
        <TokensPanel />
      </Panel>

      <Panel title="Export your data" side="your family's zip">
        <p className="hint" style={{ marginTop: 0 }}>
          Download everything your family created: learners, plans, events, notes, resources, reports,
          attendance, assessments, badges, tutor threads, plus every course as a .wow-course.json file and all
          uploads. The zip re-imports its courses on any Well of Wisdom instance.
        </p>
        <a className="btn primary" href="/api/family/export" download>
          Download family export (.zip)
        </a>
      </Panel>

      <Panel title="System" side="this server">
        <div className="checkitem">
          <span className={`dot${dbOk ? " done" : ""}`} style={{ borderColor: dbOk ? "var(--good)" : "var(--border)" }} />
          <span className="t">Database {health?.db.configured ? (dbOk ? "connected" : "error. Check logs") : "not configured"}</span>
        </div>
        <div className="checkitem">
          <span className={`dot${aiOn ? " done" : ""}`} style={{ borderColor: aiOn ? "var(--good)" : "var(--border)" }} />
          <span className="t">
            AI {aiOn ? "connected" : "not configured"}: {" "}
            <a href="https://github.com/wellofwisdom/wellofwisdom#quick-start" target="_blank" rel="noreferrer">
              how to connect an AI provider
            </a>{" "}
            (works with free local models)
          </span>
        </div>
        <div className="checkitem">
          <span className="t muted">
            Version {health?.version || "…"} · AGPL-3.0 ·{" "}
            <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">
              source
            </a>
          </span>
        </div>
      </Panel>
    </>
  );
}
