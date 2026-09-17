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

type RegionPoint = { x: number; y: number };
type Region = { id: string; shape: "rect" | "poly"; points: RegionPoint[] };
type HotspotData = { prompt: string; regions: Region[]; alt: string; uploadId: string };
type Pick = { kind: "point"; x: number; y: number } | { kind: "region"; id: string } | null;

const MAX_REGIONS = 12;

function toRegionPoint(v: unknown): RegionPoint | null {
  if (!v || typeof v !== "object") return null;
  const x = Number((v as { x?: unknown }).x);
  const y = Number((v as { y?: unknown }).y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}

function parseHotspot(content: Record<string, unknown>): HotspotData | null {
  const prompt = String(content.prompt || "").trim() || String(content.text || "").trim();
  if (!prompt) return null;
  const raw = Array.isArray(content.regions) ? content.regions : [];
  const regions: Region[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || regions.length >= MAX_REGIONS) continue;
    const id = String((r as { id?: unknown }).id ?? "").trim();
    if (!id) continue;
    const shape: "rect" | "poly" = (r as { shape?: unknown }).shape === "poly" ? "poly" : "rect";
    const pts = (Array.isArray((r as { points?: unknown }).points) ? ((r as { points?: unknown }).points as unknown[]) : [])
      .map(toRegionPoint)
      .filter((p): p is RegionPoint => p != null);
    if (shape === "rect" && pts.length < 2) continue;
    if (shape === "poly" && pts.length < 3) continue;
    regions.push({ id, shape, points: shape === "rect" ? pts.slice(0, 2) : pts });
  }
  if (!regions.length) return null;
  const alt = String(content.alt || "").trim();
  const uploadId = content.uploadId != null ? String(content.uploadId).trim() : "";
  return { prompt, regions, alt, uploadId };
}

export function parseHotspotForTest(content: Record<string, unknown>): HotspotData | null {
  return parseHotspot(content);
}

export default function HotspotItem({
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
  const data = useMemo(() => parseHotspot(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [pick, setPick] = useState<Pick>(null);
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
        <section className="litem exercise" aria-label={t("hotspot.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("hotspot.label")}>
        <p className="muted small">{t("hotspot.empty")}</p>
      </section>
    );
  }

  const d = data;
  const altText = d.alt || t("hotspot.noAlt");
  const pickedRegionIdx = pick && pick.kind === "region" ? d.regions.findIndex((r) => r.id === pick.id) : -1;

  function handleStageClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (result) return;
    // a keyboard-activated button click reports no pointer position, so leave the pick alone
    if (e.clientX === 0 && e.clientY === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setPick({ kind: "point", x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  function focusRegion(next: number) {
    const clamped = Math.max(0, Math.min(d!.regions.length - 1, next));
    setFocusIdx(clamped);
    const el = document.querySelector<HTMLElement>("[data-hotspot-idx=\"" + String(clamped) + "\"]");
    if (el) el.focus();
  }

  function selectRegion(idx: number) {
    if (result) return;
    setPick({ kind: "region", id: d!.regions[idx].id });
  }

  function handleRegionKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRegion((idx + 1) % d!.regions.length);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusRegion((idx - 1 + d!.regions.length) % d!.regions.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRegion(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRegion(d!.regions.length - 1);
    }
  }

  async function submit() {
    if (busy || result || !pick) return;
    setBusy(true);
    setErr("");
    try {
      const answer = pick.kind === "point" ? { x: pick.x, y: pick.y } : pick.id;
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

  const statusText =
    pick && pick.kind === "point"
      ? t("hotspot.pickedPoint", { x: String(pick.x), y: String(pick.y) })
      : pick && pick.kind === "region" && pickedRegionIdx >= 0
        ? t("hotspot.pickedRegion", { index: String(pickedRegionIdx + 1) })
        : t("hotspot.hint");

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`hotspot-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`hotspot-prompt-${item.id}`}>{d.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <button
            type="button"
            data-nav
            data-hotspot-stage
            aria-label={t("hotspot.stageLabel")}
            aria-describedby={`hotspot-status-${item.id}`}
            data-say={statusText}
            onClick={handleStageClick}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 420,
              padding: 0,
              border: "2px dashed var(--border, #ddd)",
              borderRadius: 8,
              background: "#f6f6f4",
              cursor: "crosshair",
              marginBottom: 8,
              overflow: "hidden",
            }}
          >
            {d.uploadId ? (
              <img
                src={`/media/${d.uploadId}`}
                alt={altText}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
            ) : (
              <span
                role="img"
                aria-label={altText}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140, padding: 16 }}
              >
                <span className="muted small">{t("hotspot.noImage")}</span>
              </span>
            )}
          </button>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 8 }}>
            <span>{t("hotspot.altLabel")} </span>
            {altText}
          </p>

          <div role="group" aria-label={t("hotspot.regionsLabel")} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {d.regions.map((r, idx) => {
              const picked = pick != null && pick.kind === "region" && pick.id === r.id;
              const label = t("hotspot.regionLabel", { index: String(idx + 1) });
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`btn ghost small-btn${picked ? " on" : ""}`}
                  data-nav
                  data-say={label}
                  data-hotspot-idx={idx}
                  tabIndex={idx === focusIdx ? 0 : -1}
                  aria-pressed={picked}
                  aria-label={label}
                  onClick={() => selectRegion(idx)}
                  onKeyDown={(e) => handleRegionKeyDown(e, idx)}
                  onFocus={() => setFocusIdx(idx)}
                >
                  {String(idx + 1)}
                </button>
              );
            })}
          </div>
          <p id={`hotspot-status-${item.id}`} className="muted small" aria-live="polite" style={{ marginTop: 0, marginBottom: 8 }}>{statusText}</p>

          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn ghost" type="button" data-nav onClick={() => setPick(null)} disabled={!pick}>
              {t("hotspot.clear")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !pick} onClick={submit}>
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
