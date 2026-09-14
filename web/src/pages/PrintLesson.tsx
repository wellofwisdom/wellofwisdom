// SPDX-License-Identifier: AGPL-3.0-or-later
// Printable worksheet for a lesson: worksheet mode and lesson-plan mode.
// Worksheet: articles + exercises with answer lines. Lesson plan: objectives,
// standards, materials, timing, and exercises with answers for the guide.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { CourseTree, LearnLesson } from "../types";
import { RichText, MathText } from "../lib/rich";

type LessonData = { title: string; courseTitle: string; summary: string | null; standards: string[]; items: any[] };

export default function PrintLesson({ lessonId, role }: { lessonId: number; role: "parent" | "learner" }) {
  const [data, setData] = useState<LessonData | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"worksheet" | "plan">("worksheet");

  useEffect(() => {
    (async () => {
      try {
        if (role === "learner") {
          const d = await api<{ lesson: LearnLesson }>(`/api/learn/lessons/${lessonId}`);
          const s = (d.lesson as unknown as { standards?: string[] }).standards || [];
          setData({ title: d.lesson.title, courseTitle: d.lesson.course_title, summary: d.lesson.summary || null, standards: s, items: d.lesson.items });
        } else {
          const trees = await api<{ courses: { id: number }[] }>("/api/courses");
          for (const c of trees.courses) {
            const d = await api<{ course: CourseTree }>(`/api/courses/${c.id}`);
            for (const u of d.course.units) {
              for (const l of u.lessons) {
                if (l.id === lessonId) {
                  const s = (l as unknown as { standards?: string[] }).standards || [];
                  setData({ title: l.title, courseTitle: d.course.title, summary: (l as unknown as { summary?: string | null }).summary || null, standards: s, items: l.items });
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
  if (!data) return <div className="printpage"><p>Loading...</p></div>;

  if (mode === "plan" && role === "parent") {
    return <LessonPlan data={data} onMode={setMode} />;
  }

  let exNum = 0;
  return (
    <div className="printpage">
      <div className="noprint row" style={{ marginBottom: 12, gap: 8 }}>
        <button className="btn" type="button" onClick={() => window.print()}>Print</button>
        <button className="btn ghost" type="button" onClick={() => window.close()}>Close</button>
        {role === "parent" && <button className="btn ghost" type="button" onClick={() => setMode("plan")}>Lesson plan</button>}
      </div>
      <h1>{data.title}</h1>
      <p className="printsub">{data.courseTitle} - Well of Wisdom - {new Date().toLocaleDateString()}</p>
      <p className="printsub">Name: ______________________________</p>
      {data.standards.length > 0 && <p className="printsub">Standards: {data.standards.join(", ")}</p>}

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
              <div className="printprompt">Watch: {item.content.title}. Then answer in your notebook.</div>
            </section>
          );
        }
        if (item.type === "project") {
          return (
            <section key={item.id} className="printsection printex">
              <div className="printprompt">Project: <strong>{item.content.title}</strong></div>
              <RichText text={item.content.description || ""} />
            </section>
          );
        }
        return null;
      })}
    </div>
  );
}

function LessonPlan({ data, onMode }: { data: LessonData; onMode: (m: "worksheet" | "plan") => void }) {
  // Timing: articles 5 min, exercises 2 min each, videos by length (fallback 8), projects 20 min
  function estimate() {
    let mins = 0;
    for (const it of data.items) {
      if (it.type === "article") mins += 5;
      else if (it.type === "exercise") mins += 2;
      else if (it.type === "video") {
        const c = it.content || {};
        const dur = Number(c.durationSec || c.lengthSec) || 0;
        mins += dur ? Math.max(3, Math.ceil(dur / 60)) : 8;
      } else if (it.type === "project") mins += 20;
    }
    return mins;
  }
  const mins = estimate();
  const materials = data.items
    .filter((it) => it.type === "project" && String((it.content || {}).description || "").trim())
    .map((it) => (it.content as { title?: string; description?: string }));
  const exercises = data.items.filter((it) => it.type === "exercise");

  return (
    <div className="printpage">
      <div className="noprint row" style={{ marginBottom: 12, gap: 8 }}>
        <button className="btn" type="button" onClick={() => window.print()}>Print</button>
        <button className="btn ghost" type="button" onClick={() => window.close()}>Close</button>
        <button className="btn ghost" type="button" onClick={() => onMode("worksheet")}>Worksheet</button>
      </div>
      <h1>{data.title} - Lesson plan</h1>
      <p className="printsub">{data.courseTitle} - Well of Wisdom - {new Date().toLocaleDateString()}</p>
      <p className="printsub">Estimated time: {mins} minutes</p>

      {data.summary && (
        <section className="printsection">
          <h2>Objectives</h2>
          <p>{data.summary}</p>
        </section>
      )}

      {data.standards.length > 0 && (
        <section className="printsection">
          <h2>Standards</h2>
          <p>{data.standards.join(", ")}</p>
        </section>
      )}

      {materials.length > 0 && (
        <section className="printsection">
          <h2>Materials</h2>
          {materials.map((m, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              {m.title && <strong>{m.title}: </strong>}
              <span>{m.description}</span>
            </div>
          ))}
        </section>
      )}

      {exercises.length > 0 && (
        <section className="printsection">
          <h2>Exercises with answers (guide copy)</h2>
          {exercises.map((it, idx) => {
            const c = it.content || {};
            const answerText = c.kind === "mcq"
              ? ((c.choices || []).find((ch: any) => ch.id === c.answer) || {}).text || String(c.answer || "")
              : String(c.answer ?? "");
            return (
              <div key={it.id} style={{ marginBottom: 12 }}>
                <div><strong>{idx + 1}.</strong> <MathText text={c.prompt || ""} /></div>
                {c.kind === "mcq" && (
                  <ol className="printchoices" type="A">
                    {(c.choices || []).map((ch: any, i: number) => (
                      <li key={i} style={{ fontWeight: ch.id === c.answer ? 700 : 400 }}><MathText text={ch.text} /></li>
                    ))}
                  </ol>
                )}
                {c.answer != null && String(c.answer).trim() !== "" && <p><strong>Answer:</strong> <MathText text={answerText} /></p>}
                {c.explanation && <p className="muted small">Why: {c.explanation}</p>}
              </div>
            );
          })}
        </section>
      )}

      {exercises.length === 0 && <p className="muted">No exercises in this lesson.</p>}
    </div>
  );
}
