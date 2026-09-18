// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT } from "../../../i18n";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: { kind: string; explanation: string | null };
}

type DialogueData = {
  prompt: string;
  scene: string;
  turns: number;
  goals: string[];
};

function parseDialogue(content: Record<string, unknown>): DialogueData | null {
  const prompt = String((content as { prompt?: unknown }).prompt ?? (content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  if (!prompt) return null;
  const scene = String((content as { scene?: unknown }).scene ?? "").trim().slice(0, 4000);
  if (!scene) return null;
  let turns = 2;
  const rawTurns = (content as { turns?: unknown }).turns;
  if (rawTurns != null && String(rawTurns).trim() !== "") {
    const n = Number(rawTurns);
    if (Number.isFinite(n) && n >= 1 && n <= 6) turns = Math.round(n);
    else if (Number.isFinite(n)) turns = Math.max(1, Math.min(6, Math.round(n)));
  }
  const goals: string[] = [];
  const rawGoals = (content as { goals?: unknown }).goals;
  if (Array.isArray(rawGoals)) {
    for (const g of rawGoals.slice(0, 8)) {
      const s = String(g ?? "").trim().slice(0, 300);
      if (s) goals.push(s);
    }
  }
  return { prompt, scene, turns, goals };
}

export function parseDialogueForTest(content: Record<string, unknown>): DialogueData | null {
  return parseDialogue(content);
}

export default function DialogueItem({
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
  const data = useMemo(() => parseDialogue(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [turns, setTurns] = useState<string[]>(() => {
    if (!data) return [""];
    return Array.from({ length: data.turns }, () => "");
  });
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  const expectedTurns = data?.turns ?? 2;

  function updateTurn(i: number, v: string) {
    setTurns((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function addTurn() {
    setTurns((prev) => (prev.length >= 6 ? prev : [...prev, ""]));
  }

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label={t("dialogue.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("dialogue.label")}>
        <p className="muted small">{t("dialogue.empty")}</p>
      </section>
    );
  }

  const filledCount = turns.filter((s) => s.trim()).length;
  const canSubmit = filledCount > 0 && turns.slice(0, expectedTurns).every((s) => s.trim());

  async function submit() {
    if (busy || result) return;
    const cleaned = turns.map((s) => s.trim());
    if (cleaned.slice(0, expectedTurns).some((s) => !s)) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: { turns: cleaned.filter(Boolean) } };
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
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`dialogue-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`dialogue-prompt-${item.id}`} style={{ fontWeight: 600 }}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      <div className="scene-bubble" style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "var(--card, #f6f6f0)", border: "1px solid var(--border, #e5e5e0)" }}>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.scene}</p>
      </div>

      {data.goals.length > 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>
          <span style={{ fontWeight: 600 }}>{t("dialogue.goalsLabel")}:</span>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {data.goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 6 }}>{t("dialogue.goalsHint")}</p>
        </div>
      )}

      {!result && (
        <>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {turns.map((val, i) => (
              <div key={i}>
                <label className="small muted" htmlFor={`dialogue-turn-${item.id}-${i}`} style={{ display: "block", marginBottom: 4 }}>
                  {t("dialogue.turnLabel", { num: String(i + 1) })}
                </label>
                <input
                  id={`dialogue-turn-${item.id}-${i}`}
                  className="input"
                  style={{ width: "100%", maxWidth: 520 }}
                  value={val}
                  onChange={(e) => updateTurn(i, e.target.value)}
                  aria-label={t("dialogue.turnLabel", { num: String(i + 1) })}
                  placeholder={t("dialogue.turnPlaceholder")}
                  data-nav
                />
              </div>
            ))}
          </div>

          <div className="row wrap" style={{ marginTop: 8 }}>
            {turns.length < 6 && (
              <button className="btn ghost" type="button" data-nav onClick={addTurn}>
                {t("dialogue.addTurn")}
              </button>
            )}
            <button className="btn primary" type="button" data-nav disabled={busy || !canSubmit} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>

          <p className="muted small" style={{ marginTop: 6 }}>{t("dialogue.hint", { count: String(expectedTurns) })}</p>

          <div className="row wrap" style={{ marginTop: 8 }}>
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
            <span aria-hidden="true">{correct ? "\u2705" : "\u274C"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
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
