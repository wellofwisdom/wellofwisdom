// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner space: big, friendly, minimal chrome. Kids see this, not the console.
import type { Me } from "../types";
import { IconLogout, IconSparkle } from "../components/Icons";

export default function LearnerHome({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <div className="kid">
      <div className="kidtop">
        <span className="chip" style={{ marginLeft: 0 }}>🌰 {me.familyName}</span>
        <button className="iconbtn" onClick={onLogout} aria-label="Sign out" title="Sign out" type="button">
          <IconLogout />
        </button>
      </div>

      <div className="hi">Hi, {me.name.split(" ")[0]}!</div>
      <p className="sub">Ready to learn something cool?</p>

      <div className="kidcard">
        <div className="big" aria-hidden="true">🌱</div>
        <h2 style={{ margin: "8px 0 6px" }}>Your courses will live here</h2>
        <p className="muted" style={{ marginBottom: 18 }}>
          The grown-ups are setting up your first course. It'll be built around
          the things <strong>you</strong> like.
        </p>
        <span className="chip"><IconSparkle width={14} height={14} /> Coming soon</span>
      </div>

      <p className="muted small" style={{ marginTop: 22, textAlign: "center" }}>
        Tip: you can pick a background you like — ask your parent to show you
        Settings → Appearance.
      </p>
    </div>
  );
}
