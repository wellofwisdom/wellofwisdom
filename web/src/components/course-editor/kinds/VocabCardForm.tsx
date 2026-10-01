// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

const MAX_ALTERNATIVES = 10;
const LEVELS = ["A1", "A2", "B1", "B2"] as const;

export default function VocabCardForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [lemma, setLemma] = useState(content.lemma ?? "");
  const [gloss, setGloss] = useState(content.gloss ?? "");
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [form, setForm] = useState(content.form ?? "");
  const [example, setExample] = useState(content.example ?? "");
  const [exampleGloss, setExampleGloss] = useState(content.exampleGloss ?? "");
  const [pos, setPos] = useState(content.pos ?? "");
  const [level, setLevel] = useState(content.level ?? "");
  const [imagePrompt, setImagePrompt] = useState(content.imagePrompt ?? "");
  const [audioText, setAudioText] = useState(content.audioText ?? "");
  const [alternativesText, setAlternativesText] = useState(() => (Array.isArray(content.alternatives) ? content.alternatives.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const lemmaRaw = String(lemma).trim();
    if (!lemmaRaw) return { content: null, problem: "lemma_required" };
    const glossRaw = String(gloss).trim();
    if (!glossRaw) return { content: null, problem: "gloss_required" };
    const p = String(prompt).trim();
    const lvl = String(level).trim().toUpperCase();
    if (lvl && !LEVELS.includes(lvl as (typeof LEVELS)[number])) return { content: null, problem: "level_invalid" };
    const ip = String(imagePrompt);
    if (ip.length > 500) return { content: null, problem: "imagePrompt_too_long" };
    const alts = String(alternativesText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (alts.length > MAX_ALTERNATIVES) return { content: null, problem: "too_many_alternatives" };
    const hs = hints.map((h) => h.trim()).filter(Boolean);
    if (hs.length > 3) return { content: null, problem: "too_many_hints" };
    for (const h of hs) if (h.length > 500) return { content: null, problem: "hint_too_long" };
    const out: Record<string, any> = { kind: "vocab_card", lemma: lemmaRaw.slice(0, 200), gloss: glossRaw.slice(0, 500) };
    if (p) out.prompt = p.slice(0, 2000);
    const f = String(form).trim();
    if (f) out.form = f.slice(0, 200);
    const ex = String(example).trim();
    if (ex) out.example = ex.slice(0, 2000);
    const eg = String(exampleGloss).trim();
    if (eg) out.exampleGloss = eg.slice(0, 2000);
    const pp = String(pos).trim();
    if (pp) out.pos = pp.slice(0, 100);
    if (lvl) out.level = lvl;
    if (String(imagePrompt).trim()) out.imagePrompt = String(imagePrompt).trim().slice(0, 500);
    if (String(audioText).trim()) out.audioText = String(audioText).trim().slice(0, 500);
    if (alts.length) out.alternatives = alts.map((s) => s.slice(0, 200));
    if (hs.length) out.hints = hs;
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    return { content: out, problem: null };
  }, [lemma, gloss, prompt, form, example, exampleGloss, pos, level, imagePrompt, audioText, alternativesText, hints, explanation]);

  useEffect(() => { onBuilt(built.content, built.problem); }, [built, onBuilt]);
  useEffect(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Lemma (word)"><input className="input" value={lemma} onChange={(e) => setLemma(e.target.value)} placeholder="bonjour" /></Field>
      <Field label="Gloss (meaning)"><input className="input" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="hello" /></Field>
      <Field label="Prompt (optional, defaults to lemma)"><input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Say hello" /></Field>
      <Field label="Form (optional, e.g. plural)"><input className="input" value={form} onChange={(e) => setForm(e.target.value)} placeholder="bonjours" /></Field>
      <Field label="Example sentence"><textarea className="input" rows={2} value={example} onChange={(e) => setExample(e.target.value)} placeholder="Bonjour ! Comment ca va ?" /></Field>
      <Field label="Example gloss"><textarea className="input" rows={2} value={exampleGloss} onChange={(e) => setExampleGloss(e.target.value)} placeholder="Hello! How are you?" /></Field>
      <div className="row wrap" style={{ gap: 8 }}>
        <Field label="Part of speech"><input className="input small-input" style={{ maxWidth: 140 }} value={pos} onChange={(e) => setPos(e.target.value)} placeholder="noun" /></Field>
        <Field label="Level">
          <select className="input small-input" style={{ maxWidth: 100 }} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">auto</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Image prompt (optional, for generation)"><textarea className="input" rows={2} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} maxLength={500} placeholder="A friendly greeting scene" /></Field>
      <Field label="Audio text (optional, spoken aloud)"><input className="input" value={audioText} onChange={(e) => setAudioText(e.target.value)} maxLength={500} placeholder="bonjour" /></Field>
      <Field label={`Alternatives for gloss (one per line, max ${MAX_ALTERNATIVES})`}><textarea className="input" rows={2} value={alternativesText} onChange={(e) => setAlternativesText(e.target.value)} placeholder={"hi\ngood morning"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <VocabPreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function VocabPreview({ content }: { content: Record<string, any> }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const check = () => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/^[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+|[^a-z0-9\u00c0-\u024f\u00e4\u00f6\u00fc\u00df]+$/gi, "");
    const given = norm(answer);
    if (!given) { setResult(null); return; }
    const expected = norm(content.gloss);
    if (given === expected) { setResult("Correct"); return; }
    const alts: string[] = Array.isArray(content.alternatives) ? content.alternatives : [];
    for (const a of alts) if (given === norm(a)) { setResult("Correct (alternative)"); return; }
    setResult("Not quite");
  };
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{content.form || content.lemma}</p>
      {content.pos && <p className="muted small" style={{ marginBottom: 4 }}>{content.pos}{content.level ? ` · ${content.level}` : ""}</p>}
      {content.example && <p className="small" style={{ marginBottom: 4, fontStyle: "italic" }}>{content.example}</p>}
      {content.exampleGloss && <p className="muted small" style={{ marginBottom: 8 }}>{content.exampleGloss}</p>}
      <div className="row" style={{ gap: 6 }}>
        <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" style={{ flex: 1 }} />
        <button className="btn ghost small-btn" type="button" onClick={check}>Check</button>
      </div>
      {result && <p className="small" style={{ marginTop: 6 }}>{result}</p>}
      {content.audioText && <p className="muted small" style={{ marginTop: 6 }}>🔊 {content.audioText}</p>}
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
