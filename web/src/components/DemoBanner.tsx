// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep this. Only renders for demo families. Upgrades the family in place
// so courses and learners survive checkout. Nothing in demo is wiped.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";

export default function DemoBanner({ onKept }: { onKept?: () => void }) {
  const [isDemo, setIsDemo] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  const [googleName, setGoogleName] = useState("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ isDemo: boolean }>("/api/demo/me")
      .then((d) => { if (!cancelled) setIsDemo(Boolean(d.isDemo)); })
      .catch(() => { if (!cancelled) setIsDemo(false); });
    api<{ googleClientId?: string | null; googleEnabled?: boolean }>("/api/auth/config")
      .then((d) => {
        const cid = d.googleClientId ? String(d.googleClientId).trim() : "";
        if (!cancelled && cid) setGoogleClientId(cid);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || !googleClientId || typeof window === "undefined") return;
    const src = "https://accounts.google.com/gsi/client";
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    const load = existing ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true; s.defer = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error("gis_load_failed"));
      document.head.appendChild(s);
    });
    let cancelled = false;
    load.then(() => {
      if (cancelled) return;
      const g = (window as unknown as { google?: { accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } } } }).google;
      if (!g?.accounts?.id) return;
      const btn = document.getElementById("demo-google-btn");
      if (!btn) return;
      btn.innerHTML = "";
      g.accounts.id.initialize({
        client_id: googleClientId,
        callback: (resp: { credential?: string }) => {
          const cred = String(resp?.credential || "").trim();
          if (!cred) return;
          setGoogleCredential(cred);
          setMsg("");
          // Pull the email out of the JWT payload for display (no verify here, server does).
          try {
            const payload = JSON.parse(atob(cred.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
            if (payload?.email) setEmail(String(payload.email));
            if (payload?.name) setGoogleName(String(payload.name));
          } catch { /* ignore */ }
        },
        auto_select: false,
      } as never);
      g.accounts.id.renderButton(btn, {
        type: "standard", theme: "outline", size: "large", text: "continue_with", width: 320,
      } as never);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, googleClientId]);

  if (!isDemo) return null;

  async function upgrade() {
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = { familyName: familyName || undefined };
      if (googleCredential) {
        body.credential = googleCredential;
        if (email) body.email = email;
      } else {
        body.email = email;
        body.password = password;
      }
      await api("/api/demo/upgrade", { method: "POST", body });
      setOpen(false);
      setIsDemo(false);
      onKept?.();
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setMsg(niceError(e));
      setBusy(false);
    }
  }

  const canSave = googleCredential ? Boolean(email) : Boolean(email && password.length >= 8);

  return (
    <div className="demobanner" role="status" aria-live="polite">
      <div className="demobannerLeft">
        <span aria-hidden="true">🌱</span>
        <strong>Demo mode.</strong> Everything here is real and it is yours to keep. Nothing resets overnight.
      </div>
      <div className="demobannerActions">
        {!open ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary small-btn" type="button" onClick={() => setOpen(true)}>Keep this. Make it mine</button>
            <a className="btn ghost small-btn" href="#pricing">See pricing</a>
          </div>
        ) : (
          <div className="panel" style={{ minWidth: 320, maxWidth: 420, margin: 0, padding: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Make it yours</h3>
            <p className="hint" style={{ margin: "0 0 10px" }}>
              Pick an email and password, or continue with Google. Your courses, learners, and worlds stay exactly as they are.
            </p>
            {googleClientId && (
              <>
                <div id="demo-google-btn" style={{ minHeight: 40, display: "flex", justifyContent: "center", marginBottom: 8 }} />
                {googleCredential && <p className="hint" style={{ textAlign: "center", margin: "0 0 8px" }}>Google linked{googleName ? ` as ${googleName}` : ""}. Add a family name and save.</p>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span className="hint">or with email</span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="demo-email">Email</label>
              <input id="demo-email" className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (googleCredential) setGoogleCredential(null); }} placeholder="you@example.com" />
            </div>
            {!googleCredential && (
              <div className="field">
                <label htmlFor="demo-pass">Password</label>
                <input id="demo-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
            )}
            <div className="field">
              <label htmlFor="demo-family">Family name (optional)</label>
              <input id="demo-family" className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Alvarez Family" />
            </div>
            {msg && <p className="small" style={{ margin: "6px 0 0" }}>{msg}</p>}
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn primary" type="button" disabled={busy || !canSave} onClick={upgrade}>Save and keep everything</button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => { setOpen(false); setGoogleCredential(null); }}>Cancel</button>
            </div>
            <p className="hint" style={{ margin: "8px 0 0" }}>No card now. Self-host stays free. Cloud billing lands later.</p>
          </div>
        )}
      </div>
    </div>
  );
}
