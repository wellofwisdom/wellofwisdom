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
  const langKinds = new Set(["vocab_card", "translate", "dialogue", "listen_choice", "listen_repeat", "cloze", "match", "categorize", "order"]);
  const hasLang = data.items.some((it) => it.type === "exercise" && langKinds.has(String(it.content?.kind || "")));
  const firstVocab = (() => {
    for (const it of data.items) {
      if (it.content?.kind !== "vocab_card") continue;
      const lemma = String(it.content?.lemma || it.content?.form || it.content?.prompt || "").trim();
      const gloss = String(it.content?.gloss || "").trim();
      if (lemma && gloss) return { lemma, gloss };
    }
    return null;
  })();
  const flashcards = data.items.filter((it) => it.type === "flashcards");
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
      {hasLang && !firstFractionAnswer && (
        <div className="printexplain" role="note" aria-label="How to do it">
          <strong>How to use this sheet - French.</strong> Read the French, write the meaning, say it aloud.
          {firstVocab ? <> For example <em>{firstVocab.lemma}</em> means <em>{firstVocab.gloss}</em>. Write it, then check with the example sentence.</> : <> Look for the hints, write your answer on the lines, and use the 5 practice rows at the end to copy each new word once.</>}
        </div>
      )}
      {hasFraction && hasLang && firstVocab && (
        <div className="printexplain" role="note" aria-label="How to do it French part">
          <strong>French tip.</strong> <em>{firstVocab.lemma}</em> means <em>{firstVocab.gloss}</em>. Write the English, then say the French aloud.
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
        if (item.type === "flashcards") {
          const cards = Array.isArray(item.content?.cards) ? item.content.cards : [];
          if (!cards.length) return null;
          return (
            <section key={item.id} className="printsection">
              <h2>Words to know</h2>
              <div className="printvocabgrid" role="list" aria-label="Vocabulary cards">
                {cards.slice(0, 8).map((card: any, i: number) => (
                  <div key={i} className="printvocabcard" role="listitem">
                    <div className="printvocabfront"><MathText text={String(card.front || "")} /></div>
                    <div className="printvocabback"><span className="printvocablabel">means</span> <MathText text={String(card.back || "")} /></div>
                  </div>
                ))}
              </div>
            </section>
          );
        }
        if (item.type === "figure") {
          return (
            <section key={item.id} className="printsection">
              {item.content.caption && <p className="printsub" style={{ fontStyle: "italic" }}>{item.content.caption}</p>}
              {item.content.alt && <p className="muted small">{item.content.alt}</p>}
            </section>
          );
        }
        if (item.type === "audio") {
          const transcript = String(item.content?.transcript || item.content?.text || "").trim();
          return (
            <section key={item.id} className="printsection printex">
              <div className="printprompt">Listen: <strong>{item.content.title || "Audio"}</strong></div>
              {transcript && <div className="printaudio"><span className="printaudiolabel">Script:</span> <RichText text={transcript.slice(0, 600)} /></div>}
              <div className="printlines"><div /><div /></div>
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
          if (c.kind === "vocab_card") {
            const lemma = String(c.lemma || c.form || c.prompt || "").trim();
            const example = String(c.example || "").trim();
            const exampleGloss = String(c.exampleGloss || "").trim();
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt || `What does ${lemma} mean?`} /></div>
                <div className="printvocab" aria-label={`Vocabulary ${lemma}`}>
                  <div className="printvocabmain"><MathText text={lemma} /></div>
                  <div className="printvocabwrite">Write the meaning: _________________________</div>
                </div>
                {example && (
                  <div className="printaudio" style={{ marginTop: 8 }}>
                    <span className="printaudiolabel">Example:</span> <MathText text={example} />
                    {exampleGloss && <span className="muted small" style={{ marginLeft: 6 }}>({exampleGloss})</span>}
                  </div>
                )}
                {c.hints && Array.isArray(c.hints) && c.hints[0] && <div className="printhint">Hint: {String(c.hints[0])}</div>}
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
                <div className="printlines"><div /><div /></div>
              </section>
            );
          }
          if (c.kind === "translate") {
            const dir = String(c.direction || "").trim();
            const dirLabel = dir === "en_to_es" ? "To Spanish" : dir === "es_to_en" ? "To English" : "";
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /> {dirLabel && <span className="muted small"> ({dirLabel})</span>}</div>
                <div className="printlines">
                  <div /><div /><div />
                </div>
                {c.hints && Array.isArray(c.hints) && c.hints[0] && <div className="printhint">Hint: {String(c.hints[0])}</div>}
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "dialogue") {
            const scene = String(c.scene || "").trim();
            const goals = Array.isArray(c.goals) ? c.goals : [];
            const turns = Number(c.turns || 3);
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                {scene && <div className="printdialogue"><div className="printdialoguebubble"><MathText text={scene} /></div></div>}
                {goals.length > 0 && (
                  <div className="printgoals">
                    <strong className="small">Goals:</strong>
                    <ul>{goals.slice(0, 4).map((g: string, i: number) => <li key={i}><MathText text={g} /></li>)}</ul>
                  </div>
                )}
                <div className="printturns" aria-label={`Write ${turns} replies`}>
                  {Array.from({ length: Math.min(6, Math.max(2, turns)) }, (_, i) => (
                    <div key={i} className="printturn">
                      <span className="printturnlabel">{i + 1}.</span> <span className="printturnline" />
                    </div>
                  ))}
                </div>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "listen_choice") {
            const audioText = String(c.audioText || "").trim();
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <div className="printaudio">
                  <span className="printaudiolabel">Listen:</span> {audioText ? <em><MathText text={audioText} /></em> : <span className="muted small">play the audio, then choose</span>}
                </div>
                <ol className="printchoices" type="A">
                  {(c.choices || []).map((ch: any, i: number) => (
                    <li key={i}><MathText text={ch.text} /></li>
                  ))}
                </ol>
                <div className="printlines"><div /><div /></div>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "listen_repeat") {
            const audioText = String(c.audioText || c.expected || "").trim();
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <div className="printaudio">
                  <span className="printaudiolabel">Listen and repeat:</span> {audioText ? <em><MathText text={audioText} /></em> : null}
                </div>
                <div className="printlines">
                  <div className="printrepeathint">Write what you heard:</div>
                  <div /><div />
                </div>
                {c.hints && Array.isArray(c.hints) && c.hints[0] && <div className="printhint">Hint: {String(c.hints[0])}</div>}
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "cloze") {
            const text = String(c.text || c.prompt || "").trim();
            const rendered = text.replace(/\[\[([^\]]+)\]\]/g, " __________ ");
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt || "Complete the sentence."} /></div>
                <div className="printcloze"><MathText text={rendered} /></div>
                {c.hints && Array.isArray(c.hints) && c.hints[0] && <div className="printhint">Hint: {String(c.hints[0])}</div>}
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
                <div className="printlines"><div /><div /></div>
              </section>
            );
          }
          if (c.kind === "match") {
            const left = Array.isArray(c.left) ? c.left : [];
            const right = Array.isArray(c.right) ? c.right : [];
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <div className="printmatch" aria-label="Match the pairs">
                  <div className="printmatchcol">
                    {left.map((it: any, i: number) => (
                      <div key={i} className="printmatchcell">{i + 1}. <MathText text={it.text} /></div>
                    ))}
                  </div>
                  <div className="printmatchmid" aria-hidden="true">→</div>
                  <div className="printmatchcol">
                    {right.map((it: any, i: number) => (
                      <div key={i} className="printmatchcell">{String.fromCharCode(65 + i)}. <MathText text={it.text} /></div>
                    ))}
                  </div>
                </div>
                <p className="muted small" style={{ marginTop: 6 }}>Draw a line from each number to its letter.</p>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "categorize") {
            const buckets = Array.isArray(c.buckets) ? c.buckets : [];
            const cards = Array.isArray(c.cards) ? c.cards : [];
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                {buckets.length > 0 && (
                  <div className="printbuckets">
                    {buckets.map((b: any, i: number) => (
                      <div key={i} className="printbucket"><strong>{b.label || b.title || `Group ${i + 1}`}</strong></div>
                    ))}
                  </div>
                )}
                <div className="printvocabgrid" style={{ marginTop: 8 }}>
                  {cards.slice(0, 8).map((card: any, i: number) => (
                    <div key={i} className="printvocabcard small"><MathText text={String(card.text || card.label || "")} /></div>
                  ))}
                </div>
                <p className="muted small" style={{ marginTop: 6 }}>Write each word under its group.</p>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "order") {
            const items = Array.isArray(c.items) ? c.items : Array.isArray(c.choices) ? c.choices : [];
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <div className="printorder">
                  {items.map((it: any, i: number) => (
                    <span key={i} className="printorderchip"><MathText text={String(it.text || it.label || it)} /></span>
                  ))}
                </div>
                <p className="muted small" style={{ marginTop: 6 }}>Put the words in order on the lines below.</p>
                <div className="printlines"><div /><div /></div>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
              </section>
            );
          }
          if (c.kind === "multi") {
            return (
              <section key={item.id} className="printsection printex">
                <div className="printprompt"><strong>{exNum}.</strong> <MathText text={c.prompt} /></div>
                <ol className="printchoices" type="A">
                  {(c.choices || []).map((ch: any, i: number) => (
                    <li key={i}><MathText text={ch.text} /> <span className="muted small">☐</span></li>
                  ))}
                </ol>
                <p className="muted small">Check all that apply.</p>
                {c.explanation && <div className="printexplain"><strong>Why:</strong> {c.explanation}</div>}
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
      {hasLang && (
        <section className="printsection" aria-label="Practice">
          <h2>Try on your own - French</h2>
          <p className="muted small" style={{ marginBottom: 8 }}>Copy each new French word once, write the meaning, and say it aloud. No screen needed.</p>
          <table className="printpractice" aria-label="Practice rows">
            <thead><tr><th>#</th><th>French</th><th>English</th><th>Write it again</th></tr></thead>
            <tbody>
              {[1,2,3,4,5].map((n) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="printcellwrite" style={{ minWidth: 120 }}>________________</td>
                  <td className="printcellwrite">________________</td>
                  <td className="printcellwrite">________________</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {flashcards.length > 0 && !hasLang && (
        <section className="printsection" aria-label="Practice">
          <h2>Try on your own</h2>
          <table className="printpractice" aria-label="Practice rows">
            <thead><tr><th>#</th><th>Write</th><th>Write again</th></tr></thead>
            <tbody>
              {[1,2,3,4,5].map((n) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="printcellwrite">________________________________</td>
                  <td className="printcellwrite">________________________________</td>
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
            let answerText = "";
            if (c.kind === "mcq") {
              answerText = ((c.choices || []).find((ch: any) => ch.id === c.answer) || {}).text || String(c.answer || "");
            } else if (c.kind === "multi") {
              const ans = Array.isArray(c.answer) ? c.answer : [];
              answerText = ans.map((id: string) => ((c.choices || []).find((ch: any) => ch.id === id) || {}).text || id).join(", ");
            } else if (c.kind === "fraction" && c.answer && typeof c.answer === "object" && !Array.isArray(c.answer)) {
              answerText = `${(c.answer as any).numerator}/${(c.answer as any).denominator}`;
            } else if (c.kind === "vocab_card") {
              answerText = String(c.gloss || c.answer || "");
              if (Array.isArray(c.alternatives) && c.alternatives.length) answerText += ` (also ${c.alternatives.join(", ")})`;
            } else if (c.kind === "translate") {
              answerText = String(c.expected || c.answer || "");
              if (Array.isArray(c.alternatives) && c.alternatives.length) answerText += `; also ${c.alternatives.slice(0, 3).join(" / ")}`;
            } else if (c.kind === "dialogue") {
              answerText = Array.isArray(c.goals) ? c.goals.join(" / ") : "";
            } else if (c.kind === "listen_choice") {
              const picked = (c.choices || []).find((ch: any) => ch.id === c.answer);
              answerText = picked ? picked.text : String(c.answer || "");
            } else if (c.kind === "listen_repeat") {
              answerText = String(c.expected || "");
            } else if (c.kind === "cloze") {
              answerText = Array.isArray(c.blanks) ? c.blanks.map((b: any) => `${b.id}: ${(b.accept || []).join(" / ") || b.answer || ""}`).join(", ") : "";
            } else if (c.kind === "match" && c.answer && typeof c.answer === "object") {
              answerText = Object.entries(c.answer).map(([l, r]) => `${l} -> ${r}`).join(", ");
            } else {
              answerText = String(c.answer ?? "");
            }
            return (
              <div key={it.id} style={{ marginBottom: 12 }}>
                <div><strong>{idx + 1}.</strong> <MathText text={c.prompt || c.text || ""} /></div>
                {c.kind === "mcq" && (
                  <ol className="printchoices" type="A">
                    {(c.choices || []).map((ch: any, i: number) => (
                      <li key={i} style={{ fontWeight: ch.id === c.answer ? 700 : 400 }}><MathText text={ch.text} /></li>
                    ))}
                  </ol>
                )}
                {c.kind === "multi" && (
                  <ol className="printchoices" type="A">
                    {(c.choices || []).map((ch: any, i: number) => (
                      <li key={i} style={{ fontWeight: Array.isArray(c.answer) && c.answer.includes(ch.id) ? 700 : 400 }}><MathText text={ch.text} /></li>
                    ))}
                  </ol>
                )}
                {c.kind === "fraction" && (
                  <div className="printfrac small" aria-hidden="true">
                    <span className="printfracbar small">{Array.from({ length: Math.min(12, Math.max(2, Number(c.parts ?? c.denominator ?? 4))) }, (_, i) => <span key={i} className="printfracseg" />)}</span>
                  </div>
                )}
                {c.kind === "vocab_card" && c.lemma && <p><span className="muted small">Word:</span> {c.lemma} {c.form && c.form !== c.lemma ? `(${c.form})` : ""}</p>}
                {c.kind === "listen_choice" && c.audioText && <p className="muted small">Audio: {c.audioText}</p>}
                {c.kind === "listen_repeat" && c.expected && <p className="muted small">Expected: {c.expected}</p>}
                {c.kind === "cloze" && c.text && <p className="muted small">Text: {String(c.text).replace(/\[\[([^\]]+)\]\]/g, "[$1]")}</p>}
                {answerText && String(answerText).trim() !== "" && <p><strong>Answer:</strong> <MathText text={answerText} /></p>}
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
