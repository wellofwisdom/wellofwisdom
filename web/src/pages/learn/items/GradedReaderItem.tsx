// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import type { ItemNode } from "../../../types";

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

function escapeRegExp(s: string): string {
  let out = "";
  for (const ch of s) {
    if (".*+?^\${}()|[]\\".includes(ch)) out += "\\" + ch;
    else out += ch;
  }
  return out;
}

function BodyWithGlosses({ body, glosses }: { body: string; glosses: Record<string, string> }) {
  const [active, setActive] = useState<string | null>(null);
  const entries = Object.entries(glosses);
  if (entries.length === 0) {
    return <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{body}</p>;
  }
  const sorted = [...entries].sort((a, b) => b[0].length - a[0].length);
  const pattern = sorted.map(([w]) => escapeRegExp(w)).join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const parts = body.split(re);
  const lowerMap = new Map(entries.map(([k, v]) => [k.toLowerCase(), v]));
  const wordToKey = new Map(entries.map(([k]) => [k.toLowerCase(), k]));
  return (
    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
      {parts.map((part, i) => {
        const key = wordToKey.get(part.toLowerCase());
        if (!key) return <span key={i}>{part}</span>;
        const gloss = lowerMap.get(part.toLowerCase()) || "";
        const isActive = active === key;
        return (
          <span key={i} style={{ position: "relative", display: "inline" }}>
            <button
              type="button"
              data-nav
              onClick={() => setActive(isActive ? null : key)}
              aria-label={`${part}: ${gloss}`}
              title={gloss}
              style={{
                background: isActive ? "var(--accent-soft, #e0f2ec)" : "transparent",
                border: "none",
                borderBottom: "2px dotted var(--accent, #0e7254)",
                padding: "0 1px",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
              }}
            >
              {part}
            </button>
            {isActive && (
              <span
                role="note"
                style={{
                  position: "absolute",
                  left: 0,
                  top: "100%",
                  zIndex: 2,
                  background: "var(--panel, #fff)",
                  border: "1px solid var(--border, #dde3ea)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  boxShadow: "var(--shadow, 0 1px 3px rgba(0,0,0,0.1))",
                  marginTop: 2,
                }}
              >
                {gloss}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
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
      {glosses ? <BodyWithGlosses body={body} glosses={glosses} /> : <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{body}</p>}
      {glosses && (
        <div style={{ marginTop: 12 }}>
          <p className="muted small" style={{ marginBottom: 6 }}>Tap a highlighted word for its meaning</p>
          <div className="row wrap" style={{ gap: 6 }}>
            {Object.entries(glosses).map(([word, gloss]) => (
              <details key={word} style={{ display: "inline-block" }}>
                <summary className="chip" style={{ cursor: "pointer" }} data-nav>{word}</summary>
                <span className="muted small" style={{ marginLeft: 6 }}>{gloss}</span>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
