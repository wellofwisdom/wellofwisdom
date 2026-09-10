// SPDX-License-Identifier: AGPL-3.0-or-later
// The lesson player: articles, videos, exercises with grading feedback,
// hints, explain-my-mistake, and completion. Focus mode. No nav chrome.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, niceError } from "../../api";
import type { ItemNode, LearnLesson, Submission } from "../../types";
import { RichText, MathText } from "../../lib/rich";
import { linkProps } from "../../router";
import { VideoPlayer } from "../../components/VideoUI";
import TutorChat from "./TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  reveal: { kind: string; explanation: string | null; hint: string | null; answer: string | null };
}

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

function LessonItem({ item, solved, onSolved, submission, onSubmission }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
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
    return <ProjectItem item={item} submission={submission} onSubmission={onSubmission} />;
  }
  if (item.type === "video") {
    return <VideoItem item={item} solved={solved} onSolved={onSolved} />;
  }
  return <ExerciseItem item={item} solved={solved} onSolved={onSolved} qKey={`${item.id}:0`} qIdx={0} question={null} />;
}

// A project is the one item a learner hands in rather than answers. It stays
// editable while it is a draft, freezes the moment it is handed in, and shows
// the guide's response when it comes back. The AI's draft of that response is
// never sent here: only what the guide wrote or approved.
function ProjectItem({ item, submission, onSubmission }: {
  item: ItemNode;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
}) {
  const c = item.content || {};
  const [text, setText] = useState(submission ? submission.body : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const status = submission ? submission.status : "draft";
  const frozen = status === "submitted";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (submission) setText(submission.body);
  }, [submission?.item_id, submission?.status]);

  async function save(submit: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ submission: Submission }>(`/api/learn/submissions/${item.id}`, {
        method: "PUT",
        body: { body: text, submit },
      });
      onSubmission(d.submission);
      setMsg(submit ? "Handed in." : "Saved. Come back to it whenever you like.");
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="litem project">
      <h2>🛠️ Project: {c.title}</h2>
      <RichText text={c.description || ""} />
      {c.rubric && (
        <details style={{ marginTop: 8 }} open={!frozen && status === "draft"}>
          <summary className="muted small">What makes it good</summary>
          <RichText text={c.rubric} />
        </details>
      )}

      {submission && submission.feedback && (
        <div className="feedback selfcheck" role="status" style={{ marginTop: 14 }}>
          <strong>From your guide{submission.outcome ? `: ${OUTCOME_LABEL[submission.outcome] || submission.outcome}` : ""}</strong>
          <RichText text={submission.feedback} />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label className="muted small" htmlFor={`sub-${item.id}`}>
          {frozen ? "What you handed in" : "Your write up"}
        </label>
        <textarea
          id={`sub-${item.id}`}
          className="input"
          rows={8}
          value={text}
          readOnly={frozen}
          placeholder="Describe what you made, how you made it, and what you would do differently."
          onChange={(e) => setText(e.target.value)}
          style={{ marginTop: 4 }}
        />
        <div className="row" style={{ marginTop: 8, alignItems: "center", gap: 10 }}>
          {frozen ? (
            <span className="tag">Handed in. Waiting for your guide.</span>
          ) : (
            <>
              <button className="btn" type="button" disabled={busy} onClick={() => save(false)}>
                Save draft
              </button>
              <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={() => save(true)}>
                {status === "returned" ? "Hand in again" : "Hand it in"}
              </button>
            </>
          )}
          <span className="grow" />
          <span className="muted small">{words} {words === 1 ? "word" : "words"}</span>
        </div>
        {msg && <p className="small" role="status" style={{ marginTop: 6 }}>{msg}</p>}
      </div>
    </section>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  not_yet: "not yet",
  nearly: "nearly there",
  met: "met",
  exceptional: "exceptional",
};

// How far before the moment the answer is given to drop the learner back in.
// Matches REWIND_SEC in server/lib/videoqa.js: long enough to carry the
// sentence that sets the answer up, short enough not to feel like a re-watch.
const REWIND_SEC = 10;

export function clockOf(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(r).padStart(2, "0")}`;
}

function VideoItem({ item, solved, onSolved }: {
  item: ItemNode; solved: Record<string, boolean>; onSolved: (key: string, correct: boolean | null) => void;
}) {
  const c = item.content || {};
  const questions: any[] = c.questions || [];
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // A question can carry the moment its answer is given. Missing it should send
  // the learner back to that moment, not to the top of a twenty minute video.
  // Only our own sources can be scrubbed: an embedded player is another origin.
  const rewind = useCallback((atSec: number, play: boolean) => {
    const el = videoRef.current;
    if (!el) return false;
    el.currentTime = Math.max(0, Math.round(atSec) - REWIND_SEC);
    if (play) el.play().catch(() => {});
    else el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return true;
  }, []);

  return (
    <section className="litem">
      <h2>▶️ {c.title}</h2>
      {c.note && <p className="muted">{c.note}</p>}
      <VideoPlayer
        content={{ youtubeId: c.youtubeId, uploadId: c.uploadId, title: c.title }}
        videoRef={videoRef}
      />
      {questions.map((q, i) => (
        <ExerciseItem
          key={i}
          item={item}
          solved={solved}
          onSolved={onSolved}
          qKey={`${item.id}:${i}`}
          qIdx={i}
          question={q}
          rewind={rewind}
        />
      ))}
    </section>
  );
}

function ExerciseItem({ item, solved, onSolved, qKey, qIdx, question, rewind }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  qKey: string;
  qIdx: number;
  question: { prompt: string; choices: { id: string; text: string }[]; atSec?: number } | null;
  rewind?: (atSec: number, play: boolean) => boolean;
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
  const [tutorOpen, setTutorOpen] = useState(false);
  const [explain, setExplain] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);
  const [err, setErr] = useState("");

  const isSolved = solved[qKey] === true;
  // The moment in the video where this question's answer is given, when the
  // question carries one. Null for an ordinary exercise.
  const anchor = question && Number.isFinite(Number(question.atSec)) ? Number(question.atSec) : null;

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
      // Wrong, and we know where the answer lives: move the play head there so
      // the next thing they do is watch it, not guess again. Quietly, without
      // starting playback: they are reading the verdict.
      if (d.correct === false && rewind && anchor !== null) rewind(anchor, false);
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
            <button className="btn ghost" type="button" onClick={() => setTutorOpen(true)}>🌰 Ask for help</button>
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
          <button className="btn ghost" type="button" onClick={() => setTutorOpen(true)}>🌰 Ask for help</button>
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
      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {textSelfCheck && !result && (
        <div className="feedback selfcheck" role="status" aria-live="polite">
          <p><strong>Model answer:</strong> {revealed.reveal?.answer}</p>
          <p className="muted small">Be honest, nobody's watching. 😊</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => selfCheck(true)}>I got it</button>
            <button className="btn ghost" type="button" onClick={() => selfCheck(false)}>Need more practice</button>
          </div>
        </div>
      )}

      {result && (
        // role="status" announces the verdict without stealing focus, so a
        // screen reader user hears "Correct" instead of silence. The emoji is
        // hidden from readers: they already hear the word.
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span>{" "}
            {correct ? "Correct!" : "Not quite."}
          </strong>
          {revealed?.reveal?.explanation && <p>{revealed.reveal.explanation}</p>}
          {kind === "text" && revealed?.reveal?.answer && <p><strong>Model answer:</strong> {revealed.reveal.answer}</p>}
          {!correct && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn ghost" type="button" disabled={explainBusy} onClick={explainMistake}>
                {explainBusy ? "Thinking…" : "🧠 Why was I wrong?"}
              </button>
              {anchor !== null && rewind && (
                <button className="btn ghost" type="button" onClick={() => rewind(anchor, true)}>
                  ▶ Watch from {clockOf(Math.max(0, anchor - REWIND_SEC))}
                </button>
              )}
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
