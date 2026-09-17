// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import NumberlineItem from "../../../pages/learn/items/NumberlineItem";
import type { ItemNode } from "../../../types";

export default function NumberlineForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? content.text ?? "");
  const [min, setMin] = useState(content.min != null ? String(content.min) : "");
  const [max, setMax] = useState(content.max != null ? String(content.max) : "");
  const [step, setStep] = useState(content.step != null ? String(content.step) : "");
  const [answer, setAnswer] = useState(content.answer != null ? String(content.answer) : "");
  const [tolerance, setTolerance] = useState(content.tolerance != null ? String(content.tolerance) : "");
  const [labels, setLabels] = useState(Array.isArray(content.labels) ? content.labels.join("\n") : "");
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const mn = Number(String(min).trim()), mx = Number(String(max).trim());
    if (!Number.isFinite(mn) || !Number.isFinite(mx)) return { content: null, problem: "range_required" };
    if (mn >= mx) return { content: null, problem: "range_invalid" };
    if (String(step).trim()) {
      const s = Number(String(step).trim());
      if (!Number.isFinite(s) || s <= 0) return { content: null, problem: "step_invalid" };
    }
    const ansRaw = String(answer).trim();
    if (!ansRaw) return { content: null, problem: "answer_required" };
    const ans = Number(ansRaw);
    if (!Number.isFinite(ans)) return { content: null, problem: "answer_required" };
    if (String(tolerance).trim()) {
      const t = Number(String(tolerance).trim());
      if (!Number.isFinite(t) || t < 0) return { content: null, problem: "tolerance_invalid" };
    }
    const out: Record<string, any> = { prompt: p, kind: "numberline", min: mn, max: mx, answer: ans };
    if (String(step).trim()) out.step = Number(String(step).trim());
    if (String(tolerance).trim()) out.tolerance = Number(String(tolerance).trim());
    const lbs = String(labels).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (lbs.length) out.labels = lbs;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, min, max, step, answer, tolerance, labels, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <div className="row wrap" style={{ gap: 8 }}>
        <Field label="Min"><input className="input small-input" style={{ maxWidth: 100 }} value={min} onChange={(e) => setMin(e.target.value)} /></Field>
        <Field label="Max"><input className="input small-input" style={{ maxWidth: 100 }} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        <Field label="Step (optional)"><input className="input small-input" style={{ maxWidth: 100 }} value={step} onChange={(e) => setStep(e.target.value)} /></Field>
      </div>
      <Field label="Answer (number)"><input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
      <Field label="Tolerance (optional)"><input className="input" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="auto" /></Field>
      <Field label="Labels (one per line, optional, max 8)"><textarea className="input" rows={2} value={labels} onChange={(e) => setLabels(e.target.value)} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <NumberlineItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
