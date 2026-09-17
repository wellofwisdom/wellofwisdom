// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";
import OrderItem from "../../../pages/learn/items/OrderItem";

const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

function toItems(text: string): { id: string; text: string }[] {
  return String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((t, i) => ({ id: `o${i + 1}`, text: t }));
}

function joinItems(items: { id?: string; text: string }[] | undefined): string {
  return (items ?? []).map((x) => x.text).join("\n");
}

export default function OrderForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [itemsText, setItemsText] = useState(joinItems(content.items));
  const [answerJoined, setAnswerJoined] = useState(() => (Array.isArray(content.answer) ? content.answer.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const items = toItems(itemsText);
    if (items.length < MIN_ITEMS) return { content: null, problem: "items_required" };
    if (String(itemsText).split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_ITEMS) return { content: null, problem: "too_many_items" };
    const ids = new Set(items.map((x) => x.id));
    const answer = String(answerJoined).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!answer.length) return { content: null, problem: "answer_required" };
    if (answer.length !== items.length) return { content: null, problem: "answer_invalid" };
    if (new Set(answer).size !== items.length) return { content: null, problem: "answer_invalid" };
    for (const id of answer) if (!ids.has(id)) return { content: null, problem: "answer_invalid" };
    const out: Record<string, any> = { prompt: p, kind: "order", items, answer };
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, itemsText, answerJoined, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label={`Items (one per line, ${MIN_ITEMS} to ${MAX_ITEMS})`}><textarea className="input" rows={4} value={itemsText} onChange={(e) => setItemsText(e.target.value)} /></Field>
      <Field label="Correct order (one id per line, e.g. o1)"><textarea className="input" rows={3} value={answerJoined} onChange={(e) => setAnswerJoined(e.target.value)} placeholder={"o1\no2\no3"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <OrderItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
