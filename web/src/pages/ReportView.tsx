// SPDX-License-Identifier: AGPL-3.0-or-later
// Report view: printable progress report with editable narrative.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "../components/ui";

interface ReportStats {
  period: { from: string; to: string };
  lessonsCompleted: number;
  attemptsTotal: number;
  attemptsCorrect: number;
  accuracy: number | null;
  activeDays: number;
  skillsReviewed: number;
  courses: { title: string; lens: string | null; lessons_done: number; lessons_total: number }[];
}

interface Report {
  id: number;
  title: string;
  period_start: string;
  period_end: string;
  stats: ReportStats;
  narrative: string;
  learner_name: string;
  family_name: string;
  created_at: string;
}

export default function ReportView({ reportId, onNavigate }: { reportId: number; onNavigate: (h: string) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [narrative, setNarrative] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ report: Report }>(`/api/reports/${reportId}`)
      .then((d) => { setReport(d.report); setNarrative(d.report.narrative); })
      .catch((e) => setError(niceError(e)));
  }, [reportId]);

  if (error) return <Panel title="Report"><div className="formerror">{error}</div></Panel>;
  if (!report) return <div className="skel" style={{ height: 200 }} />;

  const s = report.stats;

  async function saveNarrative() {
    try {
      if (!report) return;
      await api(`/api/reports/${report.id}`, { method: "PATCH", body: { narrative } });
      setReport({ ...report, narrative });
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(niceError(e));
    }
  }

  return (
    <>
      <div className="row wrap noprint" style={{ marginBottom: 12 }}>
        <button className="btn ghost" type="button" onClick={() => onNavigate("records")}>← Progress</button>
        {!editing ? (
          <button className="btn" type="button" onClick={() => setEditing(true)}>✏️ Edit narrative</button>
        ) : (
          <>
            <button className="btn primary" type="button" onClick={saveNarrative}>Save</button>
            <button className="btn ghost" type="button" onClick={() => { setEditing(false); setNarrative(report.narrative); }}>Cancel</button>
          </>
        )}
        {saved && !editing && <span className="chip on">✓ saved</span>}
        <div className="grow" />
        <button className="btn primary" type="button" onClick={() => window.print()}>🖨️ Print / PDF</button>
        <button className="btn danger ghost" type="button" onClick={async () => {
          if (!window.confirm("Delete this report?")) return;
          await api(`/api/reports/${report.id}`, { method: "DELETE" }).catch(() => {});
          onNavigate("records");
        }}>🗑</button>
      </div>

      <div className="reportpage">
        <div className="rp-head">
          <div className="rp-nut" aria-hidden="true">🌰</div>
          <h1>Progress Report</h1>
          <p className="rp-sub">
            {report.learner_name} · {report.family_name} · {report.period_start} to {report.period_end}
          </p>
        </div>

        <div className="rp-stats">
          <div className="rp-stat"><b>{s.lessonsCompleted}</b><span>lessons completed</span></div>
          <div className="rp-stat"><b>{s.attemptsTotal}</b><span>exercises answered</span></div>
          <div className="rp-stat"><b>{s.accuracy === null ? ": " : `${s.accuracy}%`}</b><span>accuracy</span></div>
          <div className="rp-stat"><b>{s.activeDays}</b><span>active days</span></div>
          <div className="rp-stat"><b>{s.skillsReviewed}</b><span>skills reviewed</span></div>
        </div>

        {s.courses.length > 0 && (
          <div className="rp-section">
            <h2>Coursework</h2>
            <table className="rp-table">
              <thead><tr><th>Course</th><th>Progress in period</th></tr></thead>
              <tbody>
                {s.courses.map((c, i) => (
                  <tr key={i}>
                    <td>{c.title}{c.lens ? ` (through ${c.lens})` : ""}</td>
                    <td>{c.lessons_done} lessons completed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rp-section">
          <h2>Summary</h2>
          {editing ? (
            <textarea className="input" rows={8} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          ) : (
            <div className="rp-narrative">{narrative.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
          )}
        </div>

        <div className="rp-sign">
          <div className="rp-line" /><span>Guide signature</span>
          <div className="rp-line" /><span>Date</span>
        </div>
        <p className="rp-foot">Generated by Well of Wisdom · a free, open-source learning platform</p>
      </div>
    </>
  );
}
