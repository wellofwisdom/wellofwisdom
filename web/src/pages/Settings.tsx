// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings: family + join code, appearance (mode + backgrounds), AI status.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { HealthResponse, MeResponse } from "../types";
import { Panel, Field } from "../components/ui";
import { BACKGROUNDS, getBg, getMode, setBg, setMode, type Mode } from "../theme";
import { IconCheck, IconCopy } from "../components/Icons";

export default function Settings({ me }: { me: MeResponse }) {
  const user = me.user!;
  const [mode, setModeState] = useState<Mode>(getMode());
  const [bg, setBgState] = useState(getBg());
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

      <Panel title="Appearance" side="per device for now">
        <Field label="Mode">
          <div className="seg" role="radiogroup" aria-label="Color mode">
            {(["light", "dark", "system"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => {
                  setMode(m);
                  setModeState(m);
                }}
              >
                {m === "light" ? "Light" : m === "dark" ? "Dark" : "System"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Background">
          <div className="bggrid">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bgswatch${bg === b.id ? " on" : ""}`}
                style={{ background: b.swatch }}
                aria-label={`Background: ${b.name}`}
                aria-pressed={bg === b.id}
                onClick={() => {
                  setBg(b.id);
                  setBgState(b.id);
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </Field>
      </Panel>

      <Panel title="System" side="this server">
        <div className="checkitem">
          <span className={`dot${dbOk ? " done" : ""}`} style={{ borderColor: dbOk ? "var(--good)" : "var(--border)" }} />
          <span className="t">Database {health?.db.configured ? (dbOk ? "connected" : "error — check logs") : "not configured"}</span>
        </div>
        <div className="checkitem">
          <span className={`dot${aiOn ? " done" : ""}`} style={{ borderColor: aiOn ? "var(--good)" : "var(--border)" }} />
          <span className="t">
            AI {aiOn ? "connected" : "not configured"} —{" "}
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
