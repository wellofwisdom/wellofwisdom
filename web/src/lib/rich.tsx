// SPDX-License-Identifier: AGPL-3.0-or-later
// RichText: our markdown-lite: paragraphs, ## headings, **bold**, *italic*,
// "- " bullets, "- [ ]" checklists, "> [!note]/[!tip]/[!warn]" callouts,
// and $...$ LaTeX via KaTeX. The only grammar lessons/notes may use.
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
        // "htmlAndMathml" emits the visual HTML AND a MathML annotation. With
        // output "html" a screen reader receives nothing at all: KaTeX marks
        // its visual spans aria-hidden, so a blind learner met silence where
        // the maths was. MathML is what assistive tech actually reads.
        html = katex.renderToString(tex, { throwOnError: false, output: "htmlAndMathml" });
      } catch {
        html = tok;
      }
      // Deliberately NO aria-label here. An aria-label on the wrapper would
      // override the MathML and make a screen reader announce raw TeX
      // ("backslash frac one two") instead of "one half". The MathML KaTeX
      // emits carries proper semantics; let it speak.
      parts.push(<span key={key} dangerouslySetInnerHTML={{ __html: html }} />);
    } else {
      parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const CALLOUTS: Record<string, { icon: string; cls: string }> = {
  note: { icon: "📝", cls: "co-note" },
  tip: { icon: "💡", cls: "co-tip" },
  warn: { icon: "⚠️", cls: "co-warn" },
};

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

        // callout block: > [!type] first line, "> " continuation lines
        const co = lines[0] && lines[0].match(/^>\s*!?(note|tip|warn)\s*:?\s*(.*)$/i);
        if (co) {
          const meta = CALLOUTS[co[1].toLowerCase()] || CALLOUTS.note;
          const rest = lines
            .slice(1)
            .map((l) => l.replace(/^>\s?/, ""))
            .filter(Boolean)
            .join(" ");
          return (
            <div key={pi} className={`callout ${meta.cls}`}>
              <span className="co-icon" aria-hidden="true">{meta.icon}</span>
              <div>{inline([co[2], rest].filter(Boolean).join(" "), `${pi}`)}</div>
            </div>
          );
        }

        // heading block: every line starts with ##
        if (lines.every((l) => l.startsWith("## "))) {
          return <h3 key={pi} className="rhead">{lines.map((l) => l.slice(3)).join(" ")}</h3>;
        }

        // checklist block
        if (lines.every((l) => /^-\s\[[ xX]\]/.test(l))) {
          return (
            <ul key={pi} className="checklist">
              {lines.map((l, li) => {
                const checked = /^-\s\[[xX]\]/.test(l);
                return (
                  <li key={li} className={checked ? "checked" : ""}>
                    <span className="ck" aria-hidden="true">{checked ? "☑" : "☐"}</span>{" "}
                    {inline(l.replace(/^-\s\[[ xX]\]\s?/, ""), `${pi}-${li}`)}
                  </li>
                );
              })}
            </ul>
          );
        }

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
