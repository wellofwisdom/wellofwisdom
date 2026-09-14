// SPDX-License-Identifier: AGPL-3.0-or-later
// The lesson player: articles, videos, exercises with grading feedback,
// hints, explain-my-mistake, and completion. Focus mode. No nav chrome.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import type { ItemNode, LearnLesson, Submission } from "../../types";
import { linkProps } from "../../router";
import ArticleItem from "./items/ArticleItem";
import ExerciseItem from "./items/ExerciseItem";
import VideoItem from "./items/VideoItem";
import ProjectItem from "./items/ProjectItem";


export default function LessonPlayer({ lessonId, onNavigate, onLogout }: {
  lessonId: number; onNavigate: (hash: string) => void; onLogout: () => void;
}) {
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [nextLesson, setNextLesson] = useState<{ id: number; title: string } | null>(null);
  const completionLogged = useRef(false);

  const load = () =>
    api<{ lesson: LearnLesson; solved: Record<string, boolean>; submissions: Record<string, Submission> }>(`/api/learn/lessons/${lessonId}`)
      .then((d) => {
        setLesson(d.lesson);
        setSolved(d.solved || {});
        setSubmissions(d.submissions || {});
        // find the next lesson in course order for the completion flow
        api<{ course: { units: { lessons: { id: number; title: string }[] }[] } }>(
          `/api/learn/courses/${d.lesson.course_id}`
        )
          .then((c) => {
            const flat = c.course.units.flatMap((u) => u.lessons);
            const idx = flat.findIndex((l) => l.id === lessonId);
            if (idx >= 0 && idx < flat.length - 1) setNextLesson(flat[idx + 1]);
          })
          .catch(() => {});
      })
      .catch(() => setError("Could not load this lesson."));

  useEffect(() => {
    load();
  }, [lessonId]);

  const onSolved = (key: string, correct: boolean | null) => {
    setSolved((prev) => {
      const next = { ...prev };
      if (correct === true) next[key] = true;
      else if (!(key in next)) next[key] = false;
      return next;
    });
  };

  const gradableKeys = useMemo(() => {
    if (!lesson) return [];
    const keys: string[] = [];
    for (const item of lesson.items) {
      if (item.type === "exercise") keys.push(`${item.id}:0`);
      if (item.type === "video") (item.content.questions || []).forEach((_: unknown, i: number) => keys.push(`${item.id}:${i}`));
    }
    return keys;
  }, [lesson]);

  // A project is finished when it has been handed in, which is the same rule
  // the server applies to the course tree.
  const projectIds = useMemo(
    () => (lesson ? lesson.items.filter((i) => i.type === "project").map((i) => String(i.id)) : []),
    [lesson]
  );

  useEffect(() => {
    const gradedDone = gradableKeys.every((k) => solved[k]);
    const handedIn = projectIds.every((id) => submissions[id] && submissions[id].status !== "draft");
    if (gradableKeys.length + projectIds.length > 0 && gradedDone && handedIn) setDone(true);
  }, [solved, gradableKeys, projectIds, submissions]);

  // log completion once: feeds the guide's Progress page
  useEffect(() => {
    if (done && lesson && !completionLogged.current) {
      completionLogged.current = true;
      api(`/api/learn/lessons/${lesson.id}/complete`, { method: "POST" }).catch(() => {});
    }
  }, [done, lesson]);

  if (error) return <div className="kid"><div className="kidcard"><h2>{error}</h2></div></div>;
  if (!lesson) return <div className="kid"><div className="skel" style={{ width: "100%", height: 200 }} /></div>;

  return (
    <div className="lessonwrap">
      <header className="lessontop">
        <button className="btn ghost" type="button" onClick={() => onNavigate(`course/${lesson.course_id}`)}>← {lesson.course_title}</button>
        <button className="btn ghost" type="button" title="Print this lesson as a worksheet"
          onClick={() => window.open(`/print/lesson/${lesson.id}`, "_blank")}>🖨️</button>
        <span className="grow" />
        <button className="iconbtn" onClick={onLogout} aria-label="Sign out" type="button">⎋</button>
      </header>

      <div className="lessoncard">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{lesson.title}</h1>
        {lesson.summary && <p className="muted" style={{ marginBottom: 14 }}>{lesson.summary}</p>}

        {lesson.items.map((item) => (
          <LessonItem
            key={item.id}
            item={item}
            solved={solved}
            onSolved={onSolved}
            submission={submissions[String(item.id)] || null}
            onSubmission={(sub) => setSubmissions((prev) => ({ ...prev, [String(sub.item_id)]: sub }))}
          />
        ))}

        {done && (
          <div className="complete">
            <span aria-hidden="true" style={{ fontSize: 34 }}>🎉</span>
            <strong>Lesson complete!</strong>
            <span className="muted small" aria-hidden="true">Photo finish: snap what you made and share it with your guide.</span>
            {nextLesson ? (
              <button className="btn primary big" type="button" onClick={() => onNavigate(`lesson/${nextLesson.id}`)}>
                Next lesson: {nextLesson.title} →
              </button>
            ) : (
              <button className="btn primary big" type="button" onClick={() => onNavigate(`course/${lesson.course_id}`)}>
                Back to the course
              </button>
            )}
            {nextLesson && (
              <a className="muted small" {...linkProps(`course/${lesson.course_id}`)}>back to the course</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LessonItem({ item, solved, onSolved, submission, onSubmission }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
}) {
  if (item.type === "article") return <ArticleItem item={item} />;
  if (item.type === "project") return <ProjectItem item={item} submission={submission} onSubmission={onSubmission} />;
  if (item.type === "video") return <VideoItem item={item} solved={solved} onSolved={onSolved} />;
  return <ExerciseItem item={item} solved={solved} onSolved={onSolved} qKey={`${item.id}:0`} qIdx={0} question={null} />;
}
