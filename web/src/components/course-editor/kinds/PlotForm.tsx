// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import PlotItem from "../../../pages/learn/items/PlotItem";
import type { ItemNode } from "../../../types";

const MAX_POINTS = 10;
const MAX_TOL = 5;

export default function PlotForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? content.text ?? "");
  const [gridText, setGridText] = useState(() => {
    const g = content.grid;
    if (g && typeof g === "object") return `${g.xmin ?? -10},${g.xmax ?? 10},${g.ymin ?? -10},${g.ymax ?? 10},${g.step ?? 1}`;
    return "-10,10,-10,10,1";
  });
  const [pointsText, setPointsText] = useState(() => (Array.isArray(content.answer) ? content.answer.map((p: any) => `${p.x},${p.y}`).join("\n") : ""));
  const [tolerance, setTolerance] = useState(content.tolerance != null ? String(content.tolerance) : "");
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const gridParts = String(gridText).split(",").map((s) => s.trim()).map(Number);
    if (gridParts.length !== 5 || gridParts.some((n) => !Number.isFinite(n))) return { content: null, problem: "grid_invalid" };
    const [xmin, xmax, ymin, ymax, step] = gridParts;
    if (step <= 0) return { content: null, problem: "grid_invalid" };
    const lines = String(pointsText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return { content: null, problem: "answer_required" };
    if (lines.length > MAX_POINTS) return { content: null, problem: "too_many_points" };
    const points: { x: number; y: number }[] = [];
    for (const line of lines) {
      const m = line.split(",").map((s) => s.trim());
      if (m.length !== 2) return { content: null, problem: "answer_invalid" };
      const x = Number(m[0]), y = Number(m[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { content: null, problem: "answer_invalid" };
      points.push({ x, y });
    }
    if (tolerance.trim()) {
      const t = Number(tolerance);
      if (!Number.isFinite(t) || t <= 0 || t > MAX_TOL) return { content: null, problem: "tolerance_invalid" };
    }
    const out: Record<string, any> = { prompt: p, kind: "plot", grid: { xmin, xmax, ymin, ymax, step }, answer: points };
    if (tolerance.trim()) out.tolerance = Number(tolerance);
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, gridText, pointsText, tolerance, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label="Grid as xmin,xmax,ymin,ymax,step"><input className="input" value={gridText} onChange={(e) => setGridText(e.target.value)} /></Field>
      <Field label={`Answer points (one per line as x,y, max ${MAX_POINTS})`}><textarea className="input" rows={3} value={pointsText} onChange={(e) => setPointsText(e.target.value)} placeholder={"0,0\n1,2"} /></Field>
      <Field label={`Tolerance (optional, 0 to ${MAX_TOL})`}><input className="input" value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="0.5" /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <PlotItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
