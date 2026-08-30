// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent dashboard: greeting, stat bar, getting-started checklist.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { CourseSummary, MeResponse } from "../types";
import { Panel, StatBar } from "../components/ui";
import { IconCheck } from "../components/Icons";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard({
  me,
  onNavigate,
}: {
  me: MeResponse;
  onNavigate: (id: string) => void;
}) {
  const user = me.user!;
  const learners = me.learners || [];
  const hasBg = localStorage.getItem("wow-theme-bg") !== null;
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    api<{ courses: CourseSummary[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  const published = courses?.filter((c) => c.status === "published").length ?? 0;

  const steps: { label: string; done: boolean; go?: () => void }[] = [
    { label: "Create your family", done: true },
    {
      label: `Add a learner${learners.length ? " — you did! 🎉" : ""}`,
      done: learners.length > 0,
      go: () => onNavigate("learners"),
    },
    {
      label: "Pick a look (background + dark mode)",
      done: hasBg,
      go: () => onNavigate("settings"),
    },
    {
      label: "Generate your first course with AI",
      done: (courses?.length ?? 0) > 0,
      go: () => onNavigate("courses"),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>{greeting()}, {user.name.split(" ")[0]} 👋</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{user.familyName} · parent console</p>

      <StatBar
        stats={[
          { label: "Learners", value: learners.length, onClick: () => onNavigate("learners") },
          { label: "Courses", value: courses?.length ?? "…", onClick: () => onNavigate("courses") },
          { label: "Published", value: courses ? published : "…", active: published > 0, onClick: () => onNavigate("courses") },
          { label: "Exercises", value: courses ? courses.reduce((n, c) => n + c.exercise_count, 0) : "…" },
        ]}
      />

      <Panel title="Getting Started" side={`${doneCount} of ${steps.length}`}>
        <div>
          {steps.map((s) => (
            <div key={s.label} className={`checkitem${s.done ? " done" : ""}`}>
              <span className="dot">{s.done && <IconCheck width={12} height={12} />}</span>
              <span className="t">{s.label}</span>
              {!s.done && s.go && (
                <button className="btn ghost" type="button" onClick={s.go}>Do it</button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Recent activity">
        <div className="empty" style={{ padding: "26px 16px" }}>
          <div className="eicon" aria-hidden="true">🌱</div>
          <div className="etitle">Nothing here yet</div>
          <p className="emsg">
            Once your learners start working through courses, their progress and
            wins show up here.
          </p>
        </div>
      </Panel>
    </>
  );
}
