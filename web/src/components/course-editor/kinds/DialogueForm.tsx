// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

const MAX_TURNS = 6;
const MAX_GOALS = 8;
const MAX_GOOD = 8;

export default function DialogueForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [scene, setScene] = useState(content.scene ?? "");
  const [turns, setTurns] = useState(content.turns != null ? String(content.turns) : "3");
  const [goalsText, setGoalsText] = useState(() => (Array.isArray(content.goals) ? content.goals.join("\n") : ""));
  const [goodText, setGoodText] = useState(() => (Array.isArray(content.goodEndings) ? content.goodEndings.join("\n") : Array.isArray(content.good) ? content.good.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const sc = String(scene).trim();
    if (!sc) return { content: null, problem: "scene_required" };
    const n = Number(String(turns).trim());
    if (!Number.isInteger(n) || n < 1 || n > MAX_TURNS) return { content: null, problem: "turns_invalid" };
    const goals = String(goalsText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (goodsOverflow(goals, MAX_GOALS)) return { content: null, problem: "too_many_goals" };
    const good = String(goodText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (good.length > MAX_GOOD) return { content: null, problem: "too_many_goodEndings" };
    const hs = hints.map((h) => h.trim()).filter(Boolean);
    if (hs.length > 3) return { content: null, problem: "too_many_hints" };
    for (const h of hs) if (h.length > 500) return { content: null, problem: "hint_too_long" };
    const out: Record<string, any> = { prompt: p.slice(0, 2000), kind: "dialogue", scene: sc.slice(0, 4000), turns: n };
    if (goals.length) out.goals = goals.map((s) => s.slice(0, 500));
    if (good.length) out.goodEndings = good.map((s) => s.slice(0, 500));
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, scene, turns, goalsText, goodText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Greet the shopkeeper and ask for bread" /></Field>
      <Field label="Scene"><textarea className="input" rows={3} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="You are at a bakery in Madrid..." /></Field>
      <Field label={`Turns (1 to ${MAX_TURNS})`}>
        <input className="input small-input" style={{ maxWidth: 100 }} value={turns} onChange={(e) => setTurns(e.target.value)} />
      </Field>
      <Field label={`Goals (one per line, max ${MAX_GOALS})`}><textarea className="input" rows={3} value={goalsText} onChange={(e) => setGoalsText(e.target.value)} placeholder={"Greet politely\nAsk for pan\nSay gracias"} /></Field>
      <Field label={`Good endings (one per line, max ${MAX_GOOD})`}><textarea className="input" rows={2} value={goodText} onChange={(e) => setGoodText(e.target.value)} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <DialoguePreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function DialoguePreview({ content }: { content: Record<string, any> }) {
  const needed: number = Number(content.turns) || 3;
  const [turns, setTurns] = useState<string[]>(() => Array.from({ length: needed }, () => ""));
  const goals: string[] = Array.isArray(content.goals) ? content.goals : [];
  const ensure = (n: number) => {
    if (turns.length === n) return;
    setTurns((prev) => {
      if (prev.length === n) return prev;
      if (prev.length < n) return [...prev, ...Array.from({ length: n - prev.length }, () => "")];
      return prev.slice(0, n);
    });
  };
  ensure(needed);
  const nonEmpty = turns.map((s) => s.trim()).filter(Boolean).length;
  const progress = needed ? `${nonEmpty}/${needed} turns` : "";
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{content.prompt}</p>
      <p className="small" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>{content.scene}</p>
      {goals.length > 0 && (
        <ul className="small" style={{ margin: "0 0 8px 18px" }}>
          {goals.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
      {turns.map((t, i) => (
        <Field key={i} label={`Turn ${i + 1}`}>
          <input className="input" value={t} onChange={(e) => setTurns(turns.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={i === 0 ? "Hola, buenos dias..." : "Your reply"} />
        </Field>
      ))}
      <p className="muted small" style={{ marginTop: 6 }}>{progress}{nonEmpty >= needed ? " (ready to submit)" : ""}</p>
    </div>
  );
}

function goodsOverflow(arr: string[], max: number) { return arr.length > max; }

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
