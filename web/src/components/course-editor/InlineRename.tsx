// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from "react";

export default function InlineRename({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function save() {
    const t = text.trim();
    if (t && t !== value) onSave(t);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-rename"
        aria-label={`Rename ${label}: ${value}`}
        onClick={() => setEditing(true)}
        style={{ font: "inherit", fontWeight: 600, background: "none", border: "none", padding: "2px 4px", cursor: "text", textAlign: "left" }}
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="input"
      value={text}
      maxLength={200}
      aria-label={`New title for ${label}`}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") { setText(value); setEditing(false); }
      }}
    />
  );
}
