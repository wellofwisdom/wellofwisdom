// SPDX-License-Identifier: AGPL-3.0-or-later
// Logged-out screen: hero + parent sign-in / create family / learner sign-in.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { PillTabs } from "../components/ui";

type Tab = "signin" | "signup" | "learner";

export default function Landing({ onAuthed }: { onAuthed: () => void }) {
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);

  useEffect(() => {
    api<{ inviteRequired: boolean }>("/api/auth/config")
      .then((d) => setInviteRequired(Boolean(d.inviteRequired)))
      .catch(() => setInviteRequired(false));
  }, []);

  async function submit(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST", body });
      onAuthed();
    } catch (err) {
      setError(niceError(err));
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <div className="nutbig" aria-hidden="true">🌰</div>
      <h1>Well of Wisdom</h1>
      <p className="tag">
        Self-hosted, AI-first learning. Your server, your curriculum — for homeschools,
        classrooms, co-ops, and self-learners.
      </p>

      <div className="herofeats">
        <div className="herofeat">
          <span className="fi" aria-hidden="true">✨</span>
          <strong>AI builds the course</strong>
          <span className="hs">Any topic, any level, in minutes</span>
        </div>
        <div className="herofeat">
          <span className="fi" aria-hidden="true">🧵</span>
          <strong>Learn through what you love</strong>
          <span className="hs">Fractions through sewing. Physics through skateboarding.</span>
        </div>
        <div className="herofeat">
          <span className="fi" aria-hidden="true">🔒</span>
          <strong>Your server, your data</strong>
          <span className="hs">Open source. Works fully offline.</span>
        </div>
      </div>

      <div className="authcard">
        <PillTabs
          ariaLabel="Sign in type"
          tabs={[
            { id: "signin", label: "Guide sign in" },
            { id: "signup", label: "Create your group" },
            { id: "learner", label: "I'm a learner" },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="panel">
          {error && <div className="formerror" role="alert">{error}</div>}

          {tab === "signin" && <SignIn busy={busy} onSubmit={(b) => submit("/api/auth/login", b)} />}
          {tab === "signup" && <SignUp busy={busy} inviteRequired={inviteRequired} onSubmit={(b) => submit("/api/auth/signup", b)} />}
          {tab === "learner" && (
            <LearnerIn busy={busy} onSubmit={(b) => submit("/api/auth/learner-login", b)} />
          )}
        </div>
      </div>

      <p className="foot">
        Free and open source (AGPL-3.0) ·{" "}
        <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </div>
  );
}

function SignIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ email, password });
      }}
    >
      <div className="field">
        <label htmlFor="si-email">Email</label>
        <input id="si-email" className="input" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="si-pass">Password</label>
        <input id="si-pass" className="input" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ familyName, name, email, password, inviteCode });
      }}
    >
      {inviteRequired && (
        <div className="field">
          <label htmlFor="su-invite">Invite code</label>
          <input id="su-invite" className="input" required autoCapitalize="characters"
            value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <div className="hint">This server is invite-only. Ask the person who runs it.</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="su-family">Group name</label>
        <input id="su-family" className="input" required maxLength={80} placeholder="The Treman Family, Chem Co-op, Ms. Rivera's class"
          value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
        <div className="hint">Your family, class, or co-op. You'll get a join code your learners use to sign in.</div>
      </div>
      <div className="field">
        <label htmlFor="su-name">Your name</label>
        <input id="su-name" className="input" autoComplete="name" required maxLength={80} value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="su-email">Email</label>
        <input id="su-email" className="input" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="su-pass">Password</label>
        <input id="su-pass" className="input" type="password" autoComplete="new-password" required
          minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="hint">At least 8 characters.</div>
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Creating…" : "Create family"}
      </button>
    </form>
  );
}

function LearnerIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ joinCode, username, pin });
      }}
    >
      <div className="field">
        <label htmlFor="li-code">Family code</label>
        <input id="li-code" className="input" required maxLength={6} placeholder="ABC123" autoCapitalize="characters"
          style={{ textTransform: "uppercase", letterSpacing: "0.15em" }}
          value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <div className="hint">Ask your guide — it's in their Settings.</div>
      </div>
      <div className="field">
        <label htmlFor="li-user">Username</label>
        <input id="li-user" className="input" required autoCapitalize="none" value={username}
          onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="li-pin">PIN</label>
        <input id="li-pin" className="input" type="password" inputMode="numeric" required pattern="\d{4,6}"
          value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Signing in…" : "Start learning"}
      </button>
    </form>
  );
}
