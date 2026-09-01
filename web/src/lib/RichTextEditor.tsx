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
  const [slashOpen, setSlashOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const SLASH_ITEMS: { id: string; label: string; icon: string; insert: string }[] = [
    { id: "heading", label: "Heading", icon: "H", insert: "\n\n## Heading\n\n" },
    { id: "bullet", label: "Bullet list", icon: "•", insert: "\n- item one\n- item two\n" },
    { id: "check", label: "Checklist", icon: "☑", insert: "\n- [ ] first step\n- [ ] second step\n" },
    { id: "note", label: "Callout: note", icon: "📝", insert: "\n> note: " },
    { id: "tip", label: "Callout: tip", icon: "💡", insert: "\n> tip: " },
    { id: "warn", label: "Callout: warning", icon: "⚠️", insert: "\n> warn: " },
    { id: "math", label: "Math (LaTeX)", icon: "∑", insert: "$x^2$" },
    { id: "bold", label: "Bold", icon: "B", insert: "****" },
  ];

  function slashInsert(snippet: string) {
    const el = ref.current;
    const start = el ? el.selectionStart : value.length;
    // remove the trailing "/" that opened the menu, then insert the snippet
    const idx = value.lastIndexOf("/", start);
    const next = (idx >= 0 ? value.slice(0, idx) : value) + snippet + value.slice(start);
    onChange(next);
    setSlashOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = (idx >= 0 ? value.slice(0, idx).length : value.length) + snippet.length;
      el?.setSelectionRange(caret, caret);
    });
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "/") setSlashOpen(true);
    if (e.key === "Escape") setSlashOpen(false);
  }

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
        <button type="button" className="rtebtn" title="Bullet list" aria-label="Bullet list" onClick={() => prefixLines("- ")}>• list</button>
        <button type="button" className="rtebtn" title="Math (LaTeX)" aria-label="Math" onClick={() => insert("$x$")}>∑</button>
        <span className="grow" />
        <button type="button" className={`rtebtn${preview ? " on" : ""}`} onClick={() => setPreview(!preview)}>
          {preview ? "✏️ Edit" : "👁 Preview"}
        </button>
      </div>

      {slashOpen && !preview && (
        <div className="slashmenu" role="menu" aria-label="Insert blocks">
          <div className="hint" style={{ padding: "6px 10px" }}>Type "/" anywhere · pick a block</div>
          {SLASH_ITEMS.map((it) => (
            <button key={it.id} type="button" className="palitem" role="menuitem"
              onClick={() => slashInsert(it.insert)}>
              <span className="slashicon" aria-hidden="true">{it.icon}</span> {it.label}
            </button>
          ))}
          <button type="button" className="palitem" onClick={() => setSlashOpen(false)}>✕ close</button>
        </div>
      )}

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
          onKeyUp={onKeyUp}
          aria-label={label || "Rich text"}
        />
      )}
      <div className="hint" style={{ marginTop: 4 }}>**bold** · *italic* · “- ” bullets · “/” blocks · $latex$ math</div>
    </div>
  );
}
