// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings: family + join code, appearance (mode + backgrounds), AI status.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { HealthResponse, MeResponse } from "../types";
import { Panel, Field, StatBar } from "../components/ui";
import { IconCheck, IconCopy } from "../components/Icons";

interface AiUsageResponse {
  month: { calls: number; tokens_in: number; tokens_out: number; cost: string | null };
  byTask: { task: string; calls: number; cost: string | null }[];
  recent: { task: string; model: string | null; tokens_in: number; tokens_out: number; cost: string | null; created_at: string }[];
}

function AiUsage() {
  const [usage, setUsage] = useState<AiUsageResponse | null>(null);

  useEffect(() => {
    api<AiUsageResponse>("/api/ai/usage").then(setUsage).catch(() => setUsage(null));
  }, []);

  if (!usage) return <p className="muted small">No AI usage recorded yet. It appears here once you generate courses.</p>;
  const cost = Number(usage.month.cost || 0);
  return (
    <>
      <StatBar
        stats={[
          { label: "AI calls", value: usage.month.calls },
          { label: "Tokens in", value: usage.month.tokens_in.toLocaleString() },
          { label: "Tokens out", value: usage.month.tokens_out.toLocaleString() },
          { label: "Est. cost (USD)", value: `$${cost.toFixed(3)}` },
        ]}
      />
      {usage.byTask.length > 0 && (
        <div>
          {usage.byTask.map((t) => (
            <div key={t.task} className="checkitem">
              <span className="t">{t.task}</span>
              <span className="muted small">{t.calls} calls · ${Number(t.cost || 0).toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
      {usage.month.calls === 0 && <p className="muted small">No calls this month.</p>}
    </>
  );
}

export default function Settings({ me }: { me: MeResponse }) {
  const user = me.user!;
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
          Backgrounds, accent colors, dark mode, reading size — everything lives in one place now.
        </p>
        <a className="btn primary" href="#/experience">🎨 Open Experience</a>
      </Panel>

      <Panel title="AI usage" side="this family, this month">
        <AiUsage />
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
