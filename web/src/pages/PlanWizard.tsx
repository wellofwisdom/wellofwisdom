// SPDX-License-Identifier: AGPL-3.0-or-later
// The AI Plan Assistant — walks the guide through designing a whole
// semester/year path, then drafts the milestone outline for review.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import type { Job, Learner, MeResponse } from "../types";

interface Draft {
  title: string;
  description: string | null;
  milestones: { title: string; description: string | null; project_ideas: { title: string; description: string }[]; resources: { title: string; url: string | null }[] }[];
}

export default function PlanWizard({ me, onNavigate }: { me: MeResponse; onNavigate: (hash: string) => void }) {
  const learners: Learner[] = me.learners || [];

  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 9);
    return d.toISOString().slice(0, 10);
  });
  const [sessionsPerWeek, setSessions] = useState("3");
  const [minutesPerSession, setMinutes] = useState("30");
  const [enrolled, setEnrolled] = useState<Record<number, { lens: string; note: string }>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<"choose" | "ai" | "template">("choose");
  const [templates, setTemplates] = useState<{ id: string; title: string; subject: string; description: string; suggestedWeeks: number; milestoneCount: number }[]>([]);
  const [fromTemplate, setFromTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode === "template" && templates.length === 0) {
      api<{ templates: typeof templates }>("/api/plans/templates")
        .then((d) => setTemplates(d.templates))
        .catch(() => setTemplates([]));
    }
  }, [mode, templates.length]);
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function pickTemplate(id: string) {
    try {
      const d = await api<{ template: { id: string; title: string; description: string; subject: string; suggestedWeeks: number; milestones: { title: string; description: string; projectIdea: string; resourceHint: string }[] } }>(`/api/plans/templates/${id}`);
      const t = d.template;
      setSubject(t.subject);
      const end = new Date();
      end.setDate(end.getDate() + t.suggestedWeeks * 7);
      setEndDate(end.toISOString().slice(0, 10));
      setDraft({
        title: t.title,
        description: t.description,
        milestones: t.milestones.map((m) => ({
          title: m.title,
          description: m.description || null,
          project_ideas: m.projectIdea ? [{ title: "Project", description: m.projectIdea }] : [],
          resources: m.resourceHint ? [{ title: m.resourceHint, url: null }] : [],
        })),
      });
      setFromTemplate(true);
    } catch (e) {
      setError(niceError(e));
    }
  }

  const weeks = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 86400000)));
  const hours = Math.round((weeks * Number(sessionsPerWeek || 0) * Number(minutesPerSession || 0)) / 60);

  function toggleLearner(id: number) {
    setEnrolled((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { lens: "", note: "" };
      return next;
    });
  }

  async function generateOutline() {
    setBusy(true);
    setError("");
    try {
      const learnerNotes = learners
        .filter((l) => enrolled[l.id])
        .map((l) => `${l.name}${enrolled[l.id].lens ? ` (lens: ${enrolled[l.id].lens})` : ""}${l.grade_level ? ` grade ${l.grade_level}` : ""}${l.interests.length ? ` loves ${l.interests.join(", ")}` : ""}`)
        .join("; ");
      const d = await api<{ jobId: number }>("/api/plans/outline", {
        method: "POST",
        body: { subject, goal, startDate, endDate, lens: null, learnerNotes: learnerNotes || null },
      });
      setJobId(d.jobId);
      poll(d.jobId);
    } catch (e) {
      setError(e instanceof Error && e.message.includes("ai_not_configured")
        ? "No AI provider is configured on this server."
        : niceError(e));
      setBusy(false);
    }
  }

  function poll(id: number) {
    pollRef.current = window.setTimeout(async () => {
      try {
        const d = await api<{ job: Job }>(`/api/plans/jobs/${id}`);
        if (d.job.status === "done" && d.job.result) {
          setDraft(d.job.result as unknown as Draft);
          setBusy(false);
          return;
        }
        if (d.job.status === "error") {
          setError(`The assistant couldn't draft this: ${d.job.error}`);
          setBusy(false);
          return;
        }
        poll(id);
      } catch {
        poll(id);
      }
    }, 2500);
  }

  async function savePlan() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ planId: number }>("/api/plans", {
        method: "POST",
        body: {
          title: draft.title,
          subject,
          goal: goal || null,
          startDate,
          endDate,
          sessionsPerWeek: Number(sessionsPerWeek),
          minutesPerSession: Number(minutesPerSession),
          learners: Object.entries(enrolled).map(([id, v]) => ({ learnerId: Number(id), lens: v.lens, note: v.note })),
          milestones: draft.milestones,
        },
      });
      onNavigate(`plan/${d.planId}`);
    } catch (e) {
      setError(niceError(e));
      setBusy(false);
    }
  }

  const brewing = busy && jobId && !draft;

  return (
    <>
      <div className="studiohead">
        <h1>🧭 Plan Assistant</h1>
        <p className="muted">
          Answer a few questions — the AI drafts the whole journey. You review, edit, and approve every milestone.
        </p>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      {mode === "choose" && (
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <button type="button" className="whocard" style={{ flex: "1 1 260px", minHeight: 150, justifyContent: "center", gap: 8 }}
            onClick={() => setMode("ai")}>
            <span className="wc-ava" aria-hidden="true" style={{ fontSize: 30 }}>🧭</span>
            <span className="wc-name" style={{ fontSize: 17 }}>Build with the AI assistant</span>
            <span className="wc-sub">Answer a few questions — it drafts the whole journey for your learners.</span>
          </button>
          <button type="button" className="whocard" style={{ flex: "1 1 260px", minHeight: 150, justifyContent: "center", gap: 8 }}
            onClick={() => setMode("template")}>
            <span className="wc-ava" aria-hidden="true" style={{ fontSize: 30 }}>📋</span>
            <span className="wc-name" style={{ fontSize: 17 }}>Start from a template</span>
            <span className="wc-sub">Proven full-year curricula — no AI needed, ready in minutes.</span>
          </button>
        </div>
      )}

      {mode === "template" && !draft && (
        <>
          {templates.length === 0 && <div className="skel" style={{ height: 120 }} />}
          {templates.map((t) => (
            <div key={t.id} className="learnerrow coursecard" style={{ cursor: "pointer" }} role="button" tabIndex={0}
              onClick={() => pickTemplate(t.id)} onKeyDown={(e) => e.key === "Enter" && pickTemplate(t.id)}>
              <span className="avatar" aria-hidden="true">📋</span>
              <div className="meta">
                <div className="n">{t.title}</div>
                <div className="u">{t.subject} · {t.suggestedWeeks} weeks · {t.milestoneCount} milestones</div>
                <div className="u" style={{ marginTop: 2 }}>{t.description}</div>
              </div>
              <span className="kc-go" aria-hidden="true">→</span>
            </div>
          ))}
          <button className="btn ghost" type="button" onClick={() => setMode("choose")}>← Back</button>
        </>
      )}

      {brewing ? (
        <div className="studiobrew">
          <div className="brewnut" aria-hidden="true">🧭</div>
          <h1>Mapping your path</h1>
          <p className="muted">
            {subject} · {weeks} weeks · ~{hours} hours. Sequencing milestones from foundations to mastery…
          </p>
          <div className="skel" style={{ height: 12, width: "70%", margin: "18px auto" }} />
          <div className="skel" style={{ height: 12, width: "50%", margin: "0 auto 10px" }} />
          <div className="skel" style={{ height: 12, width: "60%", margin: "0 auto" }} />
        </div>
      ) : !draft && mode === "ai" ? (
        <>
          <section className="panel step">
            <div className="stepnum" aria-hidden="true">1</div>
            <div className="grow">
              <h2>What are we learning?</h2>
              <input className="input biginput" placeholder="e.g. Algebra 1 · Ancient World History · Intro to Drawing"
                value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
              <div style={{ marginTop: 10 }}>
                <label className="small" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                  What does success look like by the end? (goals)
                </label>
                <textarea className="input" rows={3} value={goal} maxLength={2000}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Comfortable with all Algebra 1 topics; can solve multi-step equations confidently; ready for Geometry." />
              </div>
            </div>
          </section>

          <section className="panel step">
            <div className="stepnum" aria-hidden="true">2</div>
            <div className="grow">
              <h2>How long, and how often?</h2>
              <div className="row wrap">
                <div><label className="small">Start</label><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" /></div>
                <div><label className="small">End</label><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" /></div>
                <div>
                  <label className="small">Sessions / week</label>
                  <select className="input" value={sessionsPerWeek} onChange={(e) => setSessions(e.target.value)} aria-label="Sessions per week">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}×</option>)}
                  </select>
                </div>
                <div>
                  <label className="small">Minutes / session</label>
                  <select className="input" value={minutesPerSession} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes per session">
                    {[15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                ≈ {weeks} weeks · about {hours} hours of learning total
              </p>
            </div>
          </section>

          <section className="panel step">
            <div className="stepnum" aria-hidden="true">3</div>
            <div className="grow">
              <h2>Who's on this path — and how is each journey different?</h2>
              <p className="muted small" style={{ marginBottom: 10 }}>
                Same destination, personalized route: give any learner their own lens or extra instructions.
              </p>
              {learners.length === 0 ? (
                <p className="hint">No learners yet — <a href="#/learners">add some</a>, or come back; plans work without them too.</p>
              ) : (
                learners.map((l) => {
                  const on = Boolean(enrolled[l.id]);
                  const cfg = enrolled[l.id] || { lens: "", note: "" };
                  return (
                    <div key={l.id} className={`whocard${on ? " on" : ""}`} style={{ width: "100%", marginBottom: 8 }} role="button" tabIndex={0}
                      onClick={() => toggleLearner(l.id)} onKeyDown={(e) => e.key === "Enter" && toggleLearner(l.id)}>
                      <div className="row">
                        <input type="checkbox" checked={on} onChange={() => toggleLearner(l.id)} onClick={(e) => e.stopPropagation()} aria-label={`Include ${l.name}`} />
                        <span className="wc-name">{l.name}</span>
                        <span className="muted small">{l.grade_level ? `Grade ${l.grade_level}` : ""}{l.interests.length ? ` · loves ${l.interests.slice(0, 2).join(", ")}` : ""}</span>
                      </div>
                      {on && (
                        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, width: "100%" }}>
                          <input className="input" placeholder="Personal lens (optional) — e.g. fashion, robotics" value={cfg.lens}
                            onChange={(e) => setEnrolled({ ...enrolled, [l.id]: { ...cfg, lens: e.target.value } })} aria-label={`Lens for ${l.name}`} />
                          <input className="input" style={{ marginTop: 6 }} placeholder="Extra instructions — e.g. more visual, slower pace" value={cfg.note}
                            onChange={(e) => setEnrolled({ ...enrolled, [l.id]: { ...cfg, note: e.target.value } })} aria-label={`Notes for ${l.name}`} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <div className="stickybar">
            <div className="muted small">{subject || "…"} · {weeks} weeks · ~{hours}h</div>
            <button className="btn primary big" type="button" disabled={!subject.trim() || busy} onClick={generateOutline}>
              ✨ Draft the path
            </button>
          </div>
        </>
      ) : draft ? (
        <>
          {fromTemplate && (
            <section className="panel step">
              <div className="stepnum" aria-hidden="true">2</div>
              <div className="grow">
                <h2>Timeframe & learners</h2>
                <div className="row wrap" style={{ marginBottom: 10 }}>
                  <div><label className="small">Start</label><input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" /></div>
                  <div><label className="small">End</label><input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" /></div>
                  <div>
                    <label className="small">Sessions/week</label>
                    <select className="input" value={sessionsPerWeek} onChange={(e) => setSessions(e.target.value)} aria-label="Sessions per week">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}×</option>)}
                    </select>
                  </div>
                </div>
                {learners.map((l) => {
                  const on = Boolean(enrolled[l.id]);
                  const cfg = enrolled[l.id] || { lens: "", note: "" };
                  return (
                    <div key={l.id} className={`whocard${on ? " on" : ""}`} style={{ width: "100%", marginBottom: 8 }} role="button" tabIndex={0}
                      onClick={() => toggleLearner(l.id)} onKeyDown={(e) => e.key === "Enter" && toggleLearner(l.id)}>
                      <div className="row">
                        <input type="checkbox" checked={on} onChange={() => toggleLearner(l.id)} onClick={(e) => e.stopPropagation()} aria-label={`Include ${l.name}`} />
                        <span className="wc-name">{l.name}</span>
                      </div>
                      {on && (
                        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, width: "100%" }}>
                          <input className="input" placeholder="Personal lens (optional)" value={cfg.lens}
                            onChange={(e) => setEnrolled({ ...enrolled, [l.id]: { ...cfg, lens: e.target.value } })} aria-label={`Lens for ${l.name}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="hint" style={{ marginTop: 6 }}>Template milestones spread over {weeks} weeks (~{hours}h) spread over {weeks} weeks (~{hours}h).</p>
              </div>
            </section>
          )}
          <section className="panel step">
            <div className="stepnum" aria-hidden="true">4</div>
            <div className="grow">
              <h2>Review the journey</h2>
              <p className="muted small">Edit anything — titles, order (cut what you don't want), remove milestones with ✕. Dates are spread evenly; you can adjust them on the plan page.</p>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Plan title</label>
                <input className="input biginput" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              {draft.description && <p className="muted">{draft.description}</p>}
              <div style={{ marginTop: 12 }}>
                {draft.milestones.map((m, i) => (
                  <div key={i} className="checkitem">
                    <span className="dot" style={{ borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 }}>{i + 1}</span>
                    <span className="t grow">
                      <input className="input" value={m.title}
                        onChange={(e) => {
                          const ms = [...draft.milestones];
                          ms[i] = { ...m, title: e.target.value };
                          setDraft({ ...draft, milestones: ms });
                        }}
                        aria-label={`Milestone ${i + 1} title`} />
                      {m.description && <div className="hint" style={{ marginTop: 2 }}>{m.description}</div>}
                      {m.project_ideas[0] && (
                        <div className="hint" style={{ marginTop: 2 }}>🛠️ {m.project_ideas[0].description}</div>
                      )}
                      {m.resources[0] && (
                        <div className="hint" style={{ marginTop: 2 }}>🔗 {m.resources[0].title}</div>
                      )}
                    </span>
                    <button className="iconbtn" type="button" aria-label={`Remove milestone ${i + 1}`}
                      onClick={() => setDraft(draft ? { ...draft, milestones: draft.milestones.filter((_, j) => j !== i) } : draft)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="stickybar">
            <div className="muted small">{draft?.milestones.length ?? 0} milestones over {weeks} weeks</div>
            <button className="btn" type="button" onClick={() => { setDraft(null); setJobId(null); setFromTemplate(false); setMode("choose"); }}>← Back</button>
            <button className="btn primary big" type="button" disabled={busy || (draft?.milestones.length ?? 0) < 3} onClick={savePlan}>
              {busy ? "Saving…" : "Save learning path"}
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
