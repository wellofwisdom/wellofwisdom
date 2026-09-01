// SPDX-License-Identifier: AGPL-3.0-or-later
// Printable worksheet for a lesson: articles + exercises with answer lines.
// No answers, no chrome. Works for parents and learners.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { CourseTree, LearnLesson } from "../types";
import { RichText, MathText } from "../lib/rich";

export default function PrintLesson({ lessonId, role }: { lessonId: number; role: "parent" | "learner" }) {
  const [data, setData] = useState<{ title: string; courseTitle: string; items: any[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (role === "learner") {
          const d = await api<{ lesson: LearnLesson }>(`/api/learn/lessons/${lessonId}`);
          setData({ title: d.lesson.title, courseTitle: d.lesson.course_title, items: d.lesson.items });
        } else {
          // Find the lesson inside the parent course tree (answers stripped here).
          const trees = await api<{ courses: { id: number }[] }>("/api/courses");
          for (const c of trees.courses) {
            const d = await api<{ course: CourseTree }>(`/api/courses/${c.id}`);
            for (const u of d.course.units) {
              for (const l of u.lessons) {
                if (l.id === lessonId) {
                  setData({ title: l.title, courseTitle: d.course.title, items: l.items });
                  return;
                }
              }
            }
          }
          setError("Lesson not found.");
        }
      } catch {
        setError("Could not load this lesson.");
      }
    })();
  }, [lessonId, role]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) return <div className="printpage"><p>{error}</p></div>;
  if (!data) return <div className="printpage"><p>Loading…</p></div>;

  let exNum = 0;
  return (
    <div className="printpage">
      <div className="noprint row" style={{ marginBottom: 12 }}>
        <button className="btn" type="button" onClick={() => window.print()}>🖨️ Print</button>
        <button className="btn ghost" type="button" onClick={() => window.close()}>Close</button>
      </div>
      <h1>{data.title}</h1>
      <p className="printsub">{data.courseTitle} · Well of Wisdom · {new Date().toLocaleDateString()}</p>
      <p className="printsub">Name: ______________________________</p>

      {data.items.map((item) => {
        if (item.type === "article") {
          return (
            <section key={item.id} className="printsection">
              {item.content.title && <h2>{item.content.title}</h2>}
              <RichText text={item.content.body || ""} />
            </section>
          );
        }
        if (item.type === "exercise") {
          const c = item.content;
          exNum++;
          return (
            <section key={item.id} className="printsection printex">
              <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
              {c.kind === "mcq" ? (
                <ol className="printchoices" type="A">
                  {(c.choices || []).map((ch: any, i: number) => (
                    <li key={i}><MathText text={ch.text} /></li>
                  ))}
                </ol>
              ) : (
                <div className="printlines">
                  <div /><div />
                </div>
              )}
            </section>
          );
        }
        if (item.type === "video") {
          return (
            <section key={item.id} className="printsection printex">
              <div className="printprompt">▶️ Watch: {item.content.title}. Then answer in your notebook.</div>
            </section>
          );
        }
        if (item.type === "project") {
          return (
            <section key={item.id} className="printsection printex">
              <div className="printprompt">🛠️ Project: <strong>{item.content.title}</strong></div>
              <RichText text={item.content.description || ""} />
            </section>
          );
        }
        return null;
      })}
    </div>
  );
}
