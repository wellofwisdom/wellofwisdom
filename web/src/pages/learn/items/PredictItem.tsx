// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import type { ItemNode } from "../../../types";
import { api, niceError } from "../../../api";
import { useT } from "../../../i18n";
import { MathText } from "../../../lib/rich";
type PredictChoice = { id: string; text: string };
type PredictContent = { prompt?: string; choices?: PredictChoice[]; };
type PredictItemNode = ItemNode & { content: Record<string, unknown> };
type AttemptResponse = { correct: boolean | null; score?: number | null; reveal: { explanation: string | null; answer?: string | null } | null; };
export default function PredictItem({ item }: { item: PredictItemNode }) {
  const { t } = useT();
  const c = (item.content || {}) as unknown as PredictContent;
  const prompt = String(c.prompt || "").trim();
  const choices: PredictChoice[] = Array.isArray(c.choices) ? (c.choices as unknown[]).filter((ch) => ch && typeof ch === "object" && String((ch as PredictChoice).text || "").trim()).map((ch) => ({ id: String((ch as PredictChoice).id), text: String((ch as PredictChoice).text || "").trim() })) : [];
  const [picked, setPicked] = useState<string | null>(null);
  const [revealText, setRevealText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hasReveal = revealText != null;
  async function submit(id: string) {
    if (busy || hasReveal) return;
    setBusy(true); setErr(""); setPicked(id);
    try {
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: 0, answer: id } });
      const text = (d.reveal as { explanation?: string | null; reveal?: string | null })?.explanation || (d.reveal as { reveal?: string | null })?.reveal || t("predict.revealFallback");
      setRevealText(text);
    } catch (e) {
      setErr(niceError(e));
    } finally { setBusy(false); }
  }
  function onChoiceKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!hasReveal) submit(id); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const group = (e.currentTarget as HTMLElement).closest(".choices");
      if (!group) return;
      const els = Array.from(group.querySelectorAll<HTMLElement>("[data-nav]"));
      const idx = els.indexOf(e.currentTarget as HTMLElement);
      if (idx === -1) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = (idx + dir + els.length) % els.length;
      els[next]?.focus();
    }
  }
  if (!prompt && choices.length === 0) {
    return (<section className="litem predict" aria-label={t("predict.label")}><p className="muted small">{t("predict.empty")}</p></section>);
  }
  return (
    <section className="litem predict" aria-label={t("predict.label")}>
      {prompt && (<div style={{ marginBottom: 8 }}><MathText text={prompt} /></div>)}
      {!hasReveal ? (
        <div className="choices" role="radiogroup" aria-label={prompt || t("predict.label")}>
          {choices.map((ch) => (<button key={ch.id} type="button" role="radio" aria-checked={picked === ch.id} aria-label={ch.text} data-nav data-say={ch.text} className={`choice${picked === ch.id ? " picked" : ""}`} disabled={busy} onClick={() => submit(ch.id)} onKeyDown={(e) => onChoiceKeyDown(e, ch.id)}><MathText text={ch.text} /></button>))}
          {choices.length === 0 && <p className="muted small">{t("predict.noChoices")}</p>}
        </div>
      ) : (
        <div role="status" aria-live="polite">
          {picked && choices.length > 0 && (<p className="muted small">{t("predict.youPicked", { choice: String(choices.find((x) => x.id === picked)?.text || picked) })}</p>)}
          <div className="revealbox" style={{ marginTop: 8, padding: 12, borderRadius: 8, background: "var(--card, #f6f6f6)", border: "1px solid var(--border, #ddd)" }}>{revealText}</div>
        </div>
      )}
      {err && (<div className="formerror" role="alert">{err}</div>)}
    </section>
  );
}
