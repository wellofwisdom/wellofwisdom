// SPDX-License-Identifier: AGPL-3.0-or-later
// Submitted work: the guide reads what a learner handed in, asks the AI for a
// draft response if they want one, then writes the answer themselves.
//
// The draft is on the left of the divide and the learner is on the right. It
// fills the guide's box only when they press "Use this", and nothing crosses
// back until they press "Send it back". No auto-grading, ever.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, EmptyState, PillTabs } from "../components/ui";
import { RichText } from "../lib/rich";
import type { Outcome, RubricDraft, WorkItem } from "../types";

const VERDICT: Record<string, string> = { met: "✅ met", nearly: "◐ nearly", not_yet: "○ not yet" };

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Work() {
  const [rows, setRows] = useState<WorkItem[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [tab, setTab] = useState<"submitted" | "returned">("submitted");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ submissions: WorkItem[]; outcomes: Outcome[]; aiConfigured: boolean }>("/api/work");
      setRows(d.submissions);
      setOutcomes(d.outcomes);
      setAiConfigured(d.aiConfigured);
    } catch (e) {
      setMsg(niceError(e));
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => r.status === tab);
  const waiting = (rows || []).filter((r) => r.status === "submitted").length;

  return (
    <>
      <Panel
        title="Handed in"
        side={<PillTabs
          value={tab}
          onChange={(v) => { setTab(v); setOpen(null); }}
          ariaLabel="which work to show"
          tabs={[
            { id: "submitted", label: `To read${waiting ? ` (${waiting})` : ""}` },
            { id: "returned", label: "Answered" },
          ]}
        />}
      >
        <p className="muted small">
          A project a learner is still drafting is not listed here. It appears the moment they hand it in.
        </p>
        {msg && <p className="small">{msg}</p>}
        {rows && shown.length === 0 && (
          <EmptyState
            icon="🛠️"
            title={tab === "submitted" ? "Nothing waiting" : "Nothing answered yet"}
            message={
              tab === "submitted"
                ? "When a learner hands in a project, it lands here with the brief and the rubric it was written against."
                : "Work you have answered keeps its feedback here, so you can look back at what you said."
            }
          />
        )}
        {shown.map((r) => (
          <div key={r.id}>
            <button
              className="checkitem"
              type="button"
              style={{ width: "100%", textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
              onClick={() => setOpen(open === r.id ? null : r.id)}
              aria-expanded={open === r.id}
            >
              <span className="t">
                <b>{r.learner_name}</b>
                <span className="muted"> on {r.project.title || r.lesson_title}</span>
                <div className="muted small" style={{ marginTop: 2 }}>
                  {r.course_title} · {r.words} words
                  {r.outcome ? ` · ${outcomes.find((o) => o.id === r.outcome)?.label || r.outcome}` : ""}
                </div>
              </span>
              <span className="muted small">{when(r.status === "returned" ? r.returned_at : r.submitted_at)}</span>
            </button>
            {open === r.id && (
              <Reader id={r.id} outcomes={outcomes} aiConfigured={aiConfigured} onSaved={load} />
            )}
          </div>
        ))}
      </Panel>
    </>
  );
}

function Reader({ id, outcomes, aiConfigured, onSaved }: {
  id: number;
  outcomes: Outcome[];
  aiConfigured: boolean;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<WorkItem | null>(null);
  const [feedback, setFeedback] = useState("");
  const [outcome, setOutcome] = useState("");
  const [draft, setDraft] = useState<RubricDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ submission: WorkItem }>(`/api/work/${id}`)
      .then((d) => {
        setItem(d.submission);
        setFeedback(d.submission.feedback || "");
        setOutcome(d.submission.outcome || "");
        setDraft(d.submission.ai_feedback);
      })
      .catch((e) => setMsg(niceError(e)));
  }, [id]);

  async function askForDraft() {
    setBusy("draft");
    setMsg("");
    try {
      const d = await api<{ draft: RubricDraft; note?: string }>(`/api/work/${id}/draft`, { method: "POST" });
      setDraft(d.draft);
      if (d.note === "too_short") setMsg("There is not enough here to read against the rubric yet.");
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy("");
    }
  }

  async function save(send: boolean) {
    setBusy(send ? "send" : "save");
    setMsg("");
    try {
      const d = await api<{ submission: WorkItem }>(`/api/work/${id}`, {
        method: "PATCH",
        body: { feedback, outcome: outcome || null, return: send },
      });
      setItem(d.submission);
      setMsg(send ? "✓ Sent back to the learner." : "✓ Saved. The learner has not seen it yet.");
      onSaved();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy("");
    }
  }

  if (!item) return <div className="skel" style={{ width: "100%", height: 120, margin: "10px 0" }} />;

  return (
    <div style={{ padding: "10px 4px 18px" }}>
      {item.project.description && (
        <div className="explainbox" style={{ marginBottom: 10 }}>
          <b>The brief</b>
          <RichText text={item.project.description} />
        </div>
      )}
      {item.project.rubric && (
        <details style={{ marginBottom: 10 }}>
          <summary className="muted small">The rubric it was written against</summary>
          <RichText text={item.project.rubric} />
        </details>
      )}

      <div className="feedback selfcheck" style={{ whiteSpace: "pre-wrap" }}>{item.body}</div>

      <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 10 }}>
        <button
          className="btn"
          type="button"
          disabled={busy !== "" || !aiConfigured || !item.project.rubric}
          onClick={askForDraft}
          title={
            !aiConfigured
              ? "No AI provider is set up on this instance"
              : !item.project.rubric
                ? "This project has no rubric to read it against"
                : "Read this against the rubric and draft a response for you to edit"
          }
        >
          {busy === "draft" ? "Reading…" : draft ? "Draft again" : "Draft feedback"}
        </button>
        <span className="hint">
          A draft, for you. Nothing here reaches the learner until you send it.
        </span>
      </div>

      {draft && <DraftPanel draft={draft} outcomes={outcomes} onUse={(t, o) => { setFeedback(t); if (o) setOutcome(o); }} />}

      <div style={{ marginTop: 14 }}>
        <label className="muted small" htmlFor={`fb-${id}`}>What you send back</label>
        <textarea
          id={`fb-${id}`}
          className="input"
          rows={7}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Write to them directly. What works, what to change, what to do next."
          style={{ marginTop: 4 }}
        />
        <div className="row" style={{ marginTop: 8, alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ maxWidth: 200 }}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            aria-label="Outcome"
          >
            <option value="">No outcome</option>
            {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="btn" type="button" disabled={busy !== ""} onClick={() => save(false)}>
            Save for later
          </button>
          <button className="btn primary" type="button" disabled={busy !== "" || !feedback.trim()} onClick={() => save(true)}>
            {busy === "send" ? "Sending…" : "Send it back"}
          </button>
          <span className="grow" />
          {item.returned_at && <span className="muted small">Last sent {when(item.returned_at)}</span>}
        </div>
        {msg && <p className="small" role="status" style={{ marginTop: 6 }}>{msg}</p>}
      </div>
    </div>
  );
}

function DraftPanel({ draft, outcomes, onUse }: {
  draft: RubricDraft;
  outcomes: Outcome[];
  onUse: (text: string, outcome: string | null) => void;
}) {
  const suggested = draft.suggestedOutcome ? outcomes.find((o) => o.id === draft.suggestedOutcome) : null;
  return (
    <div className="explainbox" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
        <b className="grow">A draft, not a decision</b>
        {draft.toLearner && (
          <button className="btn ghost small-btn" type="button" onClick={() => onUse(draft.toLearner, draft.suggestedOutcome)}>
            Use this
          </button>
        )}
      </div>
      {draft.criteria.length > 0 && (
        <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
          {draft.criteria.map((c, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <b>{c.criterion}</b>{c.verdict ? ` ${VERDICT[c.verdict] || c.verdict}` : ""}
              {c.note ? <div className="muted small">{c.note}</div> : null}
            </li>
          ))}
        </ul>
      )}
      {draft.toLearner && (
        <>
          <div className="muted small">Drafted for the learner</div>
          <p style={{ whiteSpace: "pre-wrap", margin: "2px 0 10px" }}>{draft.toLearner}</p>
        </>
      )}
      {draft.forGuide && (
        <>
          <div className="muted small">For you only</div>
          <p style={{ margin: "2px 0 10px" }}>{draft.forGuide}</p>
        </>
      )}
      {suggested && <p className="hint">Suggested outcome: {suggested.label}. You decide.</p>}
    </div>
  );
}
