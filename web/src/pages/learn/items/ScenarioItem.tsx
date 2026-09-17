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

type ScenarioChoice = { text: string; next: string };
type ScenarioNode = { text: string; choices: ScenarioChoice[] };
type ScenarioData = { prompt: string; start: string; nodes: Record<string, ScenarioNode> };

function parseScenario(content: Record<string, unknown>): ScenarioData | null {
  const prompt = String(content.prompt || "").trim();
  const start = String(content.start ?? "").trim();
  const rawNodes = content.nodes;
  if (!start || !rawNodes || typeof rawNodes !== "object" || Array.isArray(rawNodes)) return null;
  const nodes: Record<string, ScenarioNode> = {};
  for (const [id, n] of Object.entries(rawNodes as Record<string, unknown>)) {
    if (!n || typeof n !== "object") continue;
    const text = String((n as { text?: unknown }).text || "").trim();
    if (!text) continue;
    const rawChoices = Array.isArray((n as { choices?: unknown }).choices) ? ((n as { choices?: unknown }).choices as unknown[]) : [];
    const choices: ScenarioChoice[] = [];
    for (const ch of rawChoices) {
      if (!ch || typeof ch !== "object") continue;
      const ct = String((ch as { text?: unknown }).text || "").trim();
      const next = String((ch as { next?: unknown }).next ?? "").trim();
      if (ct && next) choices.push({ text: ct, next });
    }
    nodes[id] = { text, choices };
  }
  if (!nodes[start]) return null;
  return { prompt, start, nodes };
}

export function parseScenarioForTest(content: Record<string, unknown>): ScenarioData | null {
  return parseScenario(content);
}

export default function ScenarioItem({
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
  const data = useMemo(() => parseScenario(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [path, setPath] = useState<string[]>(() => (data ? [data.start] : []));
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
        <section className="litem exercise" aria-label={t("scenario.label")}>
          <p>{fallback}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("scenario.label")}>
        <p className="muted small">{t("scenario.empty")}</p>
      </section>
    );
  }

  const d = data;
  const visited = path.map((id) => d.nodes[id]).filter((n): n is ScenarioNode => n != null);
  const currentId = path[path.length - 1];
  const current = d.nodes[currentId];
  const choices = (current?.choices ?? []).filter((ch) => d.nodes[ch.next]);
  const isEnding = choices.length === 0;

  function choose(ch: ScenarioChoice) {
    if (result || !d.nodes[ch.next]) return;
    setPath((prev) => [...prev, ch.next]);
  }

  function restart() {
    setPath([d!.start]);
    setResult(null);
  }

  async function submit() {
    if (busy || result || !path.length) return;
    setBusy(true);
    setErr("");
    try {
      const answer = [...path];
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

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`scenario-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`scenario-prompt-${item.id}`}>{d.prompt || t("scenario.label")}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <div style={{ marginBottom: 12 }}>
            {visited.slice(0, -1).map((n, i) => (
              <p key={`${path[i]}-${i}`} className="muted small" style={{ marginBottom: 4, opacity: 0.75 }}>{n.text}</p>
            ))}
            {current && (
              <p key={currentId} aria-live="polite" style={{ marginBottom: 8, fontWeight: 600 }}>{current.text}</p>
            )}
            {isEnding ? (
              <p className="muted small" aria-live="polite">{t("scenario.ending")}</p>
            ) : (
              <div role="group" aria-label={t("scenario.choicesLabel")} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {choices.map((ch, idx) => (
                  <button
                    key={`${currentId}-c${idx}`}
                    type="button"
                    className="btn ghost"
                    data-nav
                    data-say={ch.text}
                    aria-label={ch.text}
                    onClick={() => choose(ch)}
                    style={{ textAlign: "left" }}
                  >
                    {ch.text}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small" aria-live="polite" style={{ marginTop: 8 }}>
              {t("scenario.step", { n: String(path.length) })}
            </p>
          </div>

          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            {path.length > 1 && (
              <button className="btn ghost" type="button" data-nav onClick={restart}>
                {t("scenario.startOver")}
              </button>
            )}
            {isEnding && (
              <button className="btn primary" type="button" data-nav disabled={busy} onClick={submit}>
                {busy ? t("exercise.checking") : t("exercise.check")}
              </button>
            )}
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
            <button className="btn ghost" type="button" data-nav onClick={restart} style={{ marginTop: 8 }}>
              {t("exercise.tryAgain")}
            </button>
          )}
        </div>
      )}
      {err && <div className="formerror" role="alert">{err}</div>}
    </section>
  );
}
