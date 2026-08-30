// SPDX-License-Identifier: AGPL-3.0-or-later
// Learning-path detail: the milestone timeline, per-learner progress,
// just-in-time course generation, resources and projects.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, Modal, Field } from "../components/ui";
import { IconTrash } from "../components/Icons";

interface Milestone {
  id: number;
  title: string;
  description: string | null;
  position: number;
  target_date: string | null;
  course_id: number | null;
  course_title: string | null;
  course_status: string | null;
  lessons_total: number;
  project_ideas: { title: string; description: string }[];
  resources: { title: string; url: string | null }[];
}

interface PlanTree {
  id: number;
  title: string;
  subject: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  sessions_per_week: number;
  minutes_per_session: number;
  status: string;
  enrollments: { learner_id: number; name: string; lens_override: string | null; personal_note: string | null }[];
  milestones: Milestone[];
  progress: Record<number, Record<number, number>>; // learnerId -> milestoneId -> lessons done
}

export default function PlanDetail({ planId, onNavigate, meLearners }: {
  planId: number;
  onNavigate: (hash: string) => void;
  meLearners: { id: number; name: string }[];
}) {
  const [plan, setPlan] = useState<PlanTree | null>(null);
  const [error, setError] = useState("");
  const [genFor, setGenFor] = useState<Milestone | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [addLink, setAddLink] = useState<Milestone | null>(null);

  const load = () =>
    api<{ plan: PlanTree }>(`/api/plans/${planId}`)
      .then((d) => setPlan(d.plan))
      .catch((e) => setError(niceError(e)));

  useEffect(() => { load(); }, [planId]);

  if (error && !plan) return <Panel title="Learning path"><div className="formerror">{error}</div></Panel>;
  if (!plan) return <div className="skel" style={{ height: 180 }} />;

  const weeks = Math.max(1, Math.round((new Date(plan.end_date).getTime() - new Date(plan.start_date).getTime()) / (7 * 86400000)));
  const hours = Math.round((weeks * plan.sessions_per_week * plan.minutes_per_session) / 60);

  async function generateCourse(m: Milestone, learnerId: number | null) {
    setGenBusy(true);
    try {
      const d = await api<{ jobId: number }>(`/api/plans/milestones/${m.id}/course`, {
        method: "POST",
        body: { learnerId },
      });
      // poll until the course exists, then refresh
      const poll = window.setInterval(async () => {
        try {
          const j = await api<{ job: { status: string } }>(`/api/plans/jobs/${d.jobId}`);
          if (j.job.status === "done" || j.job.status === "error") {
            window.clearInterval(poll);
            setGenBusy(false);
            setGenFor(null);
            load();
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e) {
      setError(niceError(e));
      setGenBusy(false);
    }
  }

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className="btn ghost" type="button" onClick={() => onNavigate("plans")}>← Learning paths</button>
        <span className="chip on">{plan.status === "active" ? "Active" : plan.status}</span>
        <span className="chip">🗓️ {plan.start_date} → {plan.end_date}</span>
        <span className="chip">~{hours}h · {plan.sessions_per_week}× {plan.minutes_per_session}min</span>
        <div className="grow" />
        {plan.status === "active" ? (
          <button className="btn" type="button" onClick={async () => { await api(`/api/plans/${plan.id}`, { method: "PATCH", body: { status: "archived" } }); load(); }}>Archive</button>
        ) : (
          <button className="btn" type="button" onClick={async () => { await api(`/api/plans/${plan.id}`, { method: "PATCH", body: { status: "active" } }); load(); }}>Activate</button>
        )}
        <button className="btn danger ghost" type="button" aria-label="Delete plan" onClick={async () => {
          if (window.confirm("Delete this learning path? Milestones are removed; generated courses stay.")) {
            await api(`/api/plans/${plan.id}`, { method: "DELETE" }).catch(() => {});
            onNavigate("plans");
          }
        }}><IconTrash /></button>
      </div>

      <Panel title={plan.title} side={plan.subject}>
        {plan.goal && <p className="muted" style={{ marginBottom: 10 }}>🎯 {plan.goal}</p>}
        {plan.enrollments.length > 0 && (
          <div className="row wrap">
            {plan.enrollments.map((e) => (
              <span className="chip" key={e.learner_id}>
                🧑‍🎓 {e.name}{e.lens_override ? ` · ${e.lens_override} lens` : ""}
              </span>
            ))}
          </div>
        )}
      </Panel>

      {plan.milestones.map((m, i) => {
        const done = plan.enrollments.map((e) => {
          const d = (plan.progress[e.learner_id] || {})[m.id] || 0;
          return { name: e.name.split(" ")[0], done: d, total: m.lessons_total };
        });
        return (
          <Panel key={m.id} title={`${i + 1}. ${m.title}`} side={m.target_date ? `by ${m.target_date}` : undefined}>
            {m.description && <p className="muted small" style={{ marginBottom: 8 }}>{m.description}</p>}

            {m.project_ideas.map((p, pi) => (
              <p className="small" key={pi} style={{ marginBottom: 6 }}>🛠️ <strong>Project:</strong> {p.description}</p>
            ))}

            {m.resources.length > 0 && (
              <div className="row wrap" style={{ marginBottom: 8 }}>
                {m.resources.map((r, ri) => (
                  r.url ? (
                    <a className="chip" key={ri} href={r.url} target="_blank" rel="noreferrer">🔗 {r.title}</a>
                  ) : (
                    <span className="chip" key={ri}>💡 {r.title}</span>
                  )
                ))}
              </div>
            )}

            <div className="row wrap">
              {m.course_id ? (
                <button className="btn" type="button" onClick={() => onNavigate(`course/${m.course_id}`)}>
                  📘 {m.course_title} ({m.lessons_total} lessons) →
                </button>
              ) : (
                <button className="btn primary" type="button" onClick={() => setGenFor(m)}>✨ Generate course</button>
              )}
              <button className="btn ghost" type="button" onClick={() => setAddLink(m)}>🔗 Add link</button>
              <button className="btn ghost" type="button" onClick={() => {
                const url = window.prompt("Target date (YYYY-MM-DD)", m.target_date || "");
                if (url !== null) api(`/api/plans/milestones/${m.id}`, { method: "PATCH", body: { targetDate: url || null } }).then(load);
              }}>🗓️ Date</button>
            </div>

            {m.course_id && done.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {done.map((d) => {
                  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
                  return (
                    <div key={d.name} style={{ marginBottom: 6 }}>
                      <div className="small muted" style={{ marginBottom: 2 }}>{d.name}: {d.done}/{d.total} lessons</div>
                      <div className="progressbar mini"><span style={{ width: `${pct}%`, display: "block", height: "100%", background: "var(--accent)" }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        );
      })}

      {genFor && (
        <Modal title={`Generate course: ${genFor.title}`} onClose={() => !genBusy && setGenFor(null)}>
          <p className="muted" style={{ marginBottom: 12 }}>
            A full course for this milestone, generated now. Personalize per learner (uses their lens and notes), or make one for everyone.
          </p>
          <div className="row wrap">
            <button className="btn" type="button" disabled={genBusy} onClick={() => generateCourse(genFor, null)}>
              👨‍👩‍👧‍👦 Everyone
            </button>
            {meLearners.filter((l) => plan.enrollments.some((e) => e.learner_id === l.id)).map((l) => (
              <button key={l.id} className="btn primary" type="button" disabled={genBusy}
                onClick={() => generateCourse(genFor, l.id)}>
                🧑‍🎓 {l.name}
              </button>
            ))}
          </div>
          {genBusy && <p className="muted small" style={{ marginTop: 12 }}>Brewing… this takes a minute or two. Keep this open.</p>}
        </Modal>
      )}

      {addLink && (
        <AddLinkDialog m={addLink} onClose={() => setAddLink(null)} onSaved={() => { setAddLink(null); load(); }} />
      )}
    </>
  );
}

function AddLinkDialog({ m, onClose, onSaved }: { m: Milestone; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={`Add resource to "${m.title}"`} onClose={onClose}>
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Khan Academy: fractions" /></Field>
      <Field label="Link (optional)" hint="No link? It saves as a suggestion chip.">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <div className="row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={async () => {
          setBusy(true);
          const resources = [...(m.resources || []), { title: title.trim(), url: /^https?:\/\//.test(url) ? url.trim() : null }];
          await api(`/api/plans/milestones/${m.id}`, { method: "PATCH", body: { resources } }).catch(() => {});
          onSaved();
        }}>Add</button>
      </div>
    </Modal>
  );
}
