// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from "react";
import type { ItemNode } from "../../../types";
import { api } from "../../../api";
import { useT } from "../../../i18n";
type Card = { front: string; back: string; imageUploadId?: number | string };
type FlashcardsContent = { cards?: Card[] };
type FlashcardsItemNode = ItemNode & { content: Record<string, unknown> };
export default function FlashcardsItem({ item }: { item: FlashcardsItemNode }) {
  const { t } = useT();
  const c = (item.content || {}) as unknown as FlashcardsContent;
  const cards: Card[] = Array.isArray(c.cards) ? (c.cards as unknown[]).filter((x) => x && typeof x === "object").map((x) => ({ front: String((x as Card).front || "").trim(), back: String((x as Card).back || "").trim(), imageUploadId: (x as Card).imageUploadId })).filter((x) => x.front || x.back) : [];
  const total = cards.length;
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [graded, setGraded] = useState<Record<number, boolean | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const safeIdx = total === 0 ? 0 : Math.min(idx, total - 1);
  const card = total > 0 ? cards[safeIdx] : null;
  const flip = useCallback(() => setFlipped((v) => !v), []);
  const goPrev = useCallback(() => { setIdx((n) => Math.max(0, n - 1)); setFlipped(false); }, []);
  const goNext = useCallback(() => { setIdx((n) => Math.min(total - 1, n + 1)); setFlipped(false); }, [total]);
  useEffect(() => { setIdx(0); setFlipped(false); setGraded({}); }, [item.id]);
  function onCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
  }
  function gradeCard(cardIdx: number, correct: boolean) {
    if (graded[cardIdx] != null) return;
    setGraded((prev) => ({ ...prev, [cardIdx]: correct }));
    const next = Math.min(total - 1, cardIdx + 1);
    if (cardIdx < total - 1) {
      setIdx(next);
      setFlipped(false);
    }
    api("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: cardIdx, answer: correct ? "correct" : "again" } }).catch(() => {});
  }
  function onGradeKeyDown(e: React.KeyboardEvent, cardIdx: number, correct: boolean) {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); gradeCard(cardIdx, correct); }
  }
  if (total === 0) {
    return (<section className="litem flashcards" aria-label={t("flashcards.label")}><p className="muted small">{t("flashcards.empty")}</p></section>);
  }
  const rawImg = card?.imageUploadId != null ? String(card.imageUploadId).trim() : "";
  const imgSrc = rawImg ? `/media/${rawImg}` : null;
  return (
    <section className="litem flashcards" aria-label={t("flashcards.label")}>
      <p className="muted small" aria-live="polite">{t("flashcards.progress", { current: String(safeIdx + 1), total: String(total) })}</p>
      <div ref={cardRef} tabIndex={0} role="button" aria-label={flipped ? t("flashcards.showFront") : t("flashcards.showBack")} aria-pressed={flipped} data-nav onClick={flip} onKeyDown={onCardKeyDown} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 12, padding: 20, marginTop: 8, marginBottom: 10, cursor: "pointer", minHeight: 90, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", background: "var(--card, #fff)" }}>
        <span>{flipped ? card!.back || card!.front : card!.front}</span>
      </div>
      {imgSrc && <img src={imgSrc} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} />}
      {flipped && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }} role="group" aria-label={t("flashcards.gradeLabel")}>
          <button type="button" className="btn ghost" data-nav aria-label={t("flashcards.again")} onClick={() => gradeCard(safeIdx, false)} onKeyDown={(e) => onGradeKeyDown(e, safeIdx, false)}>{t("flashcards.again")}</button>
          <button type="button" className="btn primary" data-nav aria-label={t("flashcards.gotIt")} onClick={() => gradeCard(safeIdx, true)} onKeyDown={(e) => onGradeKeyDown(e, safeIdx, true)}>{t("flashcards.gotIt")}</button>
        </div>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn ghost" data-nav disabled={safeIdx === 0} aria-label={t("flashcards.prev")} onClick={goPrev} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); goPrev(); } }}>{t("flashcards.prev")}</button>
        <button type="button" className="btn ghost" data-nav aria-label={flipped ? t("flashcards.showFront") : t("flashcards.showBack")} onClick={flip}>{flipped ? t("flashcards.showFront") : t("flashcards.showBack")}</button>
        <button type="button" className="btn ghost" data-nav disabled={safeIdx >= total - 1} aria-label={t("flashcards.next")} onClick={goNext} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); goNext(); } }}>{t("flashcards.next")}</button>
      </div>
    </section>
  );
}
