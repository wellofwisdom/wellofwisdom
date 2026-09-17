// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import MultiItem from "../../../pages/learn/items/MultiItem";
import type { ItemNode } from "../../../types";
import { MAX_CHOICES, joinChoices, toChoices } from "./common";

export default function MultiForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, problem: string | null) => void; onPreview: (item: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [choicesText, setChoicesText] = useState(joinChoices(content.choices));
  const [answerJoined, setAnswerJoined] = useState(() => (Array.isArray(content.answer) ? content.answer.map((v: string) => String(v)).join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const choices = toChoices(choicesText);
    if (choices.length < 2) return { content: null, problem: "choices_required" };
    if (choicesText.split("\n").map((s) => s.trim()).filter(Boolean).length > MAX_CHOICES) return { content: null, problem: "too_many_choices" };
    const ids = new Set(choices.map((c) => c.id));
    const answerIds = String(answerJoined).split("\n").map((s) => s.trim()).filter(Boolean).filter((id) => ids.has(id));
    if (!answerIds.length) return { content: null, problem: "answer_required" };
    const uniq = [...new Set(answerIds)];
    if (!uniq.length || uniq.some((id) => !ids.has(id))) return { content: null, problem: "answer_invalid" };
    const out: Record<string, any> = { prompt: p, kind: "multi", choices, answer: uniq };
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, choicesText, answerJoined, hints, explanation]);

  // push up
  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);

  // also push preview
  useMemo(() => {
    if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content });
  }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
      <Field label="Choices (one per line, max 5)"><textarea className="input" rows={4} value={choicesText} onChange={(e) => setChoicesText(e.target.value)} /></Field>
      <Field label="Correct answers (one choice id per line, e.g. c1)"><textarea className="input" rows={2} value={answerJoined} onChange={(e) => setAnswerJoined(e.target.value)} placeholder="c1&#10;c3" /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <MultiItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above to preview.</p>}
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
