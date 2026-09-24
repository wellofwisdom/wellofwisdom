// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useRef, useState, useEffect } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT, speakWithLang, currentLang } from "../../../i18n";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: { kind: string; explanation: string | null };
}

type Choice = { id: string; text: string };
type ListenChoiceData = { prompt: string; audioText: string; audioUrl: string; choices: Choice[] };

function parseListenChoice(content: Record<string, unknown>): ListenChoiceData | null {
  const prompt = String((content as { prompt?: unknown }).prompt ?? (content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  if (!prompt) return null;
  const audioText = String((content as { audioText?: unknown }).audioText ?? "").trim().slice(0, 2000);
  let audioUrl = String((content as { audioUrl?: unknown }).audioUrl ?? "").trim();
  if (audioUrl && !audioUrl.startsWith("/media/")) audioUrl = "";
  const raw = (content as { choices?: unknown }).choices;
  const choices: Choice[] = [];
  if (Array.isArray(raw)) {
    for (const ch of raw.slice(0, 6)) {
      if (!ch || typeof ch !== "object") continue;
      const id = String((ch as { id?: unknown }).id ?? "").trim().slice(0, 40);
      const text = String((ch as { text?: unknown }).text ?? "").trim().slice(0, 500);
      if (!id || !text) continue;
      choices.push({ id, text });
    }
  }
  if (choices.length === 0) return null;
  return { prompt, audioText, audioUrl, choices };
}

export function parseListenChoiceForTest(content: Record<string, unknown>): ListenChoiceData | null {
  return parseListenChoice(content);
}

export default function ListenChoiceItem({
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
  const data = useMemo(() => parseListenChoice(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [picked, setPicked] = useState<string | null>(null);
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
    if (!data?.audioText) return;
    if (speaking) {
      try { speechSynthesis.cancel(); } catch {}
      setSpeaking(false);
      return;
    }
    const ok = speakWithLang(data.audioText, currentLang(), { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
    if (ok) setSpeaking(true);
  }

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("listenChoice.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("listenChoice.label")}>
        <p className="muted small">{t("listenChoice.empty")}</p>
      </section>
    );
  }

  async function submit() {
    if (busy || result || !picked) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: picked };
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

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`listenchoice-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`listenchoice-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      <div style={{ marginTop: 8, marginBottom: 10 }}>
        {data.audioUrl ? (
          <>
            <audio ref={audioRef} controls preload="metadata" src={data.audioUrl} style={{ width: "100%", maxWidth: 360 }} data-nav>
              <track kind="captions" srcLang={currentLang()} label="Captions" src={data.audioUrl ? `${data.audioUrl}/captions.vtt` : undefined as unknown as string} />
            </audio>
            {data.audioText && <p className="muted small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{data.audioText}</p>}
          </>
        ) : data.audioText ? (
          <>
            <button className="btn ghost" type="button" data-nav onClick={speak} aria-label={t("listenChoice.listen")}>
              {speaking ? t("listenChoice.stop") : t("listenChoice.listen")}
            </button>
            <p className="muted small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }} aria-live="polite">{data.audioText}</p>
          </>
        ) : null}
      </div>

      {!result && (
        <div className="choices" role="radiogroup" aria-labelledby={`listenchoice-prompt-${item.id}`}>
          {data.choices.map((ch) => (
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
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const group = (e.currentTarget as HTMLElement).closest(".choices");
                  if (!group) return;
                  const els = Array.from(group.querySelectorAll<HTMLElement>("[data-nav]"));
                  const idx = els.indexOf(e.currentTarget as HTMLElement);
                  if (idx === -1) return;
                  const dir = e.key === "ArrowDown" ? 1 : -1;
                  els[(idx + dir + els.length) % els.length]?.focus();
                }
              }}
            >
              {ch.text}
            </button>
          ))}
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn ghost" type="button" data-nav onClick={() => setPicked(null)} disabled={!picked}>
              {t("listenChoice.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !picked} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>{t("listenChoice.hint")}</p>
        </div>
      )}

      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
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
