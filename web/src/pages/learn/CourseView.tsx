// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner course view: units → lessons with done states + progress.
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { LearnCourseTree } from "../../types";
import { IconLogout } from "../../components/Icons";

export default function CourseView({ courseId, onNavigate, onLogout }: {
  courseId: number; onNavigate: (hash: string) => void; onLogout: () => void;
}) {
  const [course, setCourse] = useState<LearnCourseTree | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ course: LearnCourseTree }>(`/api/learn/courses/${courseId}`)
      .then((d) => setCourse(d.course))
      .catch(() => setError(true));
  }, [courseId]);

  if (error) return <div className="kid"><div className="kidcard"><h2>Course not found</h2></div></div>;
  if (!course) return <div className="kid"><div className="skel" style={{ width: "100%", height: 160 }} /></div>;

  const pct = course.progress.lessonsTotal ? Math.round((course.progress.lessonsDone / course.progress.lessonsTotal) * 100) : 0;

  return (
    <div className="kid">
      <div className="kidtop">
        <button className="btn ghost" type="button" onClick={() => onNavigate("")}>← Home</button>
        <button className="iconbtn" onClick={onLogout} aria-label="Sign out" type="button"><IconLogout /></button>
      </div>

      <div className="hi" style={{ fontSize: 24 }}>{course.title}</div>
      {course.description && <p className="sub">{course.description}</p>}

      <div style={{ width: "100%", marginBottom: 20 }}>
        <div className="progressbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small" style={{ textAlign: "center", marginTop: 6 }}>
          {course.progress.lessonsDone} of {course.progress.lessonsTotal} lessons done{pct === 100 ? " — you finished it! 🎉" : ""}
        </p>
      </div>

      {course.units.map((u, ui) => (
        <div key={u.id} style={{ width: "100%", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px 4px" }}>Unit {ui + 1}: {u.title}</h2>
          {u.lessons.map((l, li) => (
            <button
              key={l.id}
              type="button"
              className={`lessonbtn${l.done ? " done" : ""}`}
              onClick={() => onNavigate(`lesson/${l.id}`)}
              aria-label={l.done ? `${l.title} (done)` : l.title}
            >
              <span className="lb-check" aria-hidden="true">{l.done ? "✓" : ""}</span>
              <span className="lb-title">{ui + 1}.{li + 1} {l.title}</span>
              <span className="lb-go" aria-hidden="true">{l.done ? "↺" : "→"}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
