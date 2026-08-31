// SPDX-License-Identifier: AGPL-3.0-or-later
// Tag input: type + Enter to add, click × to remove. The pattern interests,
// subjects, and anything else that wants to be tags.
import { useState, type KeyboardEvent } from "react";

export default function TagInput({
  tags,
  onChange,
  placeholder,
  suggestions,
  maxTags = 12,
  label,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  maxTags?: number;
  label?: string;
}) {
  const [input, setInput] = useState("");

  function add(tag: string) {
    const t = tag.trim().slice(0, 40);
    if (!t || tags.includes(t) || tags.length >= maxTags) return;
    onChange([...tags, t]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const availableSuggestions = (suggestions || [])
    .filter((s) => !tags.includes(s))
    .slice(0, 8);

  return (
    <div className="taginput">
      {label && <label className="small" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</label>}
      <div className="tagbox">
        {tags.map((t) => (
          <span key={t} className="tag on">
            {t}
            <button type="button" className="tag-x" aria-label={`Remove ${t}`} onClick={() => remove(t)}>×</button>
          </span>
        ))}
        <input
          className="tagfield"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tags.length === 0 ? placeholder : "Add another…"}
          aria-label={label || "Add tag"}
          disabled={tags.length >= maxTags}
        />
      </div>
      {availableSuggestions.length > 0 && (
        <div className="row wrap" style={{ marginTop: 6 }}>
          <span className="hint">Try:</span>
          {availableSuggestions.map((s) => (
            <button key={s} type="button" className="tag suggest" onClick={() => add(s)}>{s} +</button>
          ))}
        </div>
      )}
      {tags.length >= maxTags && <p className="hint" style={{ marginTop: 4 }}>Max {maxTags} tags.</p>}
    </div>
  );
}
