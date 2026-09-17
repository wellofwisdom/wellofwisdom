// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import ScenarioItem from "../../../pages/learn/items/ScenarioItem";
import type { ItemNode } from "../../../types";

const MAX_NODES = 20;
const MAX_CHOICES = 4;
const MAX_GOOD = 8;

type NodeRow = { id: string; text: string; choicesText: string };

function parseChoices(text: string): { text: string; next: string; feedback?: string }[] {
  return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).map((line) => {
    const m = line.split("->").map((s) => s.trim());
    if (m.length !== 2) return null as any;
    return { text: m[0], next: m[1] };
  }).filter(Boolean);
}

export default function ScenarioForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [start, setStart] = useState(content.start ?? "");
  const [nodes, setNodes] = useState<NodeRow[]>(() => {
    if (content.nodes && typeof content.nodes === "object") return Object.entries(content.nodes as Record<string, any>).map(([id, n]) => ({ id, text: n.text ?? "", choicesText: (n.choices ?? []).map((c: any) => `${c.text} -> ${c.next}`).join("\n") }));
    return [];
  });
  const [goodText, setGoodText] = useState(() => (Array.isArray(content.good) ? content.good.join("\n") : Array.isArray(content.goodEndings) ? content.goodEndings.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    const s = String(start).trim().slice(0, 40);
    if (!s) return { content: null, problem: "start_required" };
    if (!nodes.length) return { content: null, problem: "nodes_required" };
    if (nodes.length > MAX_NODES) return { content: null, problem: "too_many_nodes" };
    const outNodes: Record<string, { text: string; choices: { text: string; next: string }[] }> = {};
    const ids = new Set<string>();
    for (const n of nodes) {
      const id = String(n.id).trim().slice(0, 40);
      if (!id || ids.has(id)) return { content: null, problem: "node_invalid" };
      ids.add(id);
      const t = String(n.text).trim();
      if (!t) return { content: null, problem: "node_text_required" };
      const choices = parseChoices(n.choicesText);
      if (choices.length > MAX_CHOICES) return { content: null, problem: "too_many_choices" };
      for (const c of choices) if (!c.text || !c.next) return { content: null, problem: "choice_text_required" };
      outNodes[id] = { text: t.slice(0, 2000), choices };
    }
    if (!outNodes[s]) return { content: null, problem: "start_invalid" };
    for (const ch of Object.values(outNodes).flatMap((n) => n.choices)) if (!outNodes[ch.next]) return { content: null, problem: "choice_next_invalid" };
    const good = String(goodText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!good.length) return { content: null, problem: "good_required" };
    if (good.length > MAX_GOOD) return { content: null, problem: "too_many_good" };
    if (new Set(good).size !== good.length) return { content: null, problem: "good_duplicate" };
    for (const id of good) if (!outNodes[id]) return { content: null, problem: "good_invalid" };
    const out: Record<string, any> = { prompt: p || "Choose your path", kind: "scenario", start: s, nodes: outNodes, good };
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, start, nodes, goodText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Choose your path" /></Field>
      <Field label="Start node id"><input className="input" value={start} onChange={(e) => setStart(e.target.value)} placeholder="start" /></Field>
      <div style={{ marginBottom: 8 }}>
        <p className="muted small" style={{ marginBottom: 6 }}>Nodes (max {MAX_NODES}), choices as text {"->"} nextId, max {MAX_CHOICES} per node</p>
        {nodes.map((n, i) => (
          <div key={i} style={{ border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <Field label="Id"><input className="input small-input" style={{ maxWidth: 120 }} value={n.id} onChange={(e) => setNodes(nodes.map((x, idx) => (idx === i ? { ...x, id: e.target.value } : x)))} /></Field>
              <button className="btn ghost small-btn" type="button" onClick={() => setNodes(nodes.filter((_, idx) => idx !== i))}>Remove node</button>
            </div>
            <Field label="Text"><textarea className="input" rows={2} value={n.text} onChange={(e) => setNodes(nodes.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))} /></Field>
            <Field label="Choices (one per line as text -> nextId)"><textarea className="input" rows={2} value={n.choicesText} onChange={(e) => setNodes(nodes.map((x, idx) => (idx === i ? { ...x, choicesText: e.target.value } : x)))} /></Field>
          </div>
        ))}
        {nodes.length < MAX_NODES && <button className="btn ghost small-btn" type="button" onClick={() => setNodes([...nodes, { id: `n${nodes.length + 1}`, text: "", choicesText: "" }])}>+ Node</button>}
      </div>
      <Field label={`Good endings (one id per line, max ${MAX_GOOD})`}><textarea className="input" rows={2} value={goodText} onChange={(e) => setGoodText(e.target.value)} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <ScenarioItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
