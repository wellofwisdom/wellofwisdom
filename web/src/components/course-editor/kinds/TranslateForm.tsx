// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

const MAX_ALTERNATIVES = 10;

export default function TranslateForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [direction, setDirection] = useState(content.direction ?? "");
  const [expected, setExpected] = useState(content.expected ?? "");
  const [alternativesText, setAlternativesText] = useState(() => (Array.isArray(content.alternatives) ? content.alternatives.join("\n") : ""));
  const [rubric, setRubric] = useState(content.rubric ?? "");
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const exp = String(expected).trim();
    if (!exp) return { content: null, problem: "expected_required" };
    const dir = String(direction).trim();
    if (dir && dir !== "en_to_es" && dir !== "es_to_en") return { content: null, problem: "direction_invalid" };
    const alts = String(alternativesText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (alts.length > MAX_ALTERNATIVES) return { content: null, problem: "too_many_alternatives" };
    const seen = new Set<string>();
    for (const a of alts) {
      const low = a.toLowerCase();
      if (seen.has(low)) return { content: null, problem: "alternative_duplicate" };
      seen.add(low);
    }
    if (alts.length && alts.map((s) => s.toLowerCase()).includes(exp.toLowerCase())) return { content: null, problem: "alternative_duplicate" };
    const hs = hints.map((h) => h.trim()).filter(Boolean);
    if (hs.length > 3) return { content: null, problem: "too_many_hints" };
    for (const h of hs) if (h.length > 500) return { content: null, problem: "hint_too_long" };
    const out: Record<string, any> = { prompt: p.slice(0, 2000), kind: "translate", expected: exp.slice(0, 2000) };
    if (dir) out.direction = dir;
    if (alts.length) out.alternatives = alts.map((s) => s.slice(0, 2000));
    if (rubric.trim()) out.rubric = rubric.trim().slice(0, 3000);
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, direction, expected, alternativesText, rubric, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Translate to Spanish: Good morning" /></Field>
      <div className="row wrap" style={{ gap: 8 }}>
        <Field label="Direction">
          <select className="input small-input" style={{ maxWidth: 180 }} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">auto</option>
            <option value="en_to_es">English to Spanish</option>
            <option value="es_to_en">Spanish to English</option>
          </select>
        </Field>
      </div>
      <Field label="Expected answer"><input className="input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Buenos dias" /></Field>
      <Field label={`Alternatives (one per line, max ${MAX_ALTERNATIVES})`}><textarea className="input" rows={3} value={alternativesText} onChange={(e) => setAlternativesText(e.target.value)} placeholder={"buenos dias\nbuen dia"} /></Field>
      <Field label="Rubric (grading notes, not shown to learner)"><textarea className="input" rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <TranslatePreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function TranslatePreview({ content }: { content: Record<string, any> }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const check = () => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const given = norm(answer);
    const exp = norm(content.expected);
    if (!given) { setResult(null); return; }
    if (given === exp) { setResult("Correct"); return; }
    const alts: string[] = Array.isArray(content.alternatives) ? content.alternatives : [];
    for (const a of alts) if (given === norm(a)) { setResult("Correct (alternative)"); return; }
    setResult("Needs review");
  };
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{content.prompt}</p>
      {content.direction && <p className="muted small" style={{ marginBottom: 6 }}>Direction: {content.direction}</p>}
      <div className="row" style={{ gap: 6 }}>
        <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your translation" style={{ flex: 1 }} />
        <button className="btn ghost small-btn" type="button" onClick={check}>Check</button>
      </div>
      {result && <p className="small" style={{ marginTop: 6 }}>{result}</p>}
      {Array.isArray(content.alternatives) && content.alternatives.length > 0 && <p className="muted small" style={{ marginTop: 6 }}>Accepts {content.alternatives.length} alternative(s)</p>}
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
