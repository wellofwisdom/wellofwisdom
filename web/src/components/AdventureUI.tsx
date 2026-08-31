// SPDX-License-Identifier: AGPL-3.0-or-later
// Adventure UI: theme picker dialog (guide) + adventures panel on a course.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Modal, Field, Panel } from "./ui";
import type { Job, MeResponse } from "../types";

interface ThemeRow {
  id: string;
  title: string;
  tagline: string;
  description: string;
}

export function AdventureDialog({ courseId, me, onClose, onCreated }: {
  courseId: number;
  me: MeResponse;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [themes, setThemes] = useState<ThemeRow[] | null>(null);
  const [themeId, setThemeId] = useState<string>("");
  const [learnerId, setLearnerId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ themes: ThemeRow[] }>("/api/media/adventures/themes")
      .then((d) =>
        setThemes([
          { id: "custom", title: "✨ Custom from interests", tagline: "The AI invents an original world from what this learner loves", description: "" },
          ...(d.themes || []),
        ])
      )
      .catch(() => setThemes([]));
  }, []);

  async function create() {
    setBusy(true);
    setErr("");
    try {
      await api("/api/media/adventures", {
        method: "POST",
        body: { courseId, learnerId: learnerId ? Number(learnerId) : null, themeId: themeId || "custom" },
      });
      onCreated();
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Turn this course into an Adventure" onClose={busy ? () => {} : onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      {busy ? (
        <div style={{ textAlign: "center", padding: "18px 0" }}>
          <div className="brewnut" aria-hidden="true">⚔️</div>
          <p className="muted" style={{ marginTop: 8 }}>Writing the world, the crew, the chapters…</p>
        </div>
      ) : (
        <>
          <Field label="For">
            <select className="input" value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
              <option value="">Everyone</option>
              {(me.learners || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Theme (all original worlds — no franchise IP)">
            {!themes ? (
              <div className="skel" style={{ height: 40 }} />
            ) : (
              <div className="whocardrow">
                {themes.map((t) => (
                  <button key={t.id} type="button" className={`whocard${themeId === t.id ? " on" : ""}`} onClick={() => setThemeId(t.id)}>
                    <span className="wc-name">{t.title}</span>
                    <span className="wc-sub">{t.tagline}</span>
                  </button>
                ))}
              </div>
            )}
          </Field>
          <div className="row">
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="button" disabled={busy || !themeId} onClick={create}>✨ Build the Adventure</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function AdventuresPanel({ courseId, onChanged }: { courseId: number; onChanged: () => void }) {
  const [adventures, setAdventures] = useState<{ id: number; world: { title: string; tagline: string }; learner_name: string | null }[] | null>(null);

  const load = () =>
    api<{ adventures: typeof adventures }>(`/api/media/adventures/for-course/${courseId}`)
      .then((d) => setAdventures(d.adventures))
      .catch(() => setAdventures([]));

  useEffect(() => { load(); }, [courseId]);

  if (!adventures || adventures.length === 0) return null;
  return (
    <Panel title="⚔️ Adventures" side="gamification active">
      {adventures.map((a) => (
        <div key={a.id} className="checkitem">
          <span className="t">
            <strong>{a.world.title}</strong> — {a.world.tagline}
            {a.learner_name ? ` · for ${a.learner_name}` : " · everyone"}
          </span>
          <button className="btn ghost small-btn" type="button" onClick={async () => {
            if (!window.confirm("Remove this adventure?")) return;
            await api(`/api/media/adventures/${a.id}`, { method: "DELETE" }).catch(() => {});
            load();
            onChanged();
          }}>Remove</button>
        </div>
      ))}
    </Panel>
  );
}

/** The guide's cover-image button with job polling. */
export function CoverButton({ courseId, onDone, onError }: {
  courseId: number;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn" type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const d = await api<{ jobId: number }>(`/api/media/course-cover/${courseId}`, { method: "POST", body: {} });
        const poll = window.setInterval(async () => {
          try {
            const j = await api<{ job: Job }>(`/api/courses/jobs/${d.jobId}`);
            if (j.job.status === "done") { window.clearInterval(poll); setBusy(false); onDone(); }
            if (j.job.status === "error") { window.clearInterval(poll); setBusy(false); onError(String(j.job.error || "image failed")); }
          } catch { /* poll on */ }
        }, 3000);
      } catch {
        setBusy(false);
        onError("Image generation not configured (Settings → AI media).");
      }
    }}>{busy ? "🖼️ Generating…" : "🖼️ Cover"}</button>
  );
}
