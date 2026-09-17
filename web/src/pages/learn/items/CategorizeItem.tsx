// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useRef, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT } from "../../../i18n";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: {
    kind: string;
    explanation: string | null;
    feedback?: Record<string, string> | null;
  };
}

type CatData = {
  prompt: string;
  buckets: { id: string; label: string }[];
  cards: { id: string; text: string }[];
};

function parseCat(content: Record<string, unknown>): CatData | null {
  const prompt = String((content as { prompt?: unknown }).prompt || "").trim();
  const buckets = Array.isArray((content as { buckets?: unknown }).buckets)
    ? (content as { buckets: { id: string; label: string }[] }).buckets
        .filter((x) => x && typeof x.id === "string" && typeof x.label === "string")
        .map((x) => ({ id: String(x.id), label: String(x.label) }))
    : [];
  const cards = Array.isArray((content as { cards?: unknown }).cards)
    ? (content as { cards: { id: string; text: string }[] }).cards
        .filter((x) => x && typeof x.id === "string" && typeof x.text === "string")
        .map((x) => ({ id: String(x.id), text: String(x.text) }))
    : [];
  if (!prompt || buckets.length < 2 || cards.length < 1) return null;
  return { prompt, buckets, cards };
}

export default function CategorizeItem({
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
  const data = useMemo(() => parseCat(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;
  const feedbackMap: Record<string, string> = (result?.reveal?.feedback as Record<string, string>) || {};

  if (!data) return null;

  const allPlaced = data.cards.every((card) => placements[card.id]);

  function handlePlace(cardId: string, bucketId: string) {
    if (result) return;
    setPlacements((prev) => ({ ...prev, [cardId]: bucketId }));
  }

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: placements };
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

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`cat-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`cat-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      <p className="muted small">{t("exercise.categorizeHint")}</p>

      {!result && (
        <>
          <div ref={gridRef} className="categorize-grid" role="group" aria-labelledby={`cat-prompt-${item.id}`}>
            {data.cards.map((card) => (
              <div key={card.id} className="categorize-card">
                <div className="categorize-card-text">{card.text}</div>
                <label className="sr-only" htmlFor={`cat-${item.id}-${card.id}`}>
                  {t("exercise.categorizePairLabel", { card: card.text })}
                </label>
                <select
                  id={`cat-${item.id}-${card.id}`}
                  className="input"
                  value={placements[card.id] || ""}
                  onChange={(e) => handlePlace(card.id, e.target.value)}
                  data-nav
                  data-say={`${card.text} in ${placements[card.id] ? data.buckets.find((b) => b.id === placements[card.id])?.label || placements[card.id] : t("exercise.matchUnpaired")}`}
                  aria-label={t("exercise.categorizePairLabel", { card: card.text })}
                >
                  <option value="">{t("exercise.matchChoose")}</option>
                  {data.buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !allPlaced} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
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
          {!correct && Object.keys(feedbackMap).length > 0 && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(feedbackMap).map(([cardId, fb]) => (
                <p key={cardId} className="choice-feedback">
                  {fb}
                </p>
              ))}
            </div>
          )}
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
