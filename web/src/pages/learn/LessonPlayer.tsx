// SPDX-License-Identifier: AGPL-3.0-or-later
// The lesson player: articles, videos, exercises with grading feedback,
// hints, explain-my-mistake, and completion. Focus mode. No nav chrome.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, niceError } from "../../api";
import type { ItemNode, LearnLesson } from "../../types";
import { RichText, MathText } from "../../lib/rich";
import { linkProps } from "../../router";
import { VideoPlayer } from "../../components/VideoUI";

interface AttemptResponse {
  correct: boolean | null;
  reveal: { kind: string; explanation: string | null; hint: string | null; answer: string | null };
}

export default function LessonPlayer({ lessonId, onNavigate, onLogout }: {
  lessonId: number; onNavigate: (hash: string) => void; onLogout: () => void;
}) {
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [nextLesson, setNextLesson] = useState<{ id: number; title: string } | null>(null);
  const completionLogged = useRef(false);

  const load = () =>
    api<{ lesson: LearnLesson; solved: Record<string, boolean> }>(`/api/learn/lessons/${lessonId}`)
      .then((d) => {
        setLesson(d.lesson);
        setSolved(d.solved || {});
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

  useEffect(() => {
    if (gradableKeys.length && gradableKeys.every((k) => solved[k])) setDone(true);
  }, [solved, gradableKeys]);

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
          <LessonItem key={item.id} item={item} solved={solved} onSolved={onSolved} />
        ))}

        {done && (
          <div className="complete">
            <span aria-hidden="true" style={{ fontSize: 34 }}>🎉</span>
            <strong>Lesson complete!</strong>
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

// Read-aloud via the browser's built-in speech (offline, no cost, no data
// leaves the device). Speaks the lesson in the interface language.
function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  function toggle() {
    if (typeof speechSynthesis === "undefined") return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    // strip markup/math so LaTeX isn't read aloud as backslash commands
    const speakable = String(text || "")
      .replace(/\$\$?[^$]*\$\$?/g, " ")
      .replace(/[*#>`_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
    if (!speakable) return;
    const u = new SpeechSynthesisUtterance(speakable);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setSpeaking(true);
  }

  return (
    <button
      className="btn ghost small-btn"
      type="button"
      onClick={toggle}
      aria-label={speaking ? "Stop reading aloud" : "Read this aloud"}
      title={speaking ? "Stop" : "Listen"}
    >
      {speaking ? "⏹️ Stop" : "🔊 Listen"}
    </button>
  );
}

function LessonItem({ item, solved, onSolved }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
}) {
  const c = item.content || {};
  if (item.type === "article") {
    return (
      <section className="litem">
        <div className="row" style={{ marginBottom: 4 }}>
          {c.title && <h2 className="grow">{c.title}</h2>}
          <ReadAloud text={`${c.title ? c.title + ". " : ""}${c.body || ""}`} />
        </div>
        <RichText text={c.body || ""} />
      </section>
    );
  }
  if (item.type === "project") {
    return (
      <section className="litem project">
        <h2>🛠️ Project: {c.title}</h2>
        <RichText text={c.description || ""} />
        {c.rubric && <details style={{ marginTop: 8 }}><summary className="muted small">What makes it good</summary><RichText text={c.rubric} /></details>}
      </section>
    );
  }
  if (item.type === "video") {
    return <VideoItem item={item} solved={solved} onSolved={onSolved} />;
  }
  return <ExerciseItem item={item} solved={solved} onSolved={onSolved} qKey={`${item.id}:0`} qIdx={0} question={null} />;
}

function VideoItem({ item, solved, onSolved }: {
  item: ItemNode; solved: Record<string, boolean>; onSolved: (key: string, correct: boolean | null) => void;
}) {
  const c = item.content || {};
  const questions: any[] = c.questions || [];
  return (
    <section className="litem">
      <h2>▶️ {c.title}</h2>
      {c.note && <p className="muted">{c.note}</p>}
      <VideoPlayer content={{ youtubeId: c.youtubeId, uploadId: c.uploadId, title: c.title }} />
      {questions.map((q, i) => (
        <ExerciseItem
          key={i}
          item={item}
          solved={solved}
          onSolved={onSolved}
          qKey={`${item.id}:${i}`}
          qIdx={i}
          question={q}
        />
      ))}
    </section>
  );
}

function ExerciseItem({ item, solved, onSolved, qKey, qIdx, question }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  qKey: string;
  qIdx: number;
  question: { prompt: string; choices: { id: string; text: string }[] } | null;
}) {
  // exercise content directly, or a video sub-question
  const c: Record<string, any> = item.content || {};
  const kind = question ? "mcq" : c.kind;
  const prompt = question ? question.prompt : c.prompt;
  const choices: { id: string; text: string }[] = question ? question.choices : c.choices || [];

  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [revealed, setRevealed] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [explain, setExplain] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);
  const [err, setErr] = useState("");

  const isSolved = solved[qKey] === true;

  async function submit(mcqId?: string) {
    setBusy(true);
    setErr("");
    setExplain("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: kind === "mcq" ? mcqId : answer };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      setRevealed(d);
      onSolved(qKey, d.correct);
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function selfCheck(got: boolean) {
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: answer || "(answer)" };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      onSolved(qKey, got);
      setResult({ ...d, correct: got });
    } catch (e) {
      setErr(niceError(e));
    }
  }

  async function explainMistake() {
    setExplainBusy(true);
    setErr("");
    try {
      const d = await api<{ explanation: string }>("/api/learn/explain", {
        method: "POST",
        body: { itemId: item.id, questionIndex: qIdx, myAnswer: kind === "mcq" ? picked : answer },
      });
      setExplain(d.explanation);
    } catch (e) {
      setErr(e instanceof Error && e.message.includes("ai_not_configured")
        ? "The explainer needs an AI provider on this server."
        : niceError(e));
    } finally {
      setExplainBusy(false);
    }
  }

  const correct = result?.correct === true;
  const textSelfCheck = kind === "text" && revealed;

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`}>
      <div className="exhead">
        <MathText text={prompt} />
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && kind === "mcq" && (
        <div className="choices">
          {choices.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`choice${picked === ch.id ? " picked" : ""}`}
              disabled={busy}
              onClick={() => setPicked(ch.id)}
            >
              <MathText text={ch.text} />
            </button>
          ))}
          <div className="row">
            {c.hint && !hint && <button className="btn ghost" type="button" onClick={() => setHint(c.hint)}>💡 Hint</button>}
            <button className="btn primary" type="button" disabled={busy || !picked} onClick={() => submit(picked!)}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        </div>
      )}

      {!result && kind === "numeric" && (
        <div className="row wrap">
          <input
            className="input"
            style={{ maxWidth: 220 }}
            inputMode="decimal"
            placeholder="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && answer && submit()}
          />
          {c.hint && !hint && <button className="btn ghost" type="button" onClick={() => setHint(c.hint)}>💡 Hint</button>}
          <button className="btn primary" type="button" disabled={busy || !answer.trim()} onClick={() => submit()}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      )}

      {!result && kind === "text" && (
        <div>
          <textarea
            className="input"
            rows={3}
            placeholder="Write your answer in your own words…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" type="button" disabled={!answer.trim()} onClick={() => setRevealed({ correct: null, reveal: { kind: "text", explanation: null, hint: null, answer: c.answer } })}>
              Show model answer
            </button>
          </div>
        </div>
      )}

      {hint && !result && <p className="hintbox">💡 {hint}</p>}

      {textSelfCheck && !result && (
        <div className="feedback selfcheck">
          <p><strong>Model answer:</strong> {revealed.reveal?.answer}</p>
          <p className="muted small">Be honest, nobody's watching. 😊</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => selfCheck(true)}>I got it</button>
            <button className="btn ghost" type="button" onClick={() => selfCheck(false)}>Need more practice</button>
          </div>
        </div>
      )}

      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`}>
          <strong>{correct ? "✅ Correct!" : "❌ Not quite."}</strong>
          {revealed?.reveal?.explanation && <p>{revealed.reveal.explanation}</p>}
          {kind === "text" && revealed?.reveal?.answer && <p><strong>Model answer:</strong> {revealed.reveal.answer}</p>}
          {!correct && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn ghost" type="button" disabled={explainBusy} onClick={explainMistake}>
                {explainBusy ? "Thinking…" : "🧠 Why was I wrong?"}
              </button>
              {kind !== "text" && (
                <button className="btn ghost" type="button" onClick={() => { setResult(null); setRevealed(null); setPicked(null); }}>
                  Try again
                </button>
              )}
            </div>
          )}
          {explain && <div className="explainbox">{explain}</div>}
        </div>
      )}
      {err && <div className="formerror" role="alert">{err}</div>}
    </section>
  );
}
