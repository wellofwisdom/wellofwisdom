// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import { api, niceError } from "../../../api";
import { PushToTalk } from "../../../components/PushToTalk";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { MathText } from "../../../lib/rich";
import { useT } from "../../../i18n";
import TutorChat from "../TutorChat";
import HintLadder from "./HintLadder";

interface AttemptResponse {
  correct: boolean | null;
  reveal: {
    kind: string;
    explanation: string | null;
    hint: string | null;
    answer: string | null;
    feedback?: Record<string, string> | null;
  };
}

const REWIND_SEC = 10;

export function clockOf(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(r).padStart(2, "0")}`;
}

export default function ExerciseItem({
  item,
  solved,
  onSolved,
  onWrong,
  qKey,
  qIdx,
  question,
  rewind,
}: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  onWrong?: (feedback: string, name?: string) => void;
  qKey: string;
  qIdx: number;
  question: { prompt: string; choices: { id: string; text: string; feedback?: string | null }[]; atSec?: number } | null;
  rewind?: (atSec: number, play: boolean) => boolean;
}) {
  const { t } = useT();
  const c: Record<string, unknown> = (item.content || {}) as Record<string, unknown>;
  const kind = question ? "mcq" : String((c as { kind?: unknown }).kind || "mcq");
  const prompt = question ? question.prompt : String((c as { prompt?: unknown }).prompt || "");
  const choices: { id: string; text: string; feedback?: string | null }[] = question
    ? (question.choices as { id: string; text: string; feedback?: string | null }[])
    : (Array.isArray((c as { choices?: unknown }).choices) ? (c as { choices: { id: string; text: string; feedback?: unknown }[] }).choices : []).map((ch) => ({
        id: String(ch.id),
        text: String(ch.text || ""),
        feedback: ch.feedback ? String(ch.feedback) : null,
      }));

  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [revealed, setRevealed] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
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
      if (d.correct === false && onWrong) {
        const fb = (d as any).reveal?.feedback ? Object.values((d as any).reveal.feedback as Record<string, string>)[0] : (d as any).reveal?.explanation;
        if (fb && String(fb).trim()) onWrong(String(fb).slice(0, 500));
      }
      if (d.correct === true) triggerRumble("hit");
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
      setErr(
        e instanceof Error && e.message.includes("ai_not_configured") ? t("exercise.explainerMissing") : niceError(e),
      );
    } finally {
      setExplainBusy(false);
    }
  }

  const correct = result?.correct === true;
  const textSelfCheck = kind === "text" && revealed;

  const pickedFeedback: string | null = (() => {
    if (!picked || correct) return null;
    const fromReveal = result?.reveal?.feedback && picked ? result.reveal.feedback[picked] : null;
    return fromReveal || null;
  })();

  function onChoiceKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setPicked(id);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const group = (e.currentTarget as HTMLElement).closest(".choices");
      if (!group) return;
      const els = Array.from(group.querySelectorAll<HTMLElement>("[data-nav]"));
      const idx = els.indexOf(e.currentTarget as HTMLElement);
      if (idx === -1) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = (idx + dir + els.length) % els.length;
      els[next]?.focus();
    }
  }

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`}>
      <div className="exhead">
        <MathText text={prompt} />
        {isSolved && <span className="chip on">✓</span>}
      </div>
      {!result && kind === "mcq" && (
        <div className="choices" role="radiogroup" aria-label={prompt}>
          {choices.map((ch) => (
            <button
              key={ch.id}
              type="button"
              role="radio"
              aria-checked={picked === ch.id}
              aria-label={ch.text}
              data-nav
              data-say={ch.text}
              className={`choice${picked === ch.id ? " picked" : ""}`}
              disabled={busy}
              onClick={() => setPicked(ch.id)}
              onKeyDown={(e) => onChoiceKeyDown(e, ch.id)}
            >
              <MathText text={ch.text} />
            </button>
          ))}
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <PushToTalk
              kind="mcq"
              choiceCount={choices.length}
              onResult={(spoken) => {
                if (spoken.choiceIndex !== null) setPicked(choices[spoken.choiceIndex].id);
              }}
            />
            <button className="btn primary" type="button" data-nav disabled={busy || !picked} onClick={() => submit(picked!)}>
              {busy ? t("exercise.checking") : t("exercise.check")}
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
            placeholder={t("exercise.yourAnswerPlaceholder")}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && answer && submit()}
            aria-label={t("exercise.yourAnswerPlaceholder")}
          />
          <HintLadder content={c} />
          <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
            {t("exercise.askForHelp")}
          </button>
          <PushToTalk kind="numeric" onResult={(spoken) => setAnswer(spoken.text)} />
          <button className="btn primary" type="button" data-nav disabled={busy || !answer.trim()} onClick={() => submit()}>
            {busy ? t("exercise.checking") : t("exercise.check")}
          </button>
        </div>
      )}
      {!result && kind === "text" && (
        <div>
          <textarea
            className="input"
            rows={3}
            placeholder={t("exercise.writePlaceholder")}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            aria-label={t("exercise.writePlaceholder")}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <HintLadder content={c} />
            <button
              className="btn primary"
              type="button"
              data-nav
              disabled={!answer.trim()}
              onClick={() =>
                setRevealed({ correct: null, reveal: { kind: "text", explanation: null, hint: null, answer: String((c as { answer?: unknown }).answer || "") } })
              }
            >
              {t("exercise.showModelAnswer")}
            </button>
            <PushToTalk kind="text" onResult={(spoken) => setAnswer((current) => (current.trim() ? `${current.trim()} ${spoken.text}` : spoken.text))} />
          </div>
        </div>
      )}
      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}
      {textSelfCheck && !result && (
        <div className="feedback selfcheck" role="status" aria-live="polite">
          <p>
            <strong>{t("exercise.modelAnswer")}</strong> {revealed.reveal?.answer}
          </p>
          <p className="muted small">{t("exercise.beHonest")}</p>
          <div className="row">
            <button className="btn" type="button" data-nav onClick={() => selfCheck(true)}>
              {t("exercise.iGotIt")}
            </button>
            <button className="btn ghost" type="button" data-nav onClick={() => selfCheck(false)}>
              {t("exercise.needMorePractice")}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
          </strong>
          {revealed?.reveal?.explanation && <p>{revealed.reveal.explanation}</p>}
          {pickedFeedback && (
            <p className="choice-feedback">
              <strong>{t("exercise.choiceFeedback")}:</strong> {pickedFeedback}
            </p>
          )}
          {kind === "text" && revealed?.reveal?.answer && (
            <p>
              <strong>{t("exercise.modelAnswer")}</strong> {revealed.reveal.answer}
            </p>
          )}
          {!correct && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn ghost" type="button" data-nav disabled={explainBusy} onClick={explainMistake}>
                {explainBusy ? t("exercise.thinking") : t("exercise.whyWrong")}
              </button>
              {anchor !== null && rewind && (
                <button className="btn ghost" type="button" data-nav onClick={() => rewind(anchor, true)}>
                  {t("exercise.watchFrom", { time: clockOf(Math.max(0, anchor - REWIND_SEC)) })}
                </button>
              )}
              {kind !== "text" && (
                <button
                  className="btn ghost"
                  type="button"
                  data-nav
                  onClick={() => {
                    setResult(null);
                    setRevealed(null);
                    setPicked(null);
                  }}
                >
                  {t("exercise.tryAgain")}
                </button>
              )}
            </div>
          )}
          {explain && <div className="explainbox">{explain}</div>}
        </div>
      )}
      {err && (
        <div className="formerror" role="alert">
          {err}
        </div>
      )}
    </section>
  );
}
