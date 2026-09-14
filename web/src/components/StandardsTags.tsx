// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";

const LABEL: Record<string, string> = {
  "CCSS Math": "CCSS Math",
  "CCSS ELA": "CCSS ELA",
  CCSS: "CCSS",
  NGSS: "NGSS",
  State: "State",
};

function frameworkOf(code: string): string {
  const upper = String(code || "").trim().toUpperCase();
  if (upper.startsWith("CCSS.MATH")) return "CCSS Math";
  if (upper.startsWith("CCSS.ELA")) return "CCSS ELA";
  if (upper.startsWith("CCSS")) return "CCSS";
  if (upper.startsWith("NGSS")) return "NGSS";
  return "State";
}

function labelFor(code: string): string {
  return LABEL[frameworkOf(code)] || "State";
}

export default function StandardsTags({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const normalized = useMemo(() => value || [], [value]);

  function add(code: string) {
    const trimmed = String(code || "").trim();
    if (!trimmed) return;
    const upper = trimmed.toUpperCase();
    const exists = normalized.some((c) => String(c).toUpperCase() === upper);
    if (exists) return;
    if (normalized.length >= 12) return;
    const next = [...normalized, trimmed.slice(0, 40)];
    // Local normalize: dedupe already handled, keep as typed (server will uppercase CCSS/NGSS)
    onChange(next);
  }

  function remove(code: string) {
    onChange(normalized.filter((c) => c !== code));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) {
        add(input);
        setInput("");
      }
    } else if (e.key === "Backspace" && !input && normalized.length) {
      onChange(normalized.slice(0, -1));
    }
  }

  return (
    <div className="standardstags">
      <div className="tags">
        {normalized.map((code) => (
          <span key={code} className="tag">
            <span className="taglabel" title={labelFor(code)}>{labelFor(code)}</span>
            <span className="tagcode">{code}</span>
            <button className="tagremove" type="button" aria-label={`Remove ${code}`} onClick={() => remove(code)}>x</button>
          </span>
        ))}
      </div>
      <div className="row">
        <input
          className="input"
          value={input}
          placeholder="CCSS.MATH.CONTENT.4.NF.A.1, NGSS.ESS1.A, or a state code"
          maxLength={40}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (input.trim()) { add(input); setInput(""); }
          }}
          aria-label="Add a standard"
        />
        <button className="btn ghost small-btn" type="button" onClick={() => { if (input.trim()) { add(input); setInput(""); } }}>Add</button>
      </div>
      <p className="hint">Press Enter or comma to add. Up to 12 per lesson.</p>
    </div>
  );
}
