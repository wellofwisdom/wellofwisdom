// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";

const LABEL: Record<string, string> = {
  "CCSS Math": "CCSS Math",
  "CCSS ELA": "CCSS ELA",
  CCSS: "CCSS",
  NGSS: "NGSS",
  State: "State",
  CEFR: "CEFR",
};

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const CEFR_DESCRIPTORS: Record<string, string> = {
  A1: "Can understand and use familiar everyday expressions and very basic phrases. Can introduce self and others.",
  A2: "Can understand sentences and frequently used expressions related to areas of immediate relevance.",
  B1: "Can understand the main points of clear standard input on familiar matters.",
  B2: "Can understand the main ideas of complex text and interact with fluency.",
  C1: "Can understand a wide range of demanding longer texts and express ideas fluently.",
  C2: "Can understand with ease virtually everything heard or read.",
};

function normalizeCefr(v: string | null | undefined): string | null {
  const s = String(v || "").trim().toUpperCase().slice(0, 4);
  return (CEFR_ORDER as readonly string[]).includes(s) ? s : null;
}

export function frameworkOf(code: string): string {
  const upper = String(code || "").trim().toUpperCase();
  if (/^CEFR\b/.test(upper) || (CEFR_ORDER as readonly string[]).includes(upper)) return "CEFR";
  if (upper.startsWith("CCSS.MATH")) return "CCSS Math";
  if (upper.startsWith("CCSS.ELA")) return "CCSS ELA";
  if (upper.startsWith("CCSS")) return "CCSS";
  if (upper.startsWith("NGSS")) return "NGSS";
  return "State";
}

export function labelFor(code: string): string {
  const fw = frameworkOf(code);
  if (fw === "CEFR") {
    const lvl = normalizeCefr(String(code || "").replace(/^CEFR[\s.:-]*/i, "").trim()) || normalizeCefr(code);
    if (lvl && CEFR_DESCRIPTORS[lvl]) return "CEFR " + lvl + ": " + CEFR_DESCRIPTORS[lvl];
    return "CEFR";
  }
  return LABEL[fw] || "State";
}

export function descriptorFor(level: string): string | null {
  const n = normalizeCefr(level);
  return n ? CEFR_DESCRIPTORS[n] || null : null;
}

export { CEFR_ORDER, CEFR_DESCRIPTORS, normalizeCefr };

export function groupByLanguage(rows: Array<Record<string, unknown>>): Array<{ target_language: string; cefr: string; count: number; rows: Array<Record<string, unknown>> }> {
  const map = new Map<string, { target_language: string; cefr: string; count: number; rows: Array<Record<string, unknown>> }>();
  function normLang(v: unknown): string | null {
    const s = String(v || "").trim().toLowerCase().slice(0, 20);
    return /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(s) ? s : null;
  }
  for (const r of rows || []) {
    const lang = normLang((r as Record<string, unknown>).target_language || (r as Record<string, unknown>).targetLanguage || (r as Record<string, unknown>).language) || "unknown";
    const cefr = normalizeCefr(String((r as Record<string, unknown>).cefr || (r as Record<string, unknown>).cefr_level || (r as Record<string, unknown>).cefrLevel || "")) || "unlevelled";
    const key = lang + ":" + cefr;
    if (!map.has(key)) map.set(key, { target_language: lang, cefr, count: 0, rows: [] });
    const g = map.get(key)!;
    g.count++;
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.target_language !== b.target_language) return a.target_language.localeCompare(b.target_language);
    const ai = (CEFR_ORDER as readonly string[]).indexOf(a.cefr);
    const bi = (CEFR_ORDER as readonly string[]).indexOf(b.cefr);
    if (ai === -1 && bi === -1) return a.cefr.localeCompare(b.cefr);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function groupByCefr(rows: Array<Record<string, unknown>>): Array<{ cefr: string; count: number; rows: Array<Record<string, unknown>> }> {
  const map = new Map<string, { cefr: string; count: number; rows: Array<Record<string, unknown>> }>();
  for (const r of rows || []) {
    const cefr = normalizeCefr(String((r as Record<string, unknown>).cefr || (r as Record<string, unknown>).cefr_level || (r as Record<string, unknown>).cefrLevel || "")) || "unlevelled";
    if (!map.has(cefr)) map.set(cefr, { cefr, count: 0, rows: [] });
    const g = map.get(cefr)!;
    g.count++;
    g.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = (CEFR_ORDER as readonly string[]).indexOf(a.cefr);
    const bi = (CEFR_ORDER as readonly string[]).indexOf(b.cefr);
    if (ai === -1 && bi === -1) return a.cefr.localeCompare(b.cefr);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
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
      <p className="hint">Press Enter or comma to add. Up to 12 per lesson. CEFR A1 to C2 also accepted.</p>
    </div>
  );
}
