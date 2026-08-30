// SPDX-License-Identifier: AGPL-3.0-or-later
// Courses list. Generation lives in the Course Studio (its own page).
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import type { CourseSummary } from "../types";
import { Panel, EmptyState, StatBar } from "../components/ui";
import { IconSparkle } from "../components/Icons";

export default function Courses({ onNavigate }: { onNavigate: (hash: string) => void }) {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ courses: CourseSummary[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(niceError(e)));
  }, []);

  const published = courses?.filter((c) => c.status === "published").length ?? 0;
  const drafts = courses?.filter((c) => c.status === "draft").length ?? 0;

  return (
    <>
      <StatBar
        stats={[
          { label: "Courses", value: courses?.length ?? "…" },
          { label: "Published", value: published, active: published > 0 },
          { label: "Drafts", value: drafts },
          { label: "Exercises", value: courses?.reduce((n, c) => n + c.exercise_count, 0) ?? "…" },
        ]}
      />
      <Panel
        title="Your courses"
        side={
          <button className="btn primary" type="button" onClick={() => onNavigate("studio")}>
            <IconSparkle /> Course Studio
          </button>
        }
      >
        {error && <div className="formerror" role="alert">{error}</div>}
        {!courses ? (
          <div className="skel" style={{ height: 80 }} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon="✨"
            title="No courses yet"
            message="The Course Studio builds a complete course around any topic — lessons, exercises, projects — woven through what your learners love. You review every word before they see it."
            action={
              <button className="btn primary big" type="button" onClick={() => onNavigate("studio")}>
                <IconSparkle /> Open the Course Studio
              </button>
            }
          />
        ) : (
          courses.map((c) => (
            <div
              key={c.id}
              className="learnerrow coursecard"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate(`course/${c.id}`)}
              onKeyDown={(e) => e.key === "Enter" && onNavigate(`course/${c.id}`)}
              tabIndex={0}
              role="link"
              aria-label={`Open course ${c.title}`}
            >
              <span className="avatar" aria-hidden="true">{c.lens ? "🧵" : "📘"}</span>
              <div className="meta">
                <div className="n">{c.title}</div>
                <div className="u">
                  {c.unit_count} units · {c.lesson_count} lessons · {c.exercise_count} exercises
                  {c.lens ? ` · through ${c.lens}` : ""}
                  {c.learner_name ? ` · for ${c.learner_name}` : " · for everyone"}
                </div>
              </div>
              <span className={`chip${c.status === "published" ? " on" : ""}`}>
                {c.status === "published" ? "✅ Published" : "📝 Draft"}
              </span>
            </div>
          ))
        )}
      </Panel>
    </>
  );
}
