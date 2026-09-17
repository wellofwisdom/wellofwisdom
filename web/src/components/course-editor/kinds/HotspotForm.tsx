// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import HotspotItem from "../../../pages/learn/items/HotspotItem";
import type { ItemNode } from "../../../types";

const MAX_REGIONS = 12;
const MAX_ANSWER_REGIONS = 6;

type RegionRow = { id: string; shape: "rect" | "poly"; pointsText: string };

function parsePoints(text: string): { x: number; y: number }[] | null {
  const parts = String(text || "").split(";").map((s) => s.trim()).filter(Boolean);
  const out: { x: number; y: number }[] = [];
  for (const part of parts) {
    const m = part.split(",").map((s) => s.trim());
    if (m.length !== 2) return null;
    const x = Number(m[0]), y = Number(m[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    out.push({ x, y });
  }
  return out;
}

function pointsToText(points: { x: number; y: number }[] | undefined): string {
  return (points ?? []).map((p) => `${p.x},${p.y}`).join("; ");
}

export default function HotspotForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? content.text ?? "");
  const [alt, setAlt] = useState(content.alt ?? "");
  const [uploadId, setUploadId] = useState(content.uploadId != null ? String(content.uploadId) : "");
  const [regions, setRegions] = useState<RegionRow[]>(() =>
    Array.isArray(content.regions) ? content.regions.map((r: any, i: number) => ({ id: String(r.id ?? `r${i + 1}`), shape: r.shape === "poly" ? "poly" as const : "rect" as const, pointsText: pointsToText(r.points) })) : []
  );
  const [answerText, setAnswerText] = useState(() => (Array.isArray(content.answer) ? content.answer.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    if (!regions.length) return { content: null, problem: "regions_required" };
    if (regions.length > MAX_REGIONS) return { content: null, problem: "too_many_regions" };
    const outRegions: { id: string; shape: "rect" | "poly"; points: { x: number; y: number }[] }[] = [];
    const ids = new Set<string>();
    for (const r of regions) {
      const id = String(r.id).trim().slice(0, 40);
      if (!id) return { content: null, problem: "regions_required" };
      if (ids.has(id)) return { content: null, problem: "answer_invalid" };
      ids.add(id);
      const pts = parsePoints(r.pointsText);
      if (!pts) return { content: null, problem: "regions_required" };
      if (r.shape === "rect" && pts.length < 2) return { content: null, problem: "regions_required" };
      if (r.shape === "poly" && pts.length < 3) return { content: null, problem: "regions_required" };
      outRegions.push({ id, shape: r.shape, points: r.shape === "rect" ? pts.slice(0, 2) : pts });
    }
    const answerIds = String(answerText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!answerIds.length) return { content: null, problem: "answer_required" };
    if (answerIds.length > MAX_ANSWER_REGIONS) return { content: null, problem: "too_many_answers" };
    if (new Set(answerIds).size !== answerIds.length) return { content: null, problem: "answer_duplicate" };
    for (const id of answerIds) if (!ids.has(id)) return { content: null, problem: "answer_invalid" };
    const out: Record<string, any> = { prompt: p, kind: "hotspot", regions: outRegions, answer: answerIds };
    if (String(alt).trim()) out.alt = String(alt).trim().slice(0, 500);
    const uid = Number(uploadId);
    if (Number.isInteger(uid) && uid > 0) out.uploadId = uid;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, alt, uploadId, regions, answerText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label="Alt text"><input className="input" value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image" /></Field>
      <Field label="Image upload id (optional)"><input className="input" value={uploadId} onChange={(e) => setUploadId(e.target.value)} placeholder="Upload id" /></Field>
      <div style={{ marginBottom: 8 }}>
        <p className="muted small" style={{ marginBottom: 6 }}>Regions (max {MAX_REGIONS}) :  points as x,y; x,y (percent 0 to 100). Rect needs 2 points, poly needs 3 plus.</p>
        {regions.map((r, i) => (
          <div key={i} className="row wrap" style={{ gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
            <Field label="Id"><input className="input small-input" style={{ maxWidth: 80 }} value={r.id} onChange={(e) => setRegions(regions.map((x, idx) => (idx === i ? { ...x, id: e.target.value } : x)))} /></Field>
            <Field label="Shape">
              <select className="input small-input" style={{ maxWidth: 90 }} value={r.shape} onChange={(e) => setRegions(regions.map((x, idx) => (idx === i ? { ...x, shape: e.target.value as "rect" | "poly" } : x)))}>
                <option value="rect">rect</option><option value="poly">poly</option>
              </select>
            </Field>
            <Field label="Points"><input className="input" style={{ minWidth: 180 }} value={r.pointsText} placeholder="10,10; 40,40" onChange={(e) => setRegions(regions.map((x, idx) => (idx === i ? { ...x, pointsText: e.target.value } : x)))} /></Field>
            <button className="btn ghost small-btn" type="button" onClick={() => setRegions(regions.filter((_, idx) => idx !== i))}>Remove</button>
          </div>
        ))}
        {regions.length < MAX_REGIONS && <button className="btn ghost small-btn" type="button" onClick={() => setRegions([...regions, { id: `r${regions.length + 1}`, shape: "rect", pointsText: "10,10; 40,40" }])}>+ Region</button>}
      </div>
      <Field label={`Answer (one region id per line, max ${MAX_ANSWER_REGIONS})`}><textarea className="input" rows={2} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder={"r1"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <HotspotItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
