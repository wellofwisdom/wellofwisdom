// SPDX-License-Identifier: AGPL-3.0-or-later
// ExerciseItem: the graded exercise rendered inside a lesson or a video question.
// Kinds handled today are mcq, numeric and text. The registry dispatch in
// LessonPlayer picks this component, so adding a kind later means adding a
// file next to this one, not editing a long if-chain.
import { useState } from "react";
import { api, niceError } from "../../../api";
import type { ItemNode } from "../../../types";
import { MathText } from "../../../lib/rich";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  reveal: { kind: string; explanation: string | null; hint: string | null; answer: string | null };
}

const REWIND_SEC = 10;

export function clockOf(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(r).padStart(2, "0")}`;
}

export default function ExerciseItem({ item, solved, onSolved, qKey, qIdx, question, rewind }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  qKey: string;
  qIdx: number;
  question: { prompt: string; choices: { id: string; text: string }[]; atSec?: number } | null;
  rewind?: (atSec: number, play: boolean) => boolean;
}) {
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
      const d = await api<{ explanation: string }>("/api/learn/explain", { method: "POST", body: { itemId: item.id, questionIndex: qIdx, myAnswer: kind === "mcq" ? picked : answer } });
      setExplain(d.explanation);
    } catch (e) {
      setErr(e instanceof Error && e.message.includes("ai_not_configured") ? "The explainer needs an AI provider on this server." : niceError(e));
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
            <button key={ch.id} type="button" className={`choice${picked === ch.id ? " picked" : ""}`} disabled={busy} onClick={() => setPicked(ch.id)}>
              <MathText text={ch.text} />
            </button>
          ))}
          <div className="row">
            {c.hint && !hint && <button className="btn ghost" type="button" onClick={() => setHint(c.hint)}>Hint</button>}
            <button className="btn ghost" type="button" onClick={() => setTutorOpen(true)}>Ask for help</button>
            <button className="btn primary" type="button" disabled={busy || !picked} onClick={() => submit(picked!)}>{busy ? "Checking..." : "Check"}</button>
          </div>
        </div>
      )}
      {!result && kind === "numeric" && (
        <div className="row wrap">
          <input className="input" style={{ maxWidth: 220 }} inputMode="decimal" placeholder="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answer && submit()} />
          {c.hint && !hint && <button className="btn ghost" type="button" onClick={() => setHint(c.hint)}>Hint</button>}
          <button className="btn ghost" type="button" onClick={() => setTutorOpen(true)}>Ask for help</button>
          <button className="btn primary" type="button" disabled={busy || !answer.trim()} onClick={() => submit()}>{busy ? "Checking..." : "Check"}</button>
        </div>
      )}
      {!result && kind === "text" && (
        <div>
          <textarea className="input" rows={3} placeholder="Write your answer in your own words..." value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" type="button" disabled={!answer.trim()} onClick={() => setRevealed({ correct: null, reveal: { kind: "text", explanation: null, hint: null, answer: c.answer } })}>Show model answer</button>
          </div>
        </div>
      )}
      {hint && !result && <p className="hintbox">{hint}</p>}
      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}
      {textSelfCheck && !result && (
        <div className="feedback selfcheck" role="status" aria-live="polite">
          <p><strong>Model answer:</strong> {revealed.reveal?.answer}</p>
          <p className="muted small">Be honest, nobody is watching.</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => selfCheck(true)}>I got it</button>
            <button className="btn ghost" type="button" onClick={() => selfCheck(false)}>Need more practice</button>
          </div>
        </div>
      )}
      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong><span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? "Correct!" : "Not quite."}</strong>
          {revealed?.reveal?.explanation && <p>{revealed.reveal.explanation}</p>}
          {kind === "text" && revealed?.reveal?.answer && <p><strong>Model answer:</strong> {revealed.reveal.answer}</p>}
          {!correct && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn ghost" type="button" disabled={explainBusy} onClick={explainMistake}>{explainBusy ? "Thinking..." : "Why was I wrong?"}</button>
              {anchor !== null && rewind && (
                <button className="btn ghost" type="button" onClick={() => rewind(anchor, true)}>Watch from {clockOf(Math.max(0, anchor - REWIND_SEC))}</button>
              )}
              {kind !== "text" && (
                <button className="btn ghost" type="button" onClick={() => { setResult(null); setRevealed(null); setPicked(null); }}>Try again</button>
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
