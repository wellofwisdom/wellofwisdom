// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT, speakWithLang, currentLang } from "../../../i18n";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";
import { PushToTalk } from "../../../components/PushToTalk";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: { kind: string; explanation: string | null; feedback?: unknown };
}

type ListenRepeatData = { prompt: string; audioText: string; audioUrl: string };

function parseListenRepeat(content: Record<string, unknown>): ListenRepeatData | null {
  const prompt = String((content as { prompt?: unknown }).prompt ?? (content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  if (!prompt) return null;
  const audioText = String((content as { audioText?: unknown }).audioText ?? "").trim().slice(0, 2000);
  let audioUrl = String((content as { audioUrl?: unknown }).audioUrl ?? "").trim();
  if (audioUrl && !audioUrl.startsWith("/media/")) audioUrl = "";
  return { prompt, audioText, audioUrl };
}

export function parseListenRepeatForTest(content: Record<string, unknown>): ListenRepeatData | null {
  return parseListenRepeat(content);
}

function renderFeedback(feedback: unknown): string | null {
  if (!feedback) return null;
  if (typeof feedback === "string") return feedback.slice(0, 2000);
  if (Array.isArray(feedback)) {
    const parts = feedback
      .map((w) => {
        if (!w || typeof w !== "object") return null;
        const word = String((w as { word?: unknown }).word ?? (w as { text?: unknown }).text ?? "").trim();
        const ok = (w as { ok?: unknown }).ok === true || (w as { correct?: unknown }).correct === true;
        if (!word) return null;
        return ok ? word : `${word} ✗`;
      })
      .filter(Boolean) as string[];
    if (parts.length) return parts.join(" ");
  }
  if (typeof feedback === "object") {
    const o = feedback as Record<string, unknown>;
    if (typeof o.explanation === "string") return o.explanation.slice(0, 2000);
    if (Array.isArray(o.words)) return renderFeedback(o.words);
  }
  return null;
}

export default function ListenRepeatItem({
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
  const data = useMemo(() => parseListenRepeat(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  useEffect(() => {
    return () => {
      try { speechSynthesis.cancel(); } catch {}
    };
  }, []);

  function speak() {
    const text = data?.audioText || data?.prompt || "";
    if (!text) return;
    if (speaking) {
      try { speechSynthesis.cancel(); } catch {}
      setSpeaking(false);
      return;
    }
    const ok = speakWithLang(text, currentLang(), { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
    if (ok) setSpeaking(true);
  }

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("listenRepeat.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("listenRepeat.label")}>
        <p className="muted small">{t("listenRepeat.empty")}</p>
      </section>
    );
  }

  async function submit() {
    if (busy || result || !transcript.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: transcript.trim() };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === false && onWrong) {
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

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && transcript.trim() && !busy && !result) {
      e.preventDefault();
      submit();
    }
  }

  const feedbackText = result ? renderFeedback((result.reveal as { feedback?: unknown })?.feedback ?? (result.reveal as { explanation?: unknown })?.explanation) : null;

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`listenrepeat-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`listenrepeat-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      <div style={{ marginTop: 8, marginBottom: 10 }}>
        {data.audioUrl ? (
          <audio ref={audioRef} controls preload="metadata" src={data.audioUrl} style={{ width: "100%", maxWidth: 360 }} data-nav />
        ) : null}
        <button className="btn ghost" type="button" data-nav onClick={speak} aria-label={t("listenRepeat.listen")} style={{ marginTop: data.audioUrl ? 6 : 0 }}>
          {speaking ? t("listenRepeat.stop") : t("listenRepeat.listen")}
        </button>
      </div>

      {!result && (
        <>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 360 }}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={t("listenRepeat.inputLabel")}
              placeholder={t("listenRepeat.placeholder")}
              data-nav
            />
            <button className="btn ghost" type="button" data-nav onClick={() => setTranscript("")} disabled={!transcript}>
              {t("listenRepeat.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !transcript.trim()} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <PushToTalk kind="text" onResult={(spoken) => setTranscript(spoken.text)} label="Speak" />
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>{t("listenRepeat.hint")}</p>
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
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
          {feedbackText && feedbackText !== result.reveal?.explanation && <p className="muted small" style={{ marginTop: 6 }}>{feedbackText}</p>}
          {!correct && (
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
