// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

const MAX_ALTERNATIVES = 10;

export default function SpokenForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [expected, setExpected] = useState(content.expected ?? "");
  const [rubric, setRubric] = useState(content.rubric ?? "");
  const [alternativesText, setAlternativesText] = useState(() => (Array.isArray(content.alternatives) ? content.alternatives.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const exp = String(expected).trim();
    const rub = String(rubric).trim();
    if (!exp && !rub) return { content: null, problem: "expected_required" };
    const alts = String(alternativesText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (alts.length > MAX_ALTERNATIVES) return { content: null, problem: "too_many_alternatives" };
    const hs = hints.map((h) => h.trim()).filter(Boolean);
    if (hs.length > 3) return { content: null, problem: "too_many_hints" };
    for (const h of hs) if (h.length > 500) return { content: null, problem: "hint_too_long" };
    const out: Record<string, any> = { prompt: p.slice(0, 2000), kind: "spoken" };
    if (exp) out.expected = exp.slice(0, 2000);
    if (rub) out.rubric = rub.slice(0, 3000);
    if (alts.length) out.alternatives = alts.map((s) => s.slice(0, 2000));
    if (hs.length) out.hints = hs;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    return { content: out, problem: null };
  }, [prompt, expected, rubric, alternativesText, hints, explanation]);

  useEffect(() => { onBuilt(built.content, built.problem); }, [built, onBuilt]);
  useEffect(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Say good morning in French" /></Field>
      <Field label="Expected transcript (exact match, optional if rubric is set)"><input className="input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Bonjour" /></Field>
      <Field label="Rubric (grading guide for a human reviewer, optional if expected is set)"><textarea className="input" rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Any polite morning greeting counts" /></Field>
      <Field label={`Alternatives (one per line, max ${MAX_ALTERNATIVES})`}><textarea className="input" rows={3} value={alternativesText} onChange={(e) => setAlternativesText(e.target.value)} placeholder={"bonjour\nsalut"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <SpokenPreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function SpokenPreview({ content }: { content: Record<string, any> }) {
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const check = () => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+|[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+$/gi, "");
    const given = norm(transcript);
    if (!given) { setResult(null); return; }
    if (content.expected && given === norm(content.expected)) { setResult("Correct"); return; }
    const alts: string[] = Array.isArray(content.alternatives) ? content.alternatives : [];
    for (const a of alts) if (given === norm(a)) { setResult("Correct (alternative)"); return; }
    if (content.rubric) { setResult("Sent for review"); return; }
    setResult("Needs review");
  };
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{content.prompt}</p>
      {content.rubric && <p className="muted small" style={{ marginBottom: 6 }}>Rubric: {content.rubric.slice(0, 120)}</p>}
      <div className="row" style={{ gap: 6 }}>
        <input className="input" value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Transcript (or speak)" style={{ flex: 1 }} />
        <button className="btn ghost small-btn" type="button" onClick={check}>Check</button>
      </div>
      {result && <p className="small" style={{ marginTop: 6 }}>{result}</p>}
      {content.rubric && !content.expected && <p className="muted small" style={{ marginTop: 6 }}>Rubric graded: a human will review this.</p>}
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
