// SPDX-License-Identifier: AGPL-3.0-or-later
// Spoken answers: a learner speaks, the transcript is shown back, and only
// after they confirm does it go to the grader. Exact match is graded here,
// rubric items go to the guide as needsReview.
import { useMemo, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";
import { PushToTalk, type SpokenAnswer } from "../../../components/PushToTalk";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  needsReview?: boolean;
  reveal: { kind: string; explanation: string | null };
}

type SpokenData = { prompt: string; rubric?: string };

function parseSpoken(content: Record<string, unknown>): SpokenData | null {
  const prompt = String((content as { prompt?: unknown }).prompt ?? (content as { text?: unknown }).text ?? "").trim().slice(0, 2000);
  if (!prompt) return null;
  const rubric = String((content as { rubric?: unknown }).rubric ?? "").trim().slice(0, 3000);
  return { prompt, rubric: rubric || undefined };
}

export function parseSpokenForTest(content: Record<string, unknown>): SpokenData | null {
  return parseSpoken(content);
}

export default function SpokenItem({
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
  const data = useMemo(() => parseSpoken(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [transcript, setTranscript] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<SpokenAnswer | null>(null);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;
  const needsReview = result?.needsReview === true;

  function onSpoken(answer: SpokenAnswer) {
    setTranscript(answer.text);
    setPending(answer);
    setConfirmed(false);
    setErr("");
  }

  if (!data) {
    const fallback = String((c as { prompt?: unknown }).prompt ?? (c as { text?: unknown }).text ?? "").trim();
    if (fallback) {
      return (
        <section className="litem exercise" aria-label="Spoken">
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label="Spoken">
        <p className="muted small">Spoken item not ready yet.</p>
      </section>
    );
  }

  async function submit() {
    if (busy || result) return;
    const val = transcript.trim();
    if (!val) return;
    if (pending && !confirmed) return;
    setBusy(true);
    setErr("");
    try {
      const body: Record<string, unknown> = { itemId: item.id, questionIndex: qIdx, answer: val };
      if (pending) body.answer = { transcript: val, language: pending.language };
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === false && !d.needsReview && onWrong) {
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
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`spoken-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`spoken-prompt-${item.id}`} style={{ fontWeight: 600 }}>{data.prompt}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <div style={{ marginTop: 10 }}>
            <PushToTalk kind="text" onResult={onSpoken} label="Speak your answer" />
          </div>

          {pending && (
            <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--border, #ddd)", borderRadius: 8 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>Heard: &ldquo;{pending.transcript}&rdquo;</div>
              <label className="small muted" htmlFor={`spoken-transcript-${item.id}`} style={{ display: "block", marginBottom: 6 }}>What we heard, fix it if needed</label>
              <textarea
                id={`spoken-transcript-${item.id}`}
                className="input"
                style={{ width: "100%", maxWidth: 520, minHeight: 72, resize: "vertical" }}
                value={transcript}
                onChange={(e) => { setTranscript(e.target.value); setConfirmed(false); }}
                rows={2}
                data-nav
              />
              <div className="row wrap" style={{ marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-nav />
                  <span className="small">That is what I meant</span>
                </label>
              </div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn primary" type="button" data-nav disabled={busy || !transcript.trim() || !confirmed} onClick={submit}>
                  {busy ? "Checking..." : "Check"}
                </button>
                <button className="btn ghost" type="button" data-nav onClick={() => { setPending(null); setTranscript(""); setConfirmed(false); }}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {!pending && (
            <p className="muted small" style={{ marginTop: 8 }}>Hold the button and speak. You will see the transcript and confirm it before checking.</p>
          )}

          <div className="row wrap" style={{ marginTop: 8 }}>
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              Ask for help
            </button>
          </div>
        </>
      )}

      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {result && (
        <div className={`feedback ${needsReview ? "" : correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            {needsReview ? (
              <>Sent for review</>
            ) : (
              <>
                <span aria-hidden="true">{correct ? "\u2705" : "\u274C"}</span> {correct ? "Correct" : "Not quite"}
              </>
            )}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
          {!correct && !needsReview && (
            <button className="btn ghost" type="button" data-nav onClick={() => { setResult(null); setPending(null); setTranscript(""); setConfirmed(false); }} style={{ marginTop: 8 }}>
              Try again
            </button>
          )}
          {needsReview && (
            <button className="btn ghost" type="button" data-nav onClick={() => { setResult(null); setPending(null); setTranscript(""); setConfirmed(false); }} style={{ marginTop: 8 }}>
              Try again
            </button>
          )}
        </div>
      )}
      {err && <div className="formerror" role="alert">{err}</div>}
    </section>
  );
}
