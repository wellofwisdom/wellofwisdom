// SPDX-License-Identifier: AGPL-3.0-or-later
// Accepting an invite. Runs logged out, so it sits alongside the landing page
// rather than behind the console.
//
// The page tells them what they are joining and what the role actually means
// before asking for a password. Someone invited as an observer should know
// they are an observer.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { go } from "../router";

export default function Join({ token }: { token: string }) {
  const [invite, setInvite] = useState<{ family_name: string; guide_role: string; note: string | null } | null>(null);
  const [role, setRole] = useState<{ label: string; blurb: string } | null>(null);
  const [dead, setDead] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ invite: typeof invite; role: typeof role }>(`/api/guides/invites/peek/${encodeURIComponent(token)}`)
      .then((d) => { setInvite(d.invite); setRole(d.role); })
      .catch(() => setDead(true));
  }, [token]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/join", { method: "POST", body: { token, name, email, password } });
      go("dashboard");
      window.location.reload(); // pick up the new session everywhere
    } catch (e) {
      const m = niceError(e);
      setError(
        m.includes("invite_invalid") ? "This link has already been used, or it expired. Ask for a new one."
        : m.includes("email_taken") ? "That email already has an account here. Sign in instead."
        : m.includes("password_too_short") ? "Use at least 8 characters."
        : m
      );
      setBusy(false);
    }
  }

  if (dead) {
    return (
      <div className="landing">
        <div className="lcard">
          <div style={{ fontSize: 34 }}>🌰</div>
          <h1>That invite is no longer good</h1>
          <p className="muted">
            Invites are single-use and expire after a week. Ask whoever sent it for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (!invite) return <div className="landing"><p className="muted">Checking that link…</p></div>;

  return (
    <div className="landing">
      <div className="lcard">
        <div style={{ fontSize: 34 }}>🌰</div>
        <h1>Join {invite.family_name}</h1>
        {role && (
          <p className="muted">
            You are being invited as a <b>{role.label}</b>. {role.blurb}
          </p>
        )}
        {invite.note && <p className="muted small">“{invite.note}”</p>}

        {error && <div className="formerror" role="alert">{error}</div>}

        <div className="field">
          <label htmlFor="j-name">Your name</label>
          <input id="j-name" className="input" value={name} maxLength={80} autoComplete="name"
            onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="j-email">Email</label>
          <input id="j-email" className="input" type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="j-pass">Password</label>
          <input id="j-pass" className="input" type="password" value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <div className="hint">At least 8 characters.</div>
        </div>

        <button className="btn primary big" type="button"
          disabled={busy || !name.trim() || !email.includes("@") || password.length < 8}
          onClick={submit}>
          {busy ? "Joining…" : `Join as ${role ? role.label.toLowerCase() : "a guide"}`}
        </button>
      </div>
    </div>
  );
}
