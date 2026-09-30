// SPDX-License-Identifier: AGPL-3.0-or-later
// Portfolio assembly for print: days, coursework, returned work, badges.
//
// Read-only assembly. No new table, no save. Every section is built from
// what already exists and that the caller can already read through
// perm.visibleLearnerIds / canSeeLearner on the server.

interface WorkRow {
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

interface CourseRow {
  title: string;
  lens: string | null;
  lessons_done: number;
  lessons_total: number;
}

interface BadgeRow {
  id: string;
  label: string;
  icon: string;
  description: string | null;
  earnedAt: string;
}

interface BySubjectRow {
  subject: string;
  title: string;
  lessons: number;
}

export interface PortfolioAssembly {
  learner: { id: number; name: string; gradeLevel: number | null };
  familyName: string;
  period: { from: string; to: string };
  stats: {
    lessonsCompleted: number;
    attemptsTotal: number;
    accuracy: number | null;
    activeDays: number;
    courses: CourseRow[];
    bySubject?: BySubjectRow[];
  };
  attendance: { days: number; hours: number; requiredDays: number | null; requiredHours: number | null };
  requirement: { label: string | null };
  work: WorkRow[];
  badges: BadgeRow[];
}

export function PortfolioSheet({ data }: { data: PortfolioAssembly }) {
  const s = data.stats;
  const a = data.attendance;
  const stamp = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="reportpage">
      <div className="rp-head">
        <h1>Portfolio of work</h1>
        <p className="rp-sub">
          {data.learner.name}
          {data.learner.gradeLevel ? ` · grade ${data.learner.gradeLevel}` : ""} · {data.familyName} · {stamp(data.period.from)} to {stamp(data.period.to)}
        </p>
      </div>

      <div className="rp-stats">
        <div className="rp-stat"><b>{a.days}</b><span>days of instruction</span></div>
        {a.hours > 0 && <div className="rp-stat"><b>{a.hours}</b><span>hours logged</span></div>}
        <div className="rp-stat"><b>{s.lessonsCompleted}</b><span>lessons completed</span></div>
        <div className="rp-stat"><b>{s.attemptsTotal}</b><span>exercises answered</span></div>
        <div className="rp-stat"><b>{s.accuracy === null ? "None yet" : `${s.accuracy}%`}</b><span>accuracy</span></div>
        <div className="rp-stat"><b>{data.work.length}</b><span>pieces of work</span></div>
        {data.badges.length > 0 && <div className="rp-stat"><b>{data.badges.length}</b><span>badges earned</span></div>}
      </div>

      {(a.requiredDays || a.requiredHours) && (
        <p className="rp-narrative" style={{ marginTop: 8 }}><em>
          Against {data.requirement.label ? `${data.requirement.label}: ` : "the target recorded by this family: "}
          {a.requiredDays ? `${a.days} of ${a.requiredDays} days` : ""}
          {a.requiredDays && a.requiredHours ? ", " : ""}
          {a.requiredHours ? `${a.hours} of ${a.requiredHours} hours` : ""}.
        </em></p>
      )}

      {s.bySubject && s.bySubject.length > 0 && (
        <section className="rp-section">
          <h2>Time by subject</h2>
          <table className="rp-table">
            <thead><tr><th>Subject</th><th>Lessons in this period</th></tr></thead>
            <tbody>{s.bySubject.map((r, i) => <tr key={i}><td>{r.subject}</td><td>{r.lessons}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {s.courses.length > 0 && (
        <section className="rp-section">
          <h2>Coursework</h2>
          <table className="rp-table">
            <thead><tr><th>Course</th><th>Progress in this period</th></tr></thead>
            <tbody>{s.courses.map((c, i) => <tr key={i}><td>{c.title}{c.lens ? ` (through ${c.lens})` : ""}</td><td>{c.lessons_done} of {c.lessons_total}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {data.work.length > 0 && (
        <section className="rp-section">
          <h2>Returned work</h2>
          {data.work.map((w) => (
            <article key={w.id} className="pf-work">
              <h3>{w.title}</h3>
              <p className="muted small">{w.courseTitle} · {w.lessonTitle} · handed in {stamp(w.submittedAt)}{w.outcome ? ` · ${w.outcome}` : ""}</p>
              {w.brief && <p className="pf-brief"><b>The brief: </b>{w.brief}</p>}
              <div className="pf-body" style={{ whiteSpace: "pre-wrap" }}>{w.body}</div>
              {w.feedback && <div className="pf-feedback"><b>Guide's response</b><p>{w.feedback}</p></div>}
            </article>
          ))}
        </section>
      )}

      {data.badges.length > 0 && (
        <section className="rp-section">
          <h2>Badges</h2>
          <ul>{data.badges.map((b) => <li key={b.id}><span aria-hidden="true">{b.icon} </span><b>{b.label}</b>{b.description ? `: ${b.description}` : ""} · {stamp(b.earnedAt)}</li>)}</ul>
        </section>
      )}

      {data.work.length === 0 && s.courses.length === 0 && data.badges.length === 0 && (
        <section className="rp-section"><p className="rp-narrative">No completed coursework, returned work or badges fall in this period. Widen the dates, or check that work was handed in rather than left as a draft.</p></section>
      )}

      <div className="rp-sign"><div className="rp-line" /><span>Guide signature</span><div className="rp-line" /><span>Date</span></div>
      <p className="rp-foot">Generated by Well of Wisdom · a free, open-source learning platform</p>
    </div>
  );
}
