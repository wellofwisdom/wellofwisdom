// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner course view: units → lessons with done states + progress.
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../api";
import type { LearnCourseTree } from "../../types";
import CoursePath from "./CoursePath";
import "./CoursePath.css";
import AdventureBanner from "./AdventureBanner";

export default function CourseView({ courseId, onNavigate, onLogout: _onLogout }: {
  courseId: number; onNavigate: (hash: string) => void; onLogout: () => void; // shell owns the logout button now, this stays for compat
}) {
  const { t } = useT();
  const [course, setCourse] = useState<LearnCourseTree | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ course: LearnCourseTree }>(`/api/learn/courses/${courseId}`)
      .then((d) => setCourse(d.course))
      .catch(() => setError(true));
  }, [courseId]);

  if (error) return <div className="kid"><div className="kidcard"><h2>{t("course.notFound")}</h2></div></div>;
  if (!course) return <div className="kid"><div className="skel" style={{ width: "100%", height: 160 }} /></div>;

  return (
    <div className="courseview">
      <div className="courseview-head">
        <button className="btn ghost" type="button" data-nav data-say={t("course.backHome")} onClick={() => onNavigate("")}>← {t("course.backHome")}</button>
        <div className="grow" />
      </div>

      <div className="hi" style={{ fontSize: 24 }}>{course.title}</div>
      {course.description && <p className="sub">{course.description}</p>}

      <CoursePath course={course} onNavigate={onNavigate} />

      <AdventureBanner courseId={courseId}
        lessonsDone={course.progress.lessonsDone}
        lessonsTotal={course.progress.lessonsTotal}
        onNavigate={onNavigate} />

      {course.progress.lessonsTotal === 0 && (
        <div className="kidcard" style={{ marginTop: 8 }}>
          <div className="big" aria-hidden="true">🌱</div>
          <h2 style={{ margin: "10px 0 6px" }}>{t("course.lessonsComingSoonTitle")}</h2>
          <p className="muted">{t("course.lessonsComingSoonHint")}</p>
          <button className="btn" type="button" onClick={() => onNavigate("")} style={{ marginTop: 14 }}>{t("course.backToCourses")}</button>
        </div>
      )}
      <details className="courseview-list" style={{ marginTop: 18 }}>
        <summary className="muted small" style={{ cursor: "pointer" }}>{t("course.showAsList")}</summary>
        {course.units.map((u, ui) => (
          <div key={u.id} style={{ width: "100%", marginTop: 12 }}>
            <h2 style={{ fontSize: 14, margin: "0 0 6px 4px" }}>{t("course.unitTitle", { num: String(ui+1), title: u.title })}</h2>
            {u.lessons.length === 0 ? (
              <p className="muted small" style={{ padding: "6px 4px" }}>{t("course.noLessonsYet")}</p>
            ) : u.lessons.map((l, li) => (
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
      </details>
    </div>
  );
}
