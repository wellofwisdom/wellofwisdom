// SPDX-License-Identifier: AGPL-3.0-or-later
import { Fragment, type ReactNode, useEffect, useState } from "react";

let katexModule: typeof import("katex") | null = null;
let katexCssLoaded = false;
let katexPreload: Promise<typeof import("katex")> | null = null;

function ensureKatex(): Promise<typeof import("katex")> {
  if (katexModule) return Promise.resolve(katexModule);
  if (katexPreload) return katexPreload;
  katexPreload = Promise.all([
    import("katex"),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- css import has no types
    // @ts-ignore css side effect
    import("katex/dist/katex.min.css"),
  ]).then(([mod]) => {
    katexModule = (mod as unknown as { default: typeof import("katex") }).default || (mod as unknown as typeof import("katex"));
    katexCssLoaded = true; void katexCssLoaded;
    return katexModule!;
  });
  return katexPreload;
}

export function preloadKatex(): Promise<typeof import("katex")> {
  return ensureKatex();
}

function hasMathToken(text: string): boolean { return /\$[^$]+\$/.test(text); }

function inline(text: string, keyPrefix: string, withKatex: boolean): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\$[^$]+\$|\*[^*\s][^*]*\*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0]; const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("$")) {
      const tex = tok.slice(1, -1);
      if (withKatex && katexModule) {
        let html = "";
        try { html = katexModule.renderToString(tex, { throwOnError: false, output: "htmlAndMathml" }); } catch { html = tok.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
        parts.push(<span key={key} dangerouslySetInnerHTML={{ __html: html }} />);
      } else if (!withKatex) {
        parts.push(<span key={key} className="katex-pending" aria-busy="true"><span className="katex-spinner" aria-hidden="true" /> <span className="sr-only">Loading math</span>{tok}</span>);
      } else {
        const html = tok.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        parts.push(<span key={key} dangerouslySetInnerHTML={{ __html: html }} />);
      }
    } else parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function useKatex(text: string) {
  const [ready, setReady] = useState(() => Boolean(katexModule) || !hasMathToken(text));
  useEffect(() => {
    if (katexModule || !hasMathToken(text)) return;
    let cancelled = false;
    ensureKatex().then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [text]);
  void ready;
  return ready;
}

const CALLOUTS: Record<string, { icon: string; cls: string }> = {
  note: { icon: "📝", cls: "co-note" },
  tip: { icon: "💡", cls: "co-tip" },
  warn: { icon: "⚠️", cls: "co-warn" },
};

export function RichText({ text }: { text: string }) {
  const ready = useKatex(text);
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="richtext">
      {paragraphs.map((p, pi) => {
        const lines = p.split("\n").map((l) => l.trim());
        const co = lines[0] && lines[0].match(/^>\s*!?(note|tip|warn)\s*:?\s*(.*)$/i);
        if (co) {
          const meta = CALLOUTS[co[1].toLowerCase()] || CALLOUTS.note;
          const rest = lines.slice(1).map((l) => l.replace(/^>\s?/, "")).filter(Boolean).join(" ");
          return (<div key={pi} className={`callout ${meta.cls}`}><span className="co-icon" aria-hidden="true">{meta.icon}</span><div>{inline([co[2], rest].filter(Boolean).join(" "), `${pi}`, ready)}</div></div>);
        }
        if (lines.every((l) => l.startsWith("## "))) return <h3 key={pi} className="rhead">{lines.map((l) => l.slice(3)).join(" ")}</h3>;
        if (lines.every((l) => /^-s\[[ xX]\]/.test(l))) return (<ul key={pi} className="checklist">{lines.map((l, li) => { const checked = /^-s\[[xX]\]/.test(l); return (<li key={li} className={checked ? "checked" : ""}><span className="ck" aria-hidden="true">{checked ? "☑" : "☐"}</span>{" "}{inline(l.replace(/^-s\[[ xX]\]\s?/, ""), `${pi}-${li}`, ready)}</li>); })}</ul>);
        if (lines.every((l) => l.startsWith("- "))) return (<ul key={pi}>{lines.map((l, li) => (<li key={li}>{inline(l.slice(2), `${pi}-${li}`, ready)}</li>))}</ul>);
        return <p key={pi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `${pi}-${li}`, ready)}</Fragment>)}</p>;
      })}
    </div>
  );
}

export function MathText({ text }: { text: string }) {
  const ready = useKatex(text);
  if (!ready && hasMathToken(String(text || ""))) {
    const raw = String(text || "");
    const m = raw.match(/\$([^$]+)\$/);
    if (m) return <span className="katex-pending" aria-busy="true"><span className="katex-spinner" aria-hidden="true" /> {raw}</span>;
  }
  return <>{inline(String(text || ""), "m", ready)}</>;
}
