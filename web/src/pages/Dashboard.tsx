// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent dashboard: greeting, stat bar, getting-started checklist.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { CourseSummary, MeResponse } from "../types";
import { Panel, StatBar } from "../components/ui";
import { IconCheck } from "../components/Icons";
import { startPreview } from "../components/PreviewBar";

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
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [reportsCount, setReportsCount] = useState<number | null>(null);

  useEffect(() => {
    api<{ courses: CourseSummary[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
    api<{ submissions: { status: string }[] }>("/api/work")
      .then((d) => setWaiting(d.submissions.filter((s) => s.status === "submitted").length))
      .catch(() => setWaiting(0));
    api<{ reports: unknown[] }>("/api/reports")
      .then((d) => setReportsCount(d.reports.length))
      .catch(() => setReportsCount(0));
  }, []);

  const published = courses?.filter((c) => c.status === "published").length ?? 0;
  const primaryLearner = learners[0] || null;
  const hasPublished = published > 0;
  const hasProgress = (reportsCount ?? 0) > 0 || (courses?.some((c) => c.status === "published") ?? false);

  const steps: { label: string; done: boolean; go?: () => void; inline?: React.ReactNode }[] = [
    {
      label: `Add a learner${learners.length ? " (you did!)" : ""}`,
      done: learners.length > 0,
      go: () => onNavigate("learners"),
    },
    {
      label: `Generate or import a course${(courses?.length ?? 0) > 0 ? " (you did!)" : ""}`,
      done: (courses?.length ?? 0) > 0,
      go: () => onNavigate("studio"),
    },
    {
      label: `Publish it${hasPublished ? " (you did!)" : ""}`,
      done: hasPublished,
      go: () => onNavigate("courses"),
    },
    {
      label: `Open it as the learner${primaryLearner ? "" : " (add a learner first)"}`,
      done: false,
      go: primaryLearner ? () => startPreview(primaryLearner.id, primaryLearner.name) : undefined,
      inline: primaryLearner ? (
        <button className="btn ghost" type="button" onClick={() => startPreview(primaryLearner.id, primaryLearner.name)}>
          Open as {primaryLearner.name}
        </button>
      ) : undefined,
    },
    {
      label: "Read the first progress report",
      done: (reportsCount ?? 0) > 0,
      go: () => onNavigate("records"),
    },
  ];

  // Step 4 is action-only: done when learner has viewed a published course.
  // For now it stays open until they use it; progress step catches the loop.
  void hasProgress;

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <>
      <h2 style={{ marginBottom: 4 }}>{greeting()}, {user.name.split(" ")[0]} 👋</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{user.familyName} · guide console</p>

      {primaryLearner && (
        <div style={{ marginBottom: 16 }}>
          <button
            className="btn primary big"
            type="button"
            onClick={() => startPreview(primaryLearner.id, primaryLearner.name)}
            title="See the app exactly as your learner sees it. The banner at the top explains how to get back."
          >
            Play as {primaryLearner.name}
          </button>
          <span className="hint" style={{ marginLeft: 10 }}>
            Step into the learner world. The banner shows how to get back.
          </span>
        </div>
      )}

      <StatBar
        stats={[
          { label: "Learners", value: learners.length, onClick: () => onNavigate("learners") },
          { label: "Courses", value: courses?.length ?? "…", onClick: () => onNavigate("courses") },
          { label: "Published", value: courses ? published : "…", active: published > 0, onClick: () => onNavigate("courses") },
          { label: "Exercises", value: courses ? courses.reduce((n, c) => n + c.exercise_count, 0) : "…" },
          {
            label: "To read",
            value: waiting === null ? "…" : waiting,
            active: (waiting || 0) > 0,
            onClick: () => onNavigate("work"),
          },
        ]}
      />

      <Panel title="Getting Started" side={`${doneCount} of ${steps.length}`}>
        <div>
          {steps.map((s) => (
            <div key={s.label} className={`checkitem${s.done ? " done" : ""}`}>
              <span className="dot">{s.done && <IconCheck width={12} height={12} />}</span>
              <span className="t">{s.label}</span>
              {s.inline ? s.inline : (!s.done && s.go && (
                <button className="btn ghost" type="button" onClick={s.go}>Do it</button>
              ))}
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
