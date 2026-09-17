// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import CategorizeItem from "../../../pages/learn/items/CategorizeItem";
import type { ItemNode } from "../../../types";

const MAX_BUCKETS = 6;
const MIN_BUCKETS = 2;
const MAX_CARDS = 12;
const MIN_CARDS = 2;

function toBuckets(text: string): { id: string; label: string }[] {
  return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_BUCKETS).map((label, i) => ({ id: `b${i + 1}`, label }));
}
function toCards(text: string): { id: string; text: string }[] {
  return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_CARDS).map((t, i) => ({ id: `d${i + 1}`, text: t }));
}
function joinBuckets(buckets: { label: string }[] | undefined): string { return (buckets ?? []).map((b) => b.label).join("\n"); }
function joinCards(cards: { text: string }[] | undefined): string { return (cards ?? []).map((c) => c.text).join("\n"); }

export default function CategorizeForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [bucketsText, setBucketsText] = useState(joinBuckets(content.buckets));
  const [cardsText, setCardsText] = useState(joinCards(content.cards));
  const [answerText, setAnswerText] = useState(() => {
    if (content.answer && typeof content.answer === "object") return Object.entries(content.answer).map(([k, v]) => `${k}=${v}`).join("\n");
    return "";
  });
  const [feedbackText, setFeedbackText] = useState(() => {
    if (content.feedback && typeof content.feedback === "object") return Object.entries(content.feedback as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join("\n");
    return "";
  });
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const buckets = toBuckets(bucketsText);
    const cards = toCards(cardsText);
    if (buckets.length < MIN_BUCKETS) return { content: null, problem: "buckets_required" };
    if (String(bucketsText).split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_BUCKETS) return { content: null, problem: "too_many_buckets" };
    if (cards.length < MIN_CARDS) return { content: null, problem: "cards_required" };
    if (String(cardsText).split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_CARDS) return { content: null, problem: "too_many_cards" };
    const bIds = new Set(buckets.map((b) => b.id));
    const cIds = new Set(cards.map((c) => c.id));
    const pairs = String(answerText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!pairs.length) return { content: null, problem: "answer_required" };
    const answer: Record<string, string> = {};
    for (const line of pairs) {
      const m = line.split("=");
      if (m.length !== 2) return { content: null, problem: "answer_invalid" };
      const c = m[0].trim(), b = m[1].trim();
      if (!cIds.has(c) || !bIds.has(b)) return { content: null, problem: "answer_invalid" };
      answer[c] = b;
    }
    if (Object.keys(answer).length !== cards.length) return { content: null, problem: "answer_invalid" };
    const feedback: Record<string, string> = {};
    for (const line of String(feedbackText).split("\n").map((s) => s.trim()).filter(Boolean)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim(), v = line.slice(idx + 1).trim().slice(0, 500);
      if (cIds.has(k) && v) feedback[k] = v;
    }
    const out: Record<string, any> = { prompt: p, kind: "categorize", buckets, cards, answer };
    if (Object.keys(feedback).length) out.feedback = feedback;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, bucketsText, cardsText, answerText, feedbackText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label={`Buckets (one per line, ${MIN_BUCKETS} to ${MAX_BUCKETS})`}><textarea className="input" rows={3} value={bucketsText} onChange={(e) => setBucketsText(e.target.value)} /></Field>
      <Field label={`Cards (one per line, ${MIN_CARDS} to ${MAX_CARDS})`}><textarea className="input" rows={4} value={cardsText} onChange={(e) => setCardsText(e.target.value)} /></Field>
      <Field label="Answer (one per line as d1=b1)"><textarea className="input" rows={3} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder={"d1=b1\nd2=b1\nd3=b2"} /></Field>
      <Field label="Per-card feedback (optional, one per line as d1: why)"><textarea className="input" rows={2} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <CategorizeItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
