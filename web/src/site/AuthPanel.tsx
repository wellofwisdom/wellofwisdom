// SPDX-License-Identifier: AGPL-3.0-or-later
// Sign in, create a group, or sign in as a learner. Same endpoints and fields
// as before the redesign; only the frame changed.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import { linkProps } from "../router";
import { GoogleButton } from "../components/GoogleAuth";

type Tab = "signin" | "signup" | "learner";

export default function AuthPanel({ onAuthed, googleClientId, inviteRequired, initialTab = "signup" }: {
  onAuthed: () => void; googleClientId: string | null; inviteRequired: boolean; initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  async function submit(path: string, body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      await api(path, { method: "POST", body });
      onAuthed();
    } catch (err) {
      setError(niceError(err));
      setBusy(false);
    }
  }

  const tabs: [Tab, string][] = [["signup", "Create a group"], ["signin", "Guide sign in"], ["learner", "I'm a learner"]];

  return (
    <div className="s-auth">
      <div className="s-tabs" role="tablist" aria-label="How do you want to start?">
        {tabs.map(([id, label]) => (
          <button
            key={id} id={`s-tab-${id}`} className="s-tab" type="button" role="tab"
            aria-selected={tab === id} aria-controls="s-auth-panel"
            onClick={() => {
              setTab(id); setError("");
              requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("input")?.focus());
            }}
          >{label}</button>
        ))}
      </div>
      <div id="s-auth-panel" role="tabpanel" aria-labelledby={`s-tab-${tab}`} ref={panelRef}>
        {googleClientId && tab !== "learner" && (
          <>
            <GoogleButton clientId={googleClientId} onAuthed={onAuthed} onError={setError} label={tab === "signin" ? "signin_with" : "signup_with"} />
            <div className="s-or">or with email</div>
          </>
        )}
        {error && <div className="s-form-error" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{error}</div>}
        {tab === "signin" && <SignIn busy={busy} onSubmit={(b) => submit("/api/auth/login", b)} />}
        {tab === "signup" && <SignUp busy={busy} inviteRequired={inviteRequired} onSubmit={(b) => submit("/api/auth/signup", b)} />}
        {tab === "learner" && <LearnerIn busy={busy} onSubmit={(b) => submit("/api/auth/learner-login", b)} />}
      </div>
    </div>
  );
}

function SignIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ email, password }); }}>
      <label>Email<input className="s-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input className="s-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="s-btn s-btn-primary" disabled={busy} type="submit">{busy ? "Signing in" : "Sign in"}</button>
    </form>
  );
}

function SignUp({ busy, inviteRequired, onSubmit }: { busy: boolean; inviteRequired: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ familyName, name, email, password, inviteCode }); }}>
      {inviteRequired && (
        <label>Invite code
          <input className="s-input" required autoCapitalize="characters" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <span className="s-help">This server is invite-only. Ask the person who runs it.</span>
        </label>
      )}
      <label>Group name
        <input className="s-input" required maxLength={80} placeholder="The Rivera family, Room 12, Riverside Co-op" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
        <span className="s-help">Your family, class, co-op or tutoring group. Learners sign in with its code.</span>
      </label>
      <label>Your name<input className="s-input" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Email<input className="s-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password
        <input className="s-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="s-help">At least 8 characters.</span>
      </label>
      <button className="s-btn s-btn-primary" disabled={busy} type="submit">{busy ? "Creating your group" : "Create group"}</button>
      <span className="s-help" style={{ textAlign: "center" }}>
        By creating a group you agree to the <a {...linkProps("terms")}>Terms</a> and <a {...linkProps("privacy")}>Privacy Policy</a>, and how we handle <a {...linkProps("children")}>children's data</a>.
      </span>
    </form>
  );
}

function LearnerIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ joinCode, username, pin }); }}>
      <label>Group code
        <input className="s-input" required maxLength={6} placeholder="ABC123" autoCapitalize="characters" style={{ textTransform: "uppercase", letterSpacing: ".15em" }} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <span className="s-help">Your parent or teacher has it.</span>
      </label>
      <label>Username<input className="s-input" required autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label>PIN<input className="s-input" type="password" inputMode="numeric" required pattern="\d{4,6}" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      <button className="s-btn s-btn-primary" disabled={busy} type="submit">{busy ? "Signing in" : "Start learning"}</button>
    </form>
  );
}
