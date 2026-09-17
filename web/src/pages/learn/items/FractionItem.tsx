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

type FractionData = { prompt: string; model: "bar" | "circle"; parts: number };

function toParts(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.floor(n);
}

function parseFraction(content: Record<string, unknown>): FractionData | null {
  const prompt = String((content as { prompt?: unknown }).prompt || "").trim() || String((content as { text?: unknown }).text || "").trim();
  if (!prompt) return null;
  const modelRaw = String((content as { model?: unknown }).model || "bar").trim().toLowerCase();
  const model: "bar" | "circle" = modelRaw === "circle" ? "circle" : "bar";
  const partsRaw = (content as { parts?: unknown }).parts ?? (content as { denominator?: unknown }).denominator;
  const parts = toParts(partsRaw);
  if (!Number.isFinite(parts) || parts < 2 || parts > 12) return null;
  return { prompt, model, parts };
}

export function parseFractionForTest(content: Record<string, unknown>): FractionData | null {
  return parseFraction(content);
}

export default function FractionItem({
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
  const data = useMemo(() => parseFraction(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [shaded, setShaded] = useState<number[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("fraction.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("fraction.label")}>
        <p className="muted small">{t("fraction.empty")}</p>
      </section>
    );
  }

  function togglePart(idx: number) {
    if (result) return;
    setShaded((prev) => {
      const set = new Set(prev);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return Array.from(set).sort((a, b) => a - b);
    });
  }

  function focusPart(next: number) {
    setFocusIdx(next);
    const el = document.querySelector<HTMLElement>("[data-fraction-idx=\"" + String(next) + "\"]");
    if (el) el.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePart(idx);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusPart((idx + 1) % data!.parts);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusPart((idx - 1 + data!.parts) % data!.parts);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusPart(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      focusPart(data!.parts - 1);
    }
  }

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const answer = { shaded: [...shaded].sort((a, b) => a - b) };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: qIdx, answer } });
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

  const shadedSet = new Set(shaded);
  const summary = t("fraction.shadedCount", { count: String(shaded.length), total: String(data.parts) });

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`fraction-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`fraction-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      <p className="muted small" style={{ marginBottom: 8 }}>{t("fraction.hint")}</p>

      {!result && (
        <>
          <div role="group" aria-labelledby={`fraction-prompt-${item.id}`} aria-describedby={`fraction-status-${item.id}`} style={{ marginBottom: 12 }}>
            {data.model === "bar" ? (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} role="listbox" aria-label={t("fraction.label")} aria-multiselectable="true">
                {Array.from({ length: data.parts }, (_, idx) => {
                  const isShaded = shadedSet.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      role="option"
                      aria-selected={isShaded}
                      aria-label={t("fraction.partLabel", { index: String(idx + 1), total: String(data.parts) })}
                      data-nav
                      data-say={isShaded ? t("fraction.partShaded", { index: String(idx + 1) }) : t("fraction.partEmpty", { index: String(idx + 1) })}
                      data-fraction-idx={idx}
                      tabIndex={idx === focusIdx ? 0 : -1}
                      onClick={() => togglePart(idx)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      onFocus={() => setFocusIdx(idx)}
                      style={{
                        flex: "1 1 " + String(Math.max(32, Math.floor(280 / data.parts))) + "px",
                        minWidth: 36,
                        height: 48,
                        borderRadius: 6,
                        border: "2px solid " + (isShaded ? "#2a7a2a" : "var(--border, #ddd)"),
                        background: isShaded ? "#c8e6c9" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: 12 }}>{idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  border: "2px solid var(--border, #ddd)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  flexWrap: "wrap",
                  margin: "0 auto",
                }}
                role="listbox"
                aria-label={t("fraction.label")}
                aria-multiselectable="true"
              >
                {Array.from({ length: data.parts }, (_, idx) => {
                  const isShaded = shadedSet.has(idx);
                  const angle = (360 / data.parts) * idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      role="option"
                      aria-selected={isShaded}
                      aria-label={t("fraction.partLabel", { index: String(idx + 1), total: String(data.parts) })}
                      data-nav
                      data-say={isShaded ? t("fraction.partShaded", { index: String(idx + 1) }) : t("fraction.partEmpty", { index: String(idx + 1) })}
                      data-fraction-idx={idx}
                      tabIndex={idx === focusIdx ? 0 : -1}
                      onClick={() => togglePart(idx)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      onFocus={() => setFocusIdx(idx)}
                      style={{
                        position: "absolute",
                        width: "50%",
                        height: "50%",
                        top: "50%",
                        left: "50%",
                        transformOrigin: "0 0",
                        transform: "rotate(" + String(angle) + "deg)",
                        clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 0)",
                        background: isShaded ? "#c8e6c9" : "#fff",
                        border: "1px solid var(--border, #ddd)",
                        cursor: "pointer",
                      }}
                      title={String(idx + 1)}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: "block",
                          transform: "rotate(" + String(-angle) + "deg) translate(18px, 18px)",
                          fontSize: 11,
                        }}
                      >
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#fff",
                    border: "1px solid var(--border, #ddd)",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
            )}
            <p id={`fraction-status-${item.id}`} className="muted small" aria-live="polite" style={{ marginTop: 8, textAlign: "center" }}>{summary}</p>
          </div>
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn ghost" type="button" data-nav onClick={() => setShaded([])} disabled={shaded.length === 0}>
              {t("fraction.clear")}
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
