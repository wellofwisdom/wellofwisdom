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
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ isDemo: boolean }>("/api/demo/me")
      .then((d) => { if (!cancelled) setIsDemo(Boolean(d.isDemo)); })
      .catch(() => { if (!cancelled) setIsDemo(false); });
    return () => { cancelled = true; };
  }, []);

  if (!isDemo) return null;

  async function upgrade() {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/demo/upgrade", { method: "POST", body: { email, password, familyName: familyName || undefined } });
      setOpen(false);
      setIsDemo(false);
      onKept?.();
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      setMsg(niceError(e));
      setBusy(false);
    }
  }

  return (
    <div className="demobanner" role="status" aria-live="polite">
      <div className="demobannerLeft">
        <span aria-hidden="true">🌱</span>
        <strong>Demo mode.</strong> Everything here is real and it is yours to keep. Nothing resets overnight.
      </div>
      <div className="demobannerActions">
        {!open ? (
          <button className="btn primary small-btn" type="button" onClick={() => setOpen(true)}>Keep this. Make it mine</button>
        ) : (
          <div className="panel" style={{ minWidth: 320, maxWidth: 420, margin: 0, padding: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Make it yours</h3>
            <p className="hint" style={{ margin: "0 0 10px" }}>
              Pick an email and password. Your courses, learners, and worlds stay exactly as they are.
            </p>
            <div className="field">
              <label htmlFor="demo-email">Email</label>
              <input id="demo-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="demo-pass">Password</label>
              <input id="demo-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="field">
              <label htmlFor="demo-family">Family name (optional)</label>
              <input id="demo-family" className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Alvarez Family" />
            </div>
            {msg && <p className="small" style={{ margin: "6px 0 0" }}>{msg}</p>}
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn primary" type="button" disabled={busy || !email || password.length < 8} onClick={upgrade}>Save and keep everything</button>
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <p className="hint" style={{ margin: "8px 0 0" }}>No card now. Self-host stays free. Cloud billing lands later.</p>
          </div>
        )}
      </div>
    </div>
  );
}
