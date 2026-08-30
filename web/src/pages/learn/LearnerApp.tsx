// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner app: routes between home (course grid), course view, lesson player.
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Me, LearnCourse } from "../../types";
import CourseView from "./CourseView";
import Practice from "./Practice";
import LessonPlayer from "./LessonPlayer";
import { IconLogout } from "../../components/Icons";

interface PathPlan {
  id: number;
  title: string;
  subject: string;
  milestones_total: number;
  milestones_done: number;
  next: { id: number; title: string; target_date: string | null; course_id: number | null } | null;
}

export default function LearnerApp({ me, route, onNavigate, onLogout }: { me: Me; route: string; onNavigate: (hash: string) => void; onLogout: () => void }) {
  const [courses, setCourses] = useState<(LearnCourse & { lessons_done?: number })[] | null>(null);
  const [reviewsDue, setReviewsDue] = useState<number | null>(null);
  const [paths, setPaths] = useState<PathPlan[] | null>(null);
  const [upcoming, setUpcoming] = useState<{ label: string; date: string }[] | null>(null);

  useEffect(() => {
    if (route === "" || route === "home") {
      api<{ courses: (LearnCourse & { lessons_done?: number })[] }>("/api/learn/courses")
        .then((d: { courses: (LearnCourse & { lessons_done?: number })[] }) => setCourses(d.courses))
        .catch(() => setCourses([]));
      api<{ due: number }>("/api/learn/review")
        .then((d: { due: number }) => setReviewsDue(d.due || 0))
        .catch(() => setReviewsDue(0));
      api<{ plans: PathPlan[] }>("/api/learn/plans")
        .then((d: { plans: PathPlan[] }) => setPaths(d.plans || []))
        .catch(() => setPaths([]));
      api<{ events: { id: number; title: string; on_date: string; kind: string }[]; milestones: { title: string; target_date: string; plan_title: string }[] }>("/api/learn/upcoming")
        .then((d) => setUpcoming([
          ...(d.events || []).map((e) => ({ label: e.title, date: e.on_date })),
          ...(d.milestones || []).map((m) => ({ label: `${m.title}`, date: m.target_date })),
        ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)))
        .catch(() => setUpcoming([]));
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
      {upcoming && upcoming.length > 0 && (
        <div className="comingup">
          {upcoming.map((u, i) => (
            <div key={i} className="cu-row">
              <span className="cu-date">{u.date.slice(5)}</span>
              <span>{u.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="hi">Hi, {me.name.split(" ")[0]}!</div>
      <p className="sub">Pick a course and dive in.</p>

      {paths && paths.map((p) => (
        <button key={p.id} type="button" className="kidcourse" onClick={() => p.next?.course_id ? onNavigate(`course/${p.next.course_id}`) : onNavigate("")} style={{ opacity: p.next ? 1 : 0.75 }}>
          <span className="kc-icon" aria-hidden="true">🗺️</span>
          <span className="kc-body">
            <span className="kc-title">{p.title}</span>
            <span className="kc-sub">
              {p.next
                ? `Next up: ${p.next.title}${p.next.target_date ? ` · by ${p.next.target_date}` : ""}`
                : "All milestones have courses — keep going below"}
            </span>
            <span className="progressbar mini"><span style={{ width: `${p.milestones_total ? Math.round((p.milestones_done / p.milestones_total) * 100) : 0}%`, display: "block", height: "100%", background: "var(--accent)" }} /></span>
          </span>
          <span className="kc-go" aria-hidden="true">→</span>
        </button>
      ))}

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
