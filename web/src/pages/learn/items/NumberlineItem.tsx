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

type NumberlineData = { prompt: string; min: number; max: number; step: number; labels?: string[] };

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseNumberline(content: Record<string, unknown>): NumberlineData | null {
  const prompt = String((content as { prompt?: unknown }).prompt || "").trim();
  const min = toNumber((content as { min?: unknown }).min, NaN);
  const max = toNumber((content as { max?: unknown }).max, NaN);
  const stepRaw = (content as { step?: unknown }).step;
  const step = stepRaw == null ? 1 : toNumber(stepRaw, NaN);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) return null;
  if (max <= min || step <= 0) return null;
  const labelsRaw = (content as { labels?: unknown }).labels;
  const labels = Array.isArray(labelsRaw) ? labelsRaw.map((v) => String(v ?? "").trim()).filter(Boolean) : undefined;
  const finalPrompt = prompt || String((content as { text?: unknown }).text || "").trim();
  if (!finalPrompt) return null;
  return { prompt: finalPrompt, min, max, step, labels };
}

export function parseNumberlineForTest(content: Record<string, unknown>): NumberlineData | null {
  return parseNumberline(content);
}

export default function NumberlineItem({
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
  const data = useMemo(() => parseNumberline(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [value, setValue] = useState<number>(() => (data ? data.min : 0));
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
        <section className="litem exercise" aria-label={t("numberline.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("numberline.label")}>
        <p className="muted small">{t("numberline.empty")}</p>
      </section>
    );
  }

  const d = data;
  const clampedFromSlider = (v: number) => {
    const steps = Math.round((v - d.min) / d.step);
    return Math.min(d.max, Math.max(d.min, d.min + steps * d.step));
  };

  function handleSlider(raw: number) {
    if (result) return;
    setValue(clampedFromSlider(raw));
  }

  function stepBy(dir: 1 | -1) {
    if (result) return;
    const next = value + dir * d.step;
    const clamped = Math.min(d.max, Math.max(d.min, Number(next.toFixed(10))));
    setValue(clamped);
  }

  function handleNumberInput(raw: string) {
    if (result) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const stepped = clampedFromSlider(n);
    setValue(stepped);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      stepBy(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setValue(d.min);
    } else if (e.key === "End") {
      e.preventDefault();
      setValue(d.max);
    }
  }

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: qIdx, answer: value } });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  const ariaValText = String(value);

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`numberline-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`numberline-prompt-${item.id}`}>{d.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn ghost small-btn" data-nav aria-label={t("numberline.decrease")} onClick={() => stepBy(-1)} disabled={value <= d.min}>
                -
              </button>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <input
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={value}
                  onChange={(e) => handleSlider(Number(e.target.value))}
                  onKeyDown={handleKeyDown}
                  aria-label={d.prompt}
                  aria-valuemin={d.min}
                  aria-valuemax={d.max}
                  aria-valuenow={value}
                  aria-valuetext={ariaValText}
                  data-nav
                  data-say={ariaValText}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }} aria-hidden="true">
                  <span className="muted small">{d.min}</span>
                  <span className="muted small">{d.max}</span>
                </div>
                {d.labels && d.labels.length > 0 && (
                  <div className="muted small" style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    {d.labels.map((lb, i) => (
                      <span key={i}>{lb}</span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="btn ghost small-btn" data-nav aria-label={t("numberline.increase")} onClick={() => stepBy(1)} disabled={value >= d.max}>
                +
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label className="muted small" htmlFor={`numberline-input-${item.id}`}>{t("numberline.valueLabel")}</label>
              <input
                id={`numberline-input-${item.id}`}
                className="input"
                type="number"
                step={d.step}
                min={d.min}
                max={d.max}
                value={value}
                onChange={(e) => handleNumberInput(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label={t("numberline.valueLabel")}
                data-nav
                data-say={ariaValText}
                style={{ maxWidth: 120 }}
              />
              <span className="muted small" aria-live="polite" aria-atomic="true">{t("numberline.current", { value: String(value) })}</span>
            </div>
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
