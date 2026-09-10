// SPDX-License-Identifier: AGPL-3.0-or-later
// Tests and evaluations: the third piece of the compliance pack.
//
// Days of instruction and the portfolio are built from work the app already
// holds. An assessment is not: a test is sat somewhere else and its report
// arrives on paper. So the guide copies in what the report said, and it prints
// in the portfolio for the period it falls in.
//
// This panel records a result. It does not say whether the result is enough,
// and must not start to: that turns on the law of one place and the facts of
// one family, and the app knows neither.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, EmptyState, Field, Modal } from "./ui";

export interface Score {
  area: string;
  score: string | null;
  percentile: number | null;
}

export interface Assessment {
  id: number;
  takenOn: string;
  kind: "test" | "evaluation" | "other";
  title: string;
  givenBy: string | null;
  gradeLevel: number | null;
  scores: Score[];
  summary: string | null;
}

export const KIND_LABEL: Record<Assessment["kind"], string> = {
  test: "Standardised test",
  evaluation: "Written evaluation",
  other: "Other assessment",
};

function pretty(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** The scores as the report gave them. Shared with the printed portfolio, which
 *  passes its own document class. */
export function ScoreTable({ scores, className }: { scores: Score[]; className: string }) {
  if (!scores.length) return null;
  const anyPct = scores.some((s) => s.percentile !== null);
  return (
    <table className={className}>
      <thead>
        <tr>
          <th scope="col">Area</th>
          <th scope="col">Score</th>
          {anyPct && <th scope="col">Percentile</th>}
        </tr>
      </thead>
      <tbody>
        {scores.map((s, i) => (
          <tr key={i}>
            <td>{s.area}</td>
            <td>{s.score ?? ""}</td>
            {anyPct && <td>{s.percentile ?? ""}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function metaLine(a: Assessment) {
  return [
    pretty(a.takenOn),
    KIND_LABEL[a.kind],
    a.givenBy,
    a.gradeLevel ? `grade ${a.gradeLevel} at the time` : null,
  ].filter(Boolean).join(" · ");
}

export default function AssessmentsPanel({ learnerId, learnerName }: { learnerId: number; learnerName: string }) {
  const [items, setItems] = useState<Assessment[] | null>(null);
  const [editing, setEditing] = useState<Assessment | "new" | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const d = await api<{ assessments: Assessment[] }>(`/api/assessments/${learnerId}`);
      setItems(d.assessments);
    } catch (e) {
      setMsg(niceError(e));
      setItems([]);
    }
  }

  useEffect(() => {
    setItems(null);
    setMsg("");
    load();
  }, [learnerId]);

  async function remove(a: Assessment) {
    if (!window.confirm(`Delete "${a.title}" from ${learnerName}'s record? This cannot be undone.`)) return;
    try {
      await api(`/api/assessments/${learnerId}/${a.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  return (
    <Panel
      title="Tests and evaluations"
      side={<button className="btn small-btn" type="button" onClick={() => setEditing("new")}>+ Record a result</button>}
    >
      <p className="muted small">
        A standardised test or a teacher's written evaluation, copied in as the report gave it. It prints in the
        portfolio for the period it falls in. This records the result; whether it is enough for your filing is
        between you and the rules you file under.
      </p>
      {msg && <p className="small" role="status">{msg}</p>}
      {!items && <div className="skel" style={{ height: 60 }} />}
      {items && items.length === 0 && (
        <EmptyState
          icon="📝"
          title="No results on file"
          message="When a test report or an evaluation comes back, record it here so it sits beside the days and the work."
        />
      )}
      {(items || []).map((a) => (
        <article className="as-item" key={a.id}>
          <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
            <div className="grow">
              <b>{a.title}</b>
              <div className="muted small">{metaLine(a)}</div>
            </div>
            <button className="btn ghost small-btn" type="button" onClick={() => setEditing(a)}>Edit</button>
            <button className="btn ghost small-btn" type="button" onClick={() => remove(a)}>Delete</button>
          </div>
          <ScoreTable scores={a.scores} className="as-scores" />
          {a.summary && <p className="as-summary">{a.summary}</p>}
        </article>
      ))}

      {editing && (
        <AssessmentDialog
          learnerId={learnerId}
          value={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </Panel>
  );
}

interface Row { area: string; score: string; percentile: string }

const BLANK_ROW: Row = { area: "", score: "", percentile: "" };

function AssessmentDialog({ learnerId, value, onClose, onSaved }: {
  learnerId: number;
  value: Assessment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(value?.title || "");
  const [takenOn, setTakenOn] = useState(value?.takenOn || new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<Assessment["kind"]>(value?.kind || "test");
  const [givenBy, setGivenBy] = useState(value?.givenBy || "");
  const [grade, setGrade] = useState(value?.gradeLevel ? String(value.gradeLevel) : "");
  const [rows, setRows] = useState<Row[]>(
    value && value.scores.length
      ? value.scores.map((s) => ({ area: s.area, score: s.score ?? "", percentile: s.percentile === null ? "" : String(s.percentile) }))
      : [{ ...BLANK_ROW }]
  );
  const [summary, setSummary] = useState(value?.summary || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }

  async function save() {
    setBusy(true);
    setErr("");
    const body = {
      title,
      takenOn,
      kind,
      givenBy,
      gradeLevel: grade.trim() ? Number(grade) : null,
      scores: rows,
      summary,
    };
    try {
      if (value) await api(`/api/assessments/${learnerId}/${value.id}`, { method: "PUT", body });
      else await api(`/api/assessments/${learnerId}`, { method: "POST", body });
      await onSaved();
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={value ? "Correct a result" : "Record a result"} onClose={onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      <Field label="What it was">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spring standardised test" />
      </Field>
      <div className="row wrap as-pair">
        <Field label="Date taken">
          <input className="input" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
        </Field>
        <Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Assessment["kind"])}>
            {(Object.keys(KIND_LABEL) as Assessment["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
      </div>
      <div className="row wrap as-pair narrow-last">
        <Field label="Given or evaluated by (optional)" hint="Who gave the test, or wrote the evaluation.">
          <input className="input" value={givenBy} onChange={(e) => setGivenBy(e.target.value)} placeholder="Co-op testing day" />
        </Field>
        <Field label="Grade then (optional)">
          <input className="input" inputMode="numeric" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="6" />
        </Field>
      </div>

      <fieldset className="as-rows">
        <legend className="small">Scores, as the report gives them</legend>
        <p className="muted small" style={{ marginTop: 0 }}>
          A score can be a number or words ("Above grade level"). Percentile is optional, 1 to 99. Leave a row blank
          and it is ignored.
        </p>
        {rows.map((r, i) => (
          <div className="row as-row" key={i}>
            <input className="input small-input grow" aria-label={`Area ${i + 1}`} value={r.area} placeholder="Reading" onChange={(e) => patch(i, { area: e.target.value })} />
            <input className="input small-input" aria-label={`Score ${i + 1}`} value={r.score} placeholder="231" onChange={(e) => patch(i, { score: e.target.value })} />
            <input className="input small-input as-pct" aria-label={`Percentile ${i + 1}`} inputMode="numeric" value={r.percentile} placeholder="%ile" onChange={(e) => patch(i, { percentile: e.target.value })} />
            <button
              className="btn ghost small-btn"
              type="button"
              aria-label={`Remove row ${i + 1}`}
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [{ ...BLANK_ROW }]))}
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn ghost small-btn" type="button" onClick={() => setRows((rs) => [...rs, { ...BLANK_ROW }])}>
          + Add a row
        </button>
      </fieldset>

      <Field label="Summary or evaluation (optional)" hint="For an evaluation, the evaluator's words go here.">
        <textarea className="input" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={save}>
          {busy ? "Saving…" : value ? "Save correction" : "Record it"}
        </button>
      </div>
    </Modal>
  );
}
