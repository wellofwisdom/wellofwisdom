// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner app: routes between home (course grid), course view, lesson player.
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Me, LearnCourse } from "../../types";
import CourseView from "./CourseView";
import Practice from "./Practice";
import LessonPlayer from "./LessonPlayer";
import { IconLogout } from "../../components/Icons";

export default function LearnerApp({ me, route, onNavigate, onLogout }: { me: Me; route: string; onNavigate: (hash: string) => void; onLogout: () => void }) {
  const [courses, setCourses] = useState<(LearnCourse & { lessons_done?: number })[] | null>(null);
  const [reviewsDue, setReviewsDue] = useState<number | null>(null);

  useEffect(() => {
    if (route === "" || route === "home") {
      api<{ courses: (LearnCourse & { lessons_done?: number })[] }>("/api/learn/courses")
        .then((d: { courses: (LearnCourse & { lessons_done?: number })[] }) => setCourses(d.courses))
        .catch(() => setCourses([]));
      api<{ due: number }>("/api/learn/review")
        .then((d: { due: number }) => setReviewsDue(d.due || 0))
        .catch(() => setReviewsDue(0));
    }
  }, [route]);

  if (route === "practice") {
    return <Practice onNavigate={onNavigate} onLogout={onLogout} />;
  }
  if (route.startsWith("course/")) {
    const id = Number(route.split("/")[1]);
    return <CourseView courseId={id} onNavigate={onNavigate} onLogout={onLogout} />;
  }
  if (route.startsWith("lesson/")) {
    const id = Number(route.split("/")[1]);
    return <LessonPlayer lessonId={id} onNavigate={onNavigate} onLogout={onLogout} />;
  }

  return (
    <div className="kid">
      <div className="kidtop">
        <span className="chip">🌰 {me.familyName}</span>
        <button className="iconbtn" onClick={onLogout} aria-label="Sign out" title="Sign out" type="button">
          <IconLogout />
        </button>
      </div>
      <div className="hi">Hi, {me.name.split(" ")[0]}!</div>
      <p className="sub">Pick a course and dive in.</p>

      {reviewsDue !== null && reviewsDue > 0 && (
        <button type="button" className="kidcourse practicecard" onClick={() => onNavigate("practice")}>
          <span className="kc-icon" aria-hidden="true">🔁</span>
          <span className="kc-body">
            <span className="kc-title">Practice — {reviewsDue} due now</span>
            <span className="kc-sub">Quick review at exactly the right time to make it stick</span>
          </span>
          <span className="kc-go" aria-hidden="true">→</span>
        </button>
      )}

      {!courses ? (
        <div className="skel" style={{ width: "100%", height: 120 }} />
      ) : courses.length === 0 ? (
        <div className="kidcard">
          <div className="big" aria-hidden="true">🌱</div>
          <h2 style={{ margin: "8px 0 6px" }}>No courses yet</h2>
          <p className="muted">Your guide is setting up your first course. It'll be built around the things you love.</p>
        </div>
      ) : (
        <div style={{ width: "100%", display: "grid", gap: 12 }}>
          {courses.map((c) => {
            const done = c.lessons_done ?? 0;
            const pct = c.lesson_count ? Math.round((done / c.lesson_count) * 100) : 0;
            return (
              <button
                key={c.id}
                type="button"
                className="kidcourse"
                onClick={() => onNavigate(`course/${c.id}`)}
              >
                <span className="kc-icon" aria-hidden="true">{pct === 100 ? "🏆" : c.lens ? "🧵" : "📘"}</span>
                <span className="kc-body">
                  <span className="kc-title">{c.title}</span>
                  <span className="kc-sub">
                    {done}/{c.lesson_count} lessons{c.lens ? ` · through ${c.lens}` : ""}
                  </span>
                  <span className="progressbar mini"><span style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="kc-go" aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
