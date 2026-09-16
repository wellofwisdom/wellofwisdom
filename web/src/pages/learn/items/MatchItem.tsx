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

type MatchData = {
  prompt: string;
  left: { id: string; text: string }[];
  right: { id: string; text: string }[];
};

function parseMatch(content: Record<string, unknown>): MatchData | null {
  const prompt = String((content as { prompt?: unknown }).prompt || "").trim();
  const left = Array.isArray((content as { left?: unknown }).left)
    ? (content as { left: { id: string; text: string }[] }).left
        .filter((x) => x && typeof x.id === "string" && typeof x.text === "string")
        .map((x) => ({ id: String(x.id), text: String(x.text) }))
    : [];
  const right = Array.isArray((content as { right?: unknown }).right)
    ? (content as { right: { id: string; text: string }[] }).right
        .filter((x) => x && typeof x.id === "string" && typeof x.text === "string")
        .map((x) => ({ id: String(x.id), text: String(x.text) }))
    : [];
  if (!prompt || left.length < 1 || right.length < 1) return null;
  return { prompt, left, right };
}

export default function MatchItem({
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
  const data = useMemo(() => parseMatch(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  if (!data) return null;

  const allPaired = data.left.every((l) => pairs[l.id]);

  function handleRightSelect(leftId: string, rightId: string) {
    if (result) return;
    setPairs((prev) => ({ ...prev, [leftId]: rightId }));
  }

  function handleKeyNav(e: React.KeyboardEvent) {
    const els = gridRef.current ? Array.from(gridRef.current.querySelectorAll<HTMLElement>("[data-nav]")) : [];
    const idx = els.indexOf(e.currentTarget as HTMLElement);
    if (idx === -1) return;
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(els.length - 1, idx + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
    if (next !== -1) {
      e.preventDefault();
      els[next]?.focus();
    }
  }

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const body = { itemId: item.id, questionIndex: qIdx, answer: pairs };
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
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`match-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`match-prompt-${item.id}`}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>
      <p className="muted small">{t("exercise.matchHint")}</p>

      {!result && (
        <>
          <div ref={gridRef} className="match-grid" role="group" aria-labelledby={`match-prompt-${item.id}`}>
            {data.left.map((l) => (
              <div key={l.id} className="match-row">
                <div className="match-left" role="note" aria-label={l.text}>
                  {l.text}
                </div>
                <label className="sr-only" htmlFor={`match-${item.id}-${l.id}`}>
                  {t("exercise.matchPairLabel", { left: l.text })}
                </label>
                <select
                  id={`match-${item.id}-${l.id}`}
                  className="input"
                  value={pairs[l.id] || ""}
                  onChange={(e) => handleRightSelect(l.id, e.target.value)}
                  onKeyDown={handleKeyNav}
                  data-nav
                  data-say={`${l.text} matched to ${pairs[l.id] ? data.right.find((r) => r.id === pairs[l.id])?.text || pairs[l.id] : t("exercise.matchUnpaired")}`}
                  aria-label={t("exercise.matchPairLabel", { left: l.text })}
                >
                  <option value="">{t("exercise.matchChoose")}</option>
                  {data.right.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.text}
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
            <button className="btn primary" type="button" data-nav disabled={busy || !allPaired} onClick={submit}>
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
