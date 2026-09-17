// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { MathText } from "../../../lib/rich";
import { useT } from "../../../i18n";
import TutorChat from "../TutorChat";
import HintLadder from "./HintLadder";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: {
    kind: string;
    explanation: string | null;
    answer: string[] | null;
    feedback?: Record<string, string> | null;
  };
}

type Choice = { id: string; text: string; feedback?: string | null };

export default function MultiItem({
  item,
  solved,
  onSolved,
  onWrong,
  qKey,
  qIdx,
}: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  onWrong?: (feedback: string, name?: string) => void;
  qKey: string;
  qIdx: number;
}) {
  const { t } = useT();
  const c: Record<string, unknown> = (item.content || {}) as Record<string, unknown>;
  const prompt = String((c as { prompt?: unknown }).prompt || "");
  const choices: Choice[] = Array.isArray((c as { choices?: unknown }).choices)
    ? ((c as { choices: Choice[] }).choices || []).map((ch) => ({
        id: String(ch.id),
        text: String(ch.text || ""),
        feedback: ch.feedback ? String(ch.feedback) : null,
      }))
    : [];

  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const groupRef = useRef<HTMLDivElement | null>(null);

  const isSolved = solved[qKey] === true;

  function toggle(id: string) {
    if (result) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle(id);
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const els = groupRef.current ? Array.from(groupRef.current.querySelectorAll<HTMLElement>("[data-nav]")) : [];
      const idx = els.indexOf(e.currentTarget as HTMLElement);
      if (idx === -1) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = (idx + dir + els.length) % els.length;
      els[next]?.focus();
    }
  }

  async function submit() {
    if (busy || result) return;
    const answer = Array.from(picked);
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === false && onWrong) {
        const fb = (d as any).reveal?.feedback ? Object.values((d as any).reveal.feedback as Record<string, string>)[0] : (d as any).reveal?.explanation;
        if (fb && String(fb).trim()) onWrong(String(fb).slice(0, 500));
      }
      if (d.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (result) return;
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
    };
    void onGlobalKey;
  }, [result]);

  const correct = result?.correct === true;
  const pickedArray = Array.from(picked);
  const feedbackMap: Record<string, string> = (result?.reveal?.feedback as Record<string, string>) || {};

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`multi-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`multi-prompt-${item.id}`}>
          <MathText text={prompt} />
          <span className="muted small" style={{ display: "block", marginTop: 4 }}>
            {t("exercise.selectAll")}
          </span>
        </div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <div
          ref={groupRef}
          className="choices"
          role="group"
          aria-labelledby={`multi-prompt-${item.id}`}
          aria-describedby={`multi-help-${item.id}`}
        >
          <span id={`multi-help-${item.id}`} className="sr-only">
            {t("exercise.selectAll")}. {t("exercise.hint")}
          </span>
          {choices.map((ch) => {
            const isPicked = picked.has(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                role="checkbox"
                aria-checked={isPicked}
                aria-label={`${ch.text}${isPicked ? ", selected" : ""}`}
                data-nav
                data-say={ch.text}
                className={`choice${isPicked ? " picked" : ""}`}
                disabled={busy}
                onClick={() => toggle(ch.id)}
                onKeyDown={(e) => onKeyDown(e, ch.id)}
              >
                <span aria-hidden="true" className="choice-check">
                  {isPicked ? "☑" : "☐"}
                </span>{" "}
                <MathText text={ch.text} />
              </button>
            );
          })}
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button
              className="btn primary"
              type="button"
              data-nav
              disabled={busy || pickedArray.length === 0}
              onClick={submit}
            >
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
        </div>
      )}

      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
          {pickedArray.length > 0 && Object.keys(feedbackMap).length > 0 && (
            <div style={{ marginTop: 8 }}>
              {pickedArray.map((id) => {
                const fb = feedbackMap[id];
                if (!fb) return null;
                const ch = choices.find((x) => x.id === id);
                return (
                  <p key={id} className="choice-feedback">
                    <strong>{ch ? ch.text : id}:</strong> {fb}
                  </p>
                );
              })}
            </div>
          )}
          {!correct && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button
                className="btn ghost"
                type="button"
                data-nav
                onClick={() => {
                  setResult(null);
                  setPicked(new Set());
                }}
              >
                {t("exercise.tryAgain")}
              </button>
            </div>
          )}
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
