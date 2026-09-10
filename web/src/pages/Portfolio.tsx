// SPDX-License-Identifier: AGPL-3.0-or-later
// The portfolio: the work itself, printed.
//
// The states that do not count days usually ask for a portfolio review, and
// what a reviewer wants is the actual work with the guide's response beside it.
// Everything here already existed in the database, so nothing is kept twice and
// nothing can go stale: ask for a period and it is built from what is true now.
//
// Print is the deliverable. Anything interactive is marked noprint.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "../components/ui";
import { RichText } from "../lib/rich";

interface Work {
  id: number;
  title: string;
  courseTitle: string;
  lessonTitle: string;
  brief: string | null;
  body: string;
  submittedAt: string;
  outcome: string | null;
  feedback: string | null;
}

interface PortfolioData {
  learner: { id: number; name: string; gradeLevel: number | null };
  familyName: string;
  period: { from: string; to: string };
  stats: {
    lessonsCompleted: number;
    attemptsTotal: number;
    accuracy: number | null;
    activeDays: number;
    skillsReviewed: number;
    courses: { title: string; lens: string | null; lessons_done: number; lessons_total: number }[];
  };
  attendance: { days: number; hours: number; requiredDays: number | null; requiredHours: number | null };
  requirement: { label: string | null };
  work: Work[];
  badges: { id: string; label: string; description: string | null; icon: string; earnedAt: string }[];
}

const OUTCOME: Record<string, string> = {
  not_yet: "Not yet",
  nearly: "Nearly there",
  met: "Met",
  exceptional: "Exceptional",
};

function stamp(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function Portfolio({ learnerId, onNavigate }: {
  learnerId: number;
  onNavigate: (h: string) => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const [from, setFrom] = useState(params.get("from") || "");
  const [to, setTo] = useState(params.get("to") || "");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to) {
      // A year back to today is the shape of a filing period, and it is a
      // better first answer than an empty page with two date boxes.
      const now = new Date();
      const back = new Date(now);
      back.setFullYear(back.getFullYear() - 1);
      setFrom(back.toISOString().slice(0, 10));
      setTo(now.toISOString().slice(0, 10));
    }
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setError("");
    api<PortfolioData>(`/api/reports/portfolio/${learnerId}?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError(niceError(e)));
  }, [learnerId, from, to]);

  if (error) return <Panel title="Portfolio"><div className="formerror">{error}</div></Panel>;
  if (!data) return <div className="skel" style={{ height: 220 }} />;

  const s = data.stats;
  const a = data.attendance;

  return (
    <>
      <div className="row wrap noprint" style={{ marginBottom: 12, gap: 8, alignItems: "flex-end" }}>
        <button className="btn ghost" type="button" onClick={() => onNavigate("attendance")}>← Attendance</button>
        <label className="small muted" htmlFor="pf-from">From</label>
        <input id="pf-from" className="input small-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="small muted" htmlFor="pf-to">To</label>
        <input id="pf-to" className="input small-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="grow" />
        <button className="btn primary" type="button" onClick={() => window.print()}>🖨️ Print / PDF</button>
      </div>

      <div className="reportpage">
        <div className="rp-head">
          <div className="rp-nut" aria-hidden="true">🌰</div>
          <h1>Portfolio of Work</h1>
          <p className="rp-sub">
            {data.learner.name}
            {data.learner.gradeLevel ? ` · grade ${data.learner.gradeLevel}` : ""} · {data.familyName}
            {" · "}{stamp(`${data.period.from}T00:00:00`)} to {stamp(`${data.period.to}T00:00:00`)}
          </p>
        </div>

        <div className="rp-stats">
          <div className="rp-stat"><b>{a.days}</b><span>days of instruction</span></div>
          {a.hours > 0 && <div className="rp-stat"><b>{a.hours}</b><span>hours logged</span></div>}
          <div className="rp-stat"><b>{s.lessonsCompleted}</b><span>lessons completed</span></div>
          <div className="rp-stat"><b>{s.attemptsTotal}</b><span>exercises answered</span></div>
          <div className="rp-stat"><b>{s.accuracy === null ? "None yet" : `${s.accuracy}%`}</b><span>accuracy</span></div>
          <div className="rp-stat"><b>{data.work.length}</b><span>pieces of work</span></div>
        </div>

        {(a.requiredDays || a.requiredHours) && (
          <p className="rp-narrative" style={{ marginTop: 0 }}>
            <em>
              Against {data.requirement.label ? `${data.requirement.label}: ` : "the target recorded by this family: "}
              {a.requiredDays ? `${a.days} of ${a.requiredDays} days` : ""}
              {a.requiredDays && a.requiredHours ? ", " : ""}
              {a.requiredHours ? `${a.hours} of ${a.requiredHours} hours` : ""}.
            </em>
          </p>
        )}

        {s.courses.length > 0 && (
          <div className="rp-section">
            <h2>Coursework</h2>
            <table className="rp-table">
              <thead><tr><th>Course</th><th>Progress in this period</th></tr></thead>
              <tbody>
                {s.courses.map((c, i) => (
                  <tr key={i}>
                    <td>{c.title}{c.lens ? ` (through ${c.lens})` : ""}</td>
                    <td>{c.lessons_done} of {c.lessons_total} lessons completed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.work.length > 0 && (
          <div className="rp-section">
            <h2>Work samples</h2>
            {data.work.map((w) => (
              <article key={w.id} className="pf-work">
                <h3>{w.title}</h3>
                <p className="muted small">
                  {w.courseTitle} · {w.lessonTitle} · handed in {stamp(w.submittedAt)}
                  {w.outcome ? ` · ${OUTCOME[w.outcome] || w.outcome}` : ""}
                </p>
                {w.brief && <p className="pf-brief"><b>The brief:</b> {w.brief}</p>}
                <div className="pf-body">{w.body}</div>
                {w.feedback && (
                  <div className="pf-feedback">
                    <b>Guide's response</b>
                    <RichText text={w.feedback} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {data.badges.length > 0 && (
          <div className="rp-section">
            <h2>Earned in this period</h2>
            <ul>
              {data.badges.map((b) => (
                <li key={b.id}>
                  <span aria-hidden="true">{b.icon}</span> <b>{b.label}</b>
                  {b.description ? `: ${b.description}` : ""} ({stamp(b.earnedAt)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.work.length === 0 && s.courses.length === 0 && (
          <div className="rp-section">
            <p className="rp-narrative">
              No completed coursework or handed-in work falls in this period. Widen the dates, or check
              that the work was handed in rather than left as a draft.
            </p>
          </div>
        )}

        <div className="rp-sign">
          <div className="rp-line" /><span>Guide signature</span>
          <div className="rp-line" /><span>Date</span>
        </div>
        <p className="rp-foot">Generated by Well of Wisdom · a free, open-source learning platform</p>
      </div>
    </>
  );
}
