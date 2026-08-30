// SPDX-License-Identifier: AGPL-3.0-or-later
// RichText: our markdown-lite — paragraphs, **bold**, *italic*, "- " bullets,
// and $...$ LaTeX via KaTeX. The only grammar course bodies may use.
import { Fragment, type ReactNode } from "react";
import katex from "katex";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\$[^$]+\$|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) {
      parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("$")) {
      const tex = tok.slice(1, -1);
      let html = "";
      try {
        html = katex.renderToString(tex, { throwOnError: false, output: "html" });
      } catch {
        html = tok;
      }
      parts.push(<span key={key} dangerouslySetInnerHTML={{ __html: html }} />);
    } else {
      parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function RichText({ text }: { text: string }) {
  const paragraphs = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="richtext">
      {paragraphs.map((p, pi) => {
        const lines = p.split("\n").map((l) => l.trim());
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={pi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.slice(2), `${pi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={pi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${pi}-${li}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}

// Plain text with math only (for prompts).
export function MathText({ text }: { text: string }) {
  return <>{inline(String(text || ""), "m")}</>;
}
