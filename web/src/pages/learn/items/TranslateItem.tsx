// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT } from "../../../i18n";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  needsReview?: boolean;
  reveal: { kind: string; explanation: string | null };
}

type TranslateData = { prompt: string };

function parseTranslate(content: Record<string, unknown>): TranslateData | null {
  const prompt = String((content as { prompt?: unknown }).prompt ?? (content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  if (!prompt) return null;
  return { prompt };
}

export function parseTranslateForTest(content: Record<string, unknown>): TranslateData | null {
  return parseTranslate(content);
}

export default function TranslateItem({
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
  const data = useMemo(() => parseTranslate(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;
  const needsReview = result?.needsReview === true;

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("translate.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("translate.label")}>
        <p className="muted small">{t("translate.empty")}</p>
      </section>
    );
  }

  async function submit() {
    if (busy || result) return;
    const val = answer.trim();
    if (!val) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: val };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === false && !d.needsReview && onWrong) {
        const fb = (d as { reveal?: { explanation?: string | null } }).reveal?.explanation;
        if (fb && String(fb).trim()) onWrong(String(fb).slice(0, 500));
      }
      if (d.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`translate-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`translate-prompt-${item.id}`} style={{ fontWeight: 600 }}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <div style={{ marginTop: 10 }}>
            <label className="small muted" htmlFor={`translate-answer-${item.id}`} style={{ display: "block", marginBottom: 6 }}>{t("translate.inputLabel")}</label>
            <textarea
              id={`translate-answer-${item.id}`}
              className="input"
              style={{ width: "100%", maxWidth: 520, minHeight: 88, resize: "vertical" }}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              aria-label={t("translate.inputLabel")}
              placeholder={t("translate.placeholder")}
              rows={3}
              data-nav
            />
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button className="btn ghost" type="button" data-nav onClick={() => setAnswer("")} disabled={!answer}>
              {t("translate.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !answer.trim()} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>{t("translate.hint")}</p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
          </div>
        </>
      )}

      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {result && (
        <div className={`feedback ${needsReview ? "" : correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            {needsReview ? (
              <>{t("translate.sentForReview")}</>
            ) : (
              <>
                <span aria-hidden="true">{correct ? "\u2705" : "\u274C"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
              </>
            )}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
          {!correct && !needsReview && (
            <button className="btn ghost" type="button" data-nav onClick={() => setResult(null)} style={{ marginTop: 8 }}>
              {t("exercise.tryAgain")}
            </button>
          )}
        </div>
      )}
      {err && <div className="formerror" role="alert">{err}</div>}
    </section>
  );
}
