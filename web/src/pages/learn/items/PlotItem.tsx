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

type Grid = { xmin: number; xmax: number; ymin: number; ymax: number; step: number };
type Pt = { x: number; y: number };
type PlotData = { prompt: string; grid: Grid };

const MAX_POINTS = 10;
const W = 320;
const H = 240;

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseGrid(raw: unknown): Grid {
  const g = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let xmin = num(g.xmin, -10);
  let xmax = num(g.xmax, 10);
  let ymin = num(g.ymin, -10);
  let ymax = num(g.ymax, 10);
  let step = num(g.step, 1);
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (step <= 0) step = 1;
  return { xmin, xmax, ymin, ymax, step };
}

function parsePlot(content: Record<string, unknown>): PlotData | null {
  const prompt = String(content.prompt || "").trim() || String(content.text || "").trim();
  if (!prompt) return null;
  return { prompt, grid: parseGrid(content.grid) };
}

export function parsePlotForTest(content: Record<string, unknown>): PlotData | null {
  return parsePlot(content);
}

function snapTo(v: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((v - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
}

function clean(n: number): string {
  return String(Number(n.toFixed(6)));
}

export default function PlotItem({
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
  const data = useMemo(() => parsePlot(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [points, setPoints] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt>(() =>
    data
      ? {
          x: snapTo((data.grid.xmin + data.grid.xmax) / 2, data.grid.xmin, data.grid.xmax, data.grid.step),
          y: snapTo((data.grid.ymin + data.grid.ymax) / 2, data.grid.ymin, data.grid.ymax, data.grid.step),
        }
      : { x: 0, y: 0 }
  );
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
        <section className="litem exercise" aria-label={t("plot.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("plot.label")}>
        <p className="muted small">{t("plot.empty")}</p>
      </section>
    );
  }

  const d = data;
  const g = d.grid;

  const px = (x: number) => ((x - g.xmin) / (g.xmax - g.xmin)) * W;
  const py = (y: number) => H - ((y - g.ymin) / (g.ymax - g.ymin)) * H;

  // keep at most about 11 lines per axis whatever the range
  const lineStepX = g.step * Math.max(1, Math.ceil((g.xmax - g.xmin) / g.step / 10));
  const lineStepY = g.step * Math.max(1, Math.ceil((g.ymax - g.ymin) / g.step / 10));
  const vLines: number[] = [];
  for (let x = g.xmin; x <= g.xmax + 1e-9; x += lineStepX) vLines.push(Number(x.toFixed(6)));
  const hLines: number[] = [];
  for (let y = g.ymin; y <= g.ymax + 1e-9; y += lineStepY) hLines.push(Number(y.toFixed(6)));

  function moveCursor(dx: number, dy: number) {
    if (result) return;
    setCursor((prev) => ({
      x: snapTo(prev.x + dx, g.xmin, g.xmax, g.step),
      y: snapTo(prev.y + dy, g.ymin, g.ymax, g.step),
    }));
  }

  function placePoint() {
    if (result) return;
    setPoints((prev) => (prev.length >= MAX_POINTS ? prev : [...prev, { x: cursor.x, y: cursor.y }]));
  }

  function handleGridClick(e: React.MouseEvent<HTMLDivElement>) {
    if (result) return;
    if (e.clientX === 0 && e.clientY === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = g.xmin + ((e.clientX - rect.left) / rect.width) * (g.xmax - g.xmin);
    const y = g.ymin + (1 - (e.clientY - rect.top) / rect.height) * (g.ymax - g.ymin);
    setCursor({ x: snapTo(x, g.xmin, g.xmax, g.step), y: snapTo(y, g.ymin, g.ymax, g.step) });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveCursor(-g.step, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveCursor(g.step, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(0, g.step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(0, -g.step);
    } else if (e.key === "Enter") {
      e.preventDefault();
      placePoint();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (!result) setPoints((prev) => prev.slice(0, -1));
    }
  }

  async function submit() {
    if (busy || result || !points.length) return;
    setBusy(true);
    setErr("");
    try {
      const answer = points.map((p) => ({ x: p.x, y: p.y }));
      const res = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: qIdx, answer } });
      setResult(res);
      onSolved(qKey, res.correct);
      if (res.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  const cursorText = t("plot.cursorAt", { x: clean(cursor.x), y: clean(cursor.y) });
  const pointsText = points.length
    ? t("plot.points", { points: points.map((p) => `(${clean(p.x)}, ${clean(p.y)})`).join(", ") })
    : t("plot.noPoints");
  const statusText = `${cursorText}. ${points.length >= MAX_POINTS ? t("plot.maxPoints") : pointsText}`;

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`plot-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`plot-prompt-${item.id}`}>{d.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      <p className="muted small" style={{ marginBottom: 8 }}>{t("plot.hint")}</p>

      {!result && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
            <div
              data-nav
              data-plot-grid
              role="application"
              aria-label={t("plot.gridLabel")}
              aria-describedby={`plot-status-${item.id}`}
              data-say={statusText}
              tabIndex={0}
              onClick={handleGridClick}
              onKeyDown={handleKeyDown}
              style={{ border: "2px solid var(--border, #ddd)", borderRadius: 8, background: "#fff", cursor: "crosshair", padding: 0, flex: "0 0 auto" }}
            >
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: "block" }}>
                {vLines.map((x) => (
                  <line key={`v${x}`} x1={px(x)} y1={0} x2={px(x)} y2={H} stroke="#e2e2de" strokeWidth={1} />
                ))}
                {hLines.map((y) => (
                  <line key={`h${y}`} x1={0} y1={py(y)} x2={W} y2={py(y)} stroke="#e2e2de" strokeWidth={1} />
                ))}
                {g.xmin <= 0 && g.xmax >= 0 && <line x1={px(0)} y1={0} x2={px(0)} y2={H} stroke="#b9b9b4" strokeWidth={1.5} />}
                {g.ymin <= 0 && g.ymax >= 0 && <line x1={0} y1={py(0)} x2={W} y2={py(0)} stroke="#b9b9b4" strokeWidth={1.5} />}
                {points.map((p, i) => (
                  <circle key={`p${i}`} cx={px(p.x)} cy={py(p.y)} r={5} fill="#2a6db5" stroke="#123c66" strokeWidth={1.5} />
                ))}
                <circle cx={px(cursor.x)} cy={py(cursor.y)} r={6} fill="none" stroke="#c25a2a" strokeWidth={2.5} />
                <line x1={px(cursor.x) - 10} y1={py(cursor.y)} x2={px(cursor.x) + 10} y2={py(cursor.y)} stroke="#c25a2a" strokeWidth={2} />
                <line x1={px(cursor.x)} y1={py(cursor.y) - 10} x2={px(cursor.x)} y2={py(cursor.y) + 10} stroke="#c25a2a" strokeWidth={2} />
                <text x={4} y={py(g.ymax) + 12} fontSize={10} fill="#777">{clean(g.xmin)}</text>
                <text x={W - 24} y={py(g.ymax) + 12} fontSize={10} fill="#777">{clean(g.xmax)}</text>
                <text x={4} y={py(g.ymin) - 3} fontSize={10} fill="#777">{clean(g.ymin)}</text>
                <text x={4} y={py(g.ymax) + 24} fontSize={10} fill="#777">{clean(g.ymax)}</text>
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button className="btn ghost small-btn" type="button" data-nav onClick={placePoint} disabled={points.length >= MAX_POINTS}>
                {t("plot.place")}
              </button>
              <button className="btn ghost small-btn" type="button" data-nav onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>
                {t("plot.undo")}
              </button>
              <button className="btn ghost small-btn" type="button" data-nav onClick={() => setPoints([])} disabled={!points.length}>
                {t("plot.clear")}
              </button>
            </div>
          </div>
          <p id={`plot-status-${item.id}`} className="muted small" aria-live="polite" style={{ marginTop: 0, marginBottom: 8 }}>{statusText}</p>

          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !points.length} onClick={submit}>
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
