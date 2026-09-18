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
  reveal: { kind: string; explanation: string | null };
}

type VocabData = {
  display: string;
  example: string;
  choices: { id: string; text: string }[];
};

function parseVocab(content: Record<string, unknown>): VocabData | null {
  const lemma = String((content as { lemma?: unknown }).lemma ?? "").trim().slice(0, 2000);
  const form = String((content as { form?: unknown }).form ?? "").trim().slice(0, 2000);
  const text = String((content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  const prompt = String((content as { prompt?: unknown }).prompt ?? "").trim().slice(0, 2000);
  const display = lemma || form || text || prompt;
  if (!display) return null;
  const example = String((content as { example?: unknown }).example ?? "").trim().slice(0, 2000);
  const rawChoices = (content as { choices?: unknown }).choices;
  const choices: { id: string; text: string }[] = [];
  if (Array.isArray(rawChoices)) {
    for (const ch of rawChoices.slice(0, 12)) {
      if (!ch || typeof ch !== "object") continue;
      const id = String((ch as { id?: unknown }).id ?? "").trim().slice(0, 40);
      const t = String((ch as { text?: unknown }).text ?? "").trim().slice(0, 200);
      if (!id || !t) continue;
      choices.push({ id, text: t });
    }
  }
  return { display, example, choices };
}

export function parseVocabForTest(content: Record<string, unknown>): VocabData | null {
  return parseVocab(content);
}

export default function VocabCardItem({
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
  const data = useMemo(() => parseVocab(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;
  const hasChoices = !!data && data.choices.length > 0;

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("vocab.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("vocab.label")}>
        <p className="muted small">{t("vocab.empty")}</p>
      </section>
    );
  }

  async function submit() {
    if (busy || result) return;
    const val = hasChoices ? picked : answer.trim();
    if (!val) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: val };
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
    if (e.key === "Enter" && !hasChoices && answer.trim() && !busy && !result) {
      e.preventDefault();
      submit();
    }
  }

  const canSubmit = hasChoices ? !!picked : !!answer.trim();

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`vocab-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`vocab-prompt-${item.id}`} style={{ fontWeight: 600, fontSize: 20 }}>{data.display}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      {data.example && <p className="muted small" style={{ marginTop: 6, fontStyle: "italic" }}>{data.example}</p>}

      {!result && !hasChoices && (
        <>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={t("vocab.inputLabel")}
              placeholder={t("vocab.placeholder")}
              data-nav
            />
            <button className="btn ghost" type="button" data-nav onClick={() => setAnswer("")} disabled={!answer}>
              {t("vocab.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !canSubmit} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>{t("vocab.hint")}</p>
        </>
      )}

      {!result && hasChoices && (
        <div className="choices" role="radiogroup" aria-label={data.display} style={{ marginTop: 10 }}>
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
            <button className="btn ghost" type="button" data-nav onClick={() => setPicked(null)} disabled={!picked}>
              {t("vocab.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !picked} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
        </div>
      )}

      {!result && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <HintLadder content={c} />
          <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
            {t("exercise.askForHelp")}
          </button>
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
