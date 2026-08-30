// SPDX-License-Identifier: AGPL-3.0-or-later
// Lightweight "wysiwyg-feel" editor: markdown toolbar + live preview tab.
// The same mini-grammar the lesson player renders (**bold**, *italic*,
// - bullets, $math$), so what you see in preview is what learners get.
import { useRef, useState } from "react";
import { RichText } from "./rich";

export default function RichTextEditor({
  value,
  onChange,
  rows = 5,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
}) {
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || "";
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  }

  function prefixLines(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + prefix.length;
    });
  }

  function insert(atCursor: string) {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    const next = value.slice(0, start) + atCursor + value.slice(start);
    onChange(next);
  }

  return (
    <div className="rte">
      <div className="rtebar" role="toolbar" aria-label="Formatting">
        <button type="button" className="rtebtn" title="Bold" aria-label="Bold" onClick={() => wrap("**")}><b>B</b></button>
        <button type="button" className="rtebtn" title="Italic" aria-label="Italic" onClick={() => wrap("*")}><i>I</i></button>
        <button type="button" className="rtebtn" title="Bullet list" aria-label="Bullet list" onClick={() => prefixLines("- ")}>• —</button>
        <button type="button" className="rtebtn" title="Math (LaTeX)" aria-label="Math" onClick={() => insert("$x$")}>∑</button>
        <span className="grow" />
        <button type="button" className={`rtebtn${preview ? " on" : ""}`} onClick={() => setPreview(!preview)}>
          {preview ? "✏️ Edit" : "👁 Preview"}
        </button>
      </div>
      {preview ? (
        <div className="rtepreview" style={{ minHeight: rows * 22 + 20 }} aria-live="polite">
          {value.trim() ? <RichText text={value} /> : <p className="muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <textarea
          ref={ref}
          className="input"
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label || "Rich text"}
        />
      )}
      <div className="hint" style={{ marginTop: 4 }}>**bold** · *italic* · “- ” bullets · $latex$ math</div>
    </div>
  );
}
