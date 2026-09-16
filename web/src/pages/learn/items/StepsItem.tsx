// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import type { ItemNode } from "../../../types";
import { RichText } from "../../../lib/rich";
import { useT } from "../../../i18n";
type StepsContent = { title?: string; problem?: string; steps?: { text: string }[]; };
type StepsItemNode = ItemNode & { content: Record<string, unknown> };
export default function StepsItem({ item }: { item: StepsItemNode }) {
  const { t } = useT();
  const c = (item.content || {}) as unknown as StepsContent;
  const title = String(c.title || "").trim();
  const problem = String(c.problem || "").trim();
  const steps: { text: string }[] = Array.isArray(c.steps) ? (c.steps as unknown[]).filter((s) => s && typeof s === "object" && String((s as { text?: unknown }).text || "").trim()).map((s) => ({ text: String((s as { text: string }).text).trim() })) : [];
  const [revealed, setRevealed] = useState(0);
  const hasSteps = steps.length > 0;
  function revealNext() { setRevealed((n) => Math.min(steps.length, n + 1)); }
  function onKeyDown(e: React.KeyboardEvent, idx: number) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (idx === revealed) revealNext(); } }
  return (
    <section className="litem steps" aria-label={title || t("steps.label")}>
      {title && <h3 style={{ marginBottom: 6 }}>{title}</h3>}
      {problem ? (<div style={{ marginBottom: 10 }}><RichText text={problem} /></div>) : (!title && !hasSteps && <p className="muted small">{t("steps.empty")}</p>)}
      {hasSteps && (<ol style={{ paddingLeft: 20 }}>{steps.map((s, i) => { const isVisible = i < revealed; const isNext = i === revealed; return (<li key={i} style={{ marginBottom: 8 }}>{isVisible ? (<span><RichText text={s.text} /></span>) : isNext ? (<button type="button" className="btn ghost small-btn" data-nav aria-label={t("steps.showStep", { num: String(i + 1) })} aria-expanded={false} onClick={revealNext} onKeyDown={(e) => onKeyDown(e, i)}>{t("steps.showStep", { num: String(i + 1) })}</button>) : (<span className="muted small" aria-hidden="true">{t("steps.locked")}</span>)}</li>); })}</ol>)}
      {hasSteps && revealed < steps.length && (<p className="muted small" aria-live="polite">{t("steps.progress", { done: String(revealed), total: String(steps.length) })}</p>)}
      {hasSteps && revealed >= steps.length && (<p className="muted small" role="status" aria-live="polite">{t("steps.allRevealed")}</p>)}
    </section>
  );
}
