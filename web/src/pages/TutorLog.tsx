// SPDX-License-Identifier: AGPL-3.0-or-later
// The guide's window onto every tutor conversation, and the control over how
// much the tutor gives each learner away.
//
// This page exists so the answer to "what is my child saying to the AI" is
// never "I do not know". It is not a setting that can be switched off.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, EmptyState } from "../components/ui";
import { RichText } from "../lib/rich";
import type { MeResponse } from "../types";

interface ThreadRow {
  id: number;
  learner_id: number;
  learner_name: string;
  lesson_title: string | null;
  messages: number;
  refusals: number;
  last_message: string | null;
  updated_at: string;
}

interface Mode { id: string; label: string; blurb: string; seesAnswer: boolean }

export default function TutorLog({ me }: { me: MeResponse }) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ messages: { id: number; role: string; content: string; refused: boolean }[] } | null>(null);
  const [msg, setMsg] = useState("");
  const learners = me.learners || [];

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        api<{ threads: ThreadRow[] }>("/api/tutor/threads"),
        api<{ modes: Mode[] }>("/api/tutor/modes"),
      ]);
      setThreads(t.threads);
      setModes(m.modes);
    } catch (e) {
      setMsg(niceError(e));
      setThreads([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (open === null) { setDetail(null); return; }
    api<typeof detail>(`/api/tutor/threads/${open}`).then(setDetail).catch(() => setDetail(null));
  }, [open]);

  async function setMode(learnerId: number, mode: string) {
    try {
      await api(`/api/tutor/mode/${learnerId}`, { method: "PUT", body: { mode } });
      setMsg("✓ Saved.");
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  return (
    <>
      <Panel title="How much the tutor gives away" side="per learner">
        <p className="muted small">
          In <b>Hints only</b> and <b>Guided</b>, the tutor is never sent the answer at all, so it
          cannot reveal one under pressure. Only <b>Full explanations</b> passes it through.
        </p>
        {learners.length === 0 && <p className="muted small">No learners yet.</p>}
        {learners.map((l) => (
          <div className="checkitem" key={l.id}>
            <span className="t"><b>{l.name}</b></span>
            <select
              className="input"
              style={{ maxWidth: 240 }}
              defaultValue={l.tutor_mode || "hints"}
              onChange={(e) => setMode(l.id, e.target.value)}
              aria-label={`Tutor mode for ${l.name}`}
            >
              {modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        ))}
        {modes.map((m) => (
          <p className="hint" key={m.id}><b>{m.label}:</b> {m.blurb}</p>
        ))}
        {msg && <p className="small">{msg}</p>}
      </Panel>

      <Panel title="Every conversation" side={threads ? `${threads.length}` : undefined}>
        {threads && threads.length === 0 && (
          <EmptyState
            icon="🌰"
            title="Nothing asked yet"
            message="When a learner gets stuck and asks for help, the whole conversation appears here. You see all of it, always."
          />
        )}
        {(threads || []).map((t) => (
          <div key={t.id}>
            <button
              className="checkitem"
              type="button"
              style={{ width: "100%", textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
              onClick={() => setOpen(open === t.id ? null : t.id)}
              aria-expanded={open === t.id}
            >
              <span className="t">
                <b>{t.learner_name}</b>
                {t.lesson_title ? <span className="muted"> on {t.lesson_title}</span> : null}
                {t.refusals > 0 && <span className="tag" style={{ marginLeft: 6 }}>⚠️ {t.refusals} refused</span>}
                {t.last_message && (
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {t.last_message.slice(0, 140)}{t.last_message.length > 140 ? "…" : ""}
                  </div>
                )}
              </span>
              <span className="muted small">{t.messages} messages</span>
            </button>

            {open === t.id && detail && (
              <div className="tutorlog readonly">
                {detail.messages.map((m) => (
                  <div className={`tutormsg ${m.role}${m.refused ? " refused" : ""}`} key={m.id}>
                    {m.role === "tutor" ? <RichText text={m.content} /> : m.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Panel>
    </>
  );
}
