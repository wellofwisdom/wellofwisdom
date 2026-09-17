// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import FractionItem from "../../../pages/learn/items/FractionItem";
import type { ItemNode } from "../../../types";

export default function FractionForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? content.text ?? "");
  const [model, setModel] = useState<"bar" | "circle">(content.model === "circle" ? "circle" : "bar");
  const [parts, setParts] = useState(content.parts != null ? String(content.parts) : "");
  const [numerator, setNumerator] = useState(content.answer?.numerator != null ? String(content.answer.numerator) : "");
  const [denominator, setDenominator] = useState(content.answer?.denominator != null ? String(content.answer.denominator) : "");
  const [exact, setExact] = useState(Boolean(content.exact));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const pt = Number(String(parts).trim());
    if (!Number.isInteger(pt)) return { content: null, problem: "parts_required" };
    if (pt < 2 || pt > 24) return { content: null, problem: "parts_invalid" };
    const num = Number(String(numerator).trim()), den = Number(String(denominator).trim());
    if (!Number.isInteger(num) || !Number.isInteger(den)) return { content: null, problem: "answer_invalid" };
    if (den <= 0 || num < 0 || num > den) return { content: null, problem: "answer_invalid" };
    if (model !== "bar" && model !== "circle") return { content: null, problem: "model_invalid" };
    const out: Record<string, any> = { prompt: p, kind: "fraction", model, parts: pt, answer: { numerator: num, denominator: den } };
    if (exact) out.exact = true;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, model, parts, numerator, denominator, exact, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <div className="row wrap" style={{ gap: 8 }}>
        <Field label="Model">
          <select className="input small-input" style={{ maxWidth: 120 }} value={model} onChange={(e) => setModel(e.target.value as "bar" | "circle")}>
            <option value="bar">bar</option><option value="circle">circle</option>
          </select>
        </Field>
        <Field label="Parts (2 to 24)"><input className="input small-input" style={{ maxWidth: 100 }} value={parts} onChange={(e) => setParts(e.target.value)} /></Field>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <Field label="Numerator"><input className="input small-input" style={{ maxWidth: 100 }} value={numerator} onChange={(e) => setNumerator(e.target.value)} /></Field>
        <Field label="Denominator"><input className="input small-input" style={{ maxWidth: 100 }} value={denominator} onChange={(e) => setDenominator(e.target.value)} /></Field>
      </div>
      <label className="checkitem" style={{ cursor: "pointer" }}><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /><span className="t">Exact match only</span></label>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <FractionItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function HintsField({ hints, onChange }: { hints: string[]; onChange: (h: string[]) => void }) {
  return (
    <div>
      {hints.map((h, i) => (
        <Field key={i} label={`Hint ${i + 1}`}>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" value={h} maxLength={500} onChange={(e) => onChange(hints.map((x, idx) => (idx === i ? e.target.value : x)))} />
            <button className="btn ghost small-btn" type="button" onClick={() => onChange(hints.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        </Field>
      ))}
      {hints.length < 3 && <button className="btn ghost small-btn" type="button" onClick={() => onChange([...hints, ""])}>+ Hint</button>}
    </div>
  );
}
