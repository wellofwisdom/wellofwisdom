// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import MatchItem from "../../../pages/learn/items/MatchItem";
import type { ItemNode } from "../../../types";

const MIN_PAIRS = 2;
const MAX_PAIRS = 6;

function toLeft(text: string): { id: string; text: string }[] {
  return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_PAIRS).map((t, i) => ({ id: `l${i + 1}`, text: t }));
}
function toRight(text: string): { id: string; text: string }[] {
  return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_PAIRS).map((t, i) => ({ id: `r${i + 1}`, text: t }));
}
function joinSide(arr: { text: string }[] | undefined): string {
  return (arr ?? []).map((x) => x.text).join("\n");
}
function answerFromPairs(left: { id: string }[], pairs: [string, string][]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [l, r] of pairs) out[l] = r;
  if (Object.keys(out).length !== left.length) return null;
  return out;
}

export default function MatchForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [leftText, setLeftText] = useState(joinSide(content.left));
  const [rightText, setRightText] = useState(joinSide(content.right));
  const [pairsText, setPairsText] = useState(() => {
    if (content.answer && typeof content.answer === "object") return Object.entries(content.answer).map(([k, v]) => `${k}=${v}`).join("\n");
    return "";
  });
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const left = toLeft(leftText);
    const right = toRight(rightText);
    if (left.length < MIN_PAIRS || right.length < MIN_PAIRS) return { content: null, problem: "pairs_required" };
    if (String(leftText).split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_PAIRS || String(rightText).split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_PAIRS) return { content: null, problem: "too_many_pairs" };
    if (left.length !== right.length) return { content: null, problem: "pairs_mismatch" };
    const pairLines = String(pairsText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!pairLines.length) return { content: null, problem: "answer_required" };
    const pairs: [string, string][] = [];
    for (const line of pairLines) {
      const m = line.split("=");
      if (m.length !== 2) return { content: null, problem: "answer_invalid" };
      const l = m[0].trim(), r = m[1].trim();
      if (!l || !r) return { content: null, problem: "answer_invalid" };
      pairs.push([l, r]);
    }
    const idsL = new Set(left.map((x) => x.id));
    const idsR = new Set(right.map((x) => x.id));
    for (const [l, r] of pairs) if (!idsL.has(l) || !idsR.has(r)) return { content: null, problem: "answer_invalid" };
    if (new Set(pairs.map(([, r]) => r)).size !== left.length) return { content: null, problem: "answer_invalid" };
    const answer = answerFromPairs(left, pairs);
    if (!answer) return { content: null, problem: "answer_invalid" };
    const out: Record<string, any> = { prompt: p, kind: "match", left, right, answer };
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, leftText, rightText, pairsText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label={`Left side (one per line, ${MIN_PAIRS} to ${MAX_PAIRS})`}><textarea className="input" rows={3} value={leftText} onChange={(e) => setLeftText(e.target.value)} /></Field>
      <Field label={`Right side (one per line, ${MIN_PAIRS} to ${MAX_PAIRS})`}><textarea className="input" rows={3} value={rightText} onChange={(e) => setRightText(e.target.value)} /></Field>
      <Field label="Answer pairs (one per line as l1=r2)"><textarea className="input" rows={3} value={pairsText} onChange={(e) => setPairsText(e.target.value)} placeholder={"l1=r1\nl2=r2"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <MatchItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
