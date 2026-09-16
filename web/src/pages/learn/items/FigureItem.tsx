// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ItemNode } from "../../../types";
import { useT } from "../../../i18n";
type FigureContent = { uploadId?: number | string; alt?: string; caption?: string; prompt?: string; };
type FigureItemNode = ItemNode & { content: Record<string, unknown> };
export default function FigureItem({ item }: { item: FigureItemNode }) {
  const { t } = useT();
  const c = (item.content || {}) as unknown as FigureContent;
  const alt = String(c.alt || "").trim();
  const caption = String(c.caption || "").trim();
  const uploadId = c.uploadId != null ? String(c.uploadId).trim() : "";
  const src = uploadId ? `/media/${uploadId}` : null;
  const altText = alt || t("figure.untitled");
  return (
    <section className="litem figure" aria-label={t("figure.label")}>
      {src ? (<img src={src} alt={altText} style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 8 }} />) : (
        <div role="img" aria-label={altText} style={{ border: "1px dashed var(--border, #ddd)", borderRadius: 8, padding: 16, textAlign: "center" }}>
          <span className="muted small">{t("figure.noImage")}</span>
        </div>)}
      <p className="figure-alt" style={{ marginTop: 8, fontSize: 14 }}>
        <span className="muted small">{t("figure.altLabel")} </span>
        {altText}
      </p>
      {caption && (<p className="figure-caption muted small" style={{ marginTop: 4, fontStyle: "italic" }}>{caption}</p>)}
    </section>
  );
}
