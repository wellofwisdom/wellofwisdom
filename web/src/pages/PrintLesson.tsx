// SPDX-License-Identifier: AGPL-3.0-or-later
// Printable worksheet for a lesson: worksheet mode and lesson-plan mode.
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
          return;
        }
        try {
          const d = await api<{ lesson: { id: number; course_id: number; course_title: string; title: string; summary: string | null; standards: string[]; items: any[] } }>(`/api/courses/lessons/${lessonId}`);
          setData({ title: d.lesson.title, courseTitle: d.lesson.course_title, summary: d.lesson.summary || null, standards: d.lesson.standards || [], items: d.lesson.items });
          return;
        } catch {
        }
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
  const hasFraction = data.items.some((it) => it.type === "exercise" && (it.content?.kind === "fraction" || String(it.content?.prompt || "").includes("$")));
  const firstFractionAnswer = (() => {
    for (const it of data.items) {
      if (it.type !== "exercise" || it.content?.kind !== "fraction") continue;
      const ans = it.content?.answer;
      const keyed = ans && typeof ans === "object" && !Array.isArray(ans) ? `${(ans as any).numerator ?? ""}/${(ans as any).denominator ?? ""}` : "";
      if (keyed && keyed !== "/") return keyed;
    }
    return null;
  })();
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

      {firstFractionAnswer && (
        <div className="printexplain" role="note" aria-label="How to do it">
          <strong>How to do it - fractions.</strong> Shade the parts. For example {firstFractionAnswer} means shade {(() => { const p = String(firstFractionAnswer).split("/"); return `${p[0]} of ${p[1]}`; })()} equal parts.
        </div>
      )}

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
          if (c.kind === "fraction") {
            const parts = Number(c.parts ?? c.denominator ?? 4);
            const denom = Number.isFinite(parts) && parts >= 2 && parts <= 12 ? parts : 4;
            const answer = c.answer && typeof c.answer === "object" && !Array.isArray(c.answer) ? c.answer as { numerator?: number; denominator?: number } : null;
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <div className="printfrac" aria-label={`Fraction diagram with ${denom} parts${answer ? `, answer ${answer.numerator}/${answer.denominator}` : ""}`}>
                  <div className="printfracbar" role="img" aria-label={`Bar with ${denom} equal parts`}>
                    {Array.from({ length: denom }, (_, i) => (
                      <span key={i} className="printfracseg">{i + 1}</span>
                    ))}
                  </div>
                  <div className="printfraccirc" role="img" aria-label={`Circle with ${denom} equal parts`}>
                    {Array.from({ length: denom }, (_, i) => (
                      <span key={i} className="printfrslice">{i + 1}</span>
                    ))}
                  </div>
                </div>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
                <div className="printlines">
                  <div /><div />
                </div>
              </section>
            );
          }
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
              {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
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
      {hasFraction && (
        <section className="printsection" aria-label="Practice">
          <h2>Try on your own</h2>
          <table className="printpractice" aria-label="Practice rows">
            <thead><tr><th>#</th><th>Shade</th><th>Write</th></tr></thead>
            <tbody>
              {[1,2,3,4,5].map((n) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="printcellbar"><span className="printfracbar small"><span className="printfracseg" /><span className="printfracseg" /><span className="printfracseg" /><span className="printfracseg" /></span></td>
                  <td className="printcellwrite">____ / ____</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function LessonPlan({ data, onMode }: { data: LessonData; onMode: (m: "worksheet" | "plan") => void }) {
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
              : c.kind === "fraction" && c.answer && typeof c.answer === "object" && !Array.isArray(c.answer)
                ? `${(c.answer as any).numerator}/${(c.answer as any).denominator}`
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
                {c.kind === "fraction" && (
                  <div className="printfrac small" aria-hidden="true">
                    <span className="printfracbar small">{Array.from({ length: Math.min(12, Math.max(2, Number(c.parts ?? c.denominator ?? 4))) }, (_, i) => <span key={i} className="printfracseg" />)}</span>
                  </div>
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
