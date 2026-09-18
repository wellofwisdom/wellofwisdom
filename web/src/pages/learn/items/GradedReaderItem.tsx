// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ItemNode } from "../../../types";
import { RichText } from "../../../lib/rich";

function parseGlosses(content: Record<string, unknown>): Record<string, string> | null {
  const g = (content as { glosses?: unknown }).glosses;
  if (!g || typeof g !== "object" || Array.isArray(g)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    const word = String(k || "").trim().slice(0, 100);
    const gloss = String(v ?? "").trim().slice(0, 500);
    if (!word || !gloss) continue;
    out[word] = gloss;
  }
  return Object.keys(out).length ? out : null;
}

export default function GradedReaderItem({ item }: { item: ItemNode }) {
  const c = item.content as Record<string, unknown>;
  const title = String((c.title ?? "") as string).trim().slice(0, 300);
  const body = String((c.body ?? "") as string).trim();
  const level = String((c.level ?? "") as string).trim().toUpperCase();
  const glosses = parseGlosses(c);

  if (!body) {
    return (
      <section className="litem" aria-label={title || "Reader"}>
        <p className="muted small">Reader text unavailable.</p>
      </section>
    );
  }

  return (
    <section className="litem" aria-label={title || "Reader"}>
      <div className="row" style={{ marginBottom: 4 }}>
        {title && <h2 className="grow">{title}</h2>}
        {level && <span className="chip">{level}</span>}
      </div>
      <RichText text={body} />
      {glosses && (
        <div style={{ marginTop: 12 }}>
          <p className="muted small" style={{ marginBottom: 6 }}>Tap a word for its meaning</p>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(glosses).map(([word, gloss]) => (
              <details key={word} style={{ display: "inline-block" }}>
                <summary className="chip" style={{ cursor: "pointer" }}>{word}</summary>
                <span className="muted small" style={{ marginLeft: 6 }}>{gloss}</span>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
