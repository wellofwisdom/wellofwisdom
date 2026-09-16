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
  reveal: { kind: string; explanation: string | null };
}

type OrderData = {
  prompt: string;
  items: { id: string; text: string }[];
  hints?: string[];
  hint?: string;
};

function parseOrder(content: Record<string, unknown>): OrderData | null {
  const prompt = String((content as { prompt?: unknown }).prompt || "").trim();
  const items = Array.isArray((content as { items?: unknown }).items)
    ? (content as { items: { id: string; text: string }[] }).items
        .filter((x) => x && typeof x.id === "string" && typeof x.text === "string")
        .map((x) => ({ id: String(x.id), text: String(x.text) }))
    : [];
  if (!prompt || items.length < 2) return null;
  return { prompt, items };
}

export default function OrderItem({
  item,
  solved,
  onSolved,
  qKey,
  qIdx,
}: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  qKey: string;
  qIdx: number;
}) {
  const { t } = useT();
  const data = useMemo(() => parseOrder(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [order, setOrder] = useState<string[]>(() => data?.items.map((x) => x.id) ?? []);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const dragId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  if (!data) return null;

  const byId = new Map(data.items.map((x) => [x.id, x.text]));

  function move(from: number, to: number) {
    if (result || busy) return;
    setOrder((prev) => {
      const next = [...prev];
      const [drag] = next.splice(from, 1);
      next.splice(to, 0, drag);
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number, id: string) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (e.key === "ArrowUp" && index > 0) move(index, index - 1);
      if (e.key === "ArrowDown" && index < order.length - 1) move(index, index + 1);
      queueMicrotask(() => {
        const peer = listRef.current?.querySelectorAll<HTMLElement>("[data-nav]")[e.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1)];
        peer?.focus();
      });
      return;
    }
    void id;
  }

  function handleDragStart(id: string) {
    dragId.current = id;
  }
  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId.current || dragId.current === overId) return;
    const from = order.indexOf(dragId.current);
    const to = order.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...order];
    const [drag] = next.splice(from, 1);
    next.splice(to, 0, drag);
    setOrder(next);
  }
  function handleDrop() {
    dragId.current = null;
  }

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: order };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`order-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`order-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      <p className="muted small">{t("exercise.orderHint")}</p>

      {!result && (
        <>
          <div ref={listRef} className="order-list" role="list" aria-labelledby={`order-prompt-${item.id}`}>
            {order.map((id, i) => (
              <div
                key={id}
                role="listitem"
                className="order-item"
                draggable={!busy}
                onDragStart={() => handleDragStart(id)}
                onDragOver={(e) => handleDragOver(e, id)}
                onDragEnd={handleDrop}
                onDrop={handleDrop}
                tabIndex={0}
                data-nav
                data-say={byId.get(id) || id}
                aria-label={`${byId.get(id) || id}, position ${i + 1} of ${order.length}`}
                onKeyDown={(e) => handleKeyDown(e, i, id)}
              >
                <span aria-hidden="true" className="order-handle">☰</span>
                <span className="order-index" aria-hidden="true">
                  {i + 1}.
                </span>
                <span>{byId.get(id)}</span>
                <span className="sr-only">{t("exercise.orderMoveHelp")}</span>
              </div>
            ))}
          </div>
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy} onClick={submit}>
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
