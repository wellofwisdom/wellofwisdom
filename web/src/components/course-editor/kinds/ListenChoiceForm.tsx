// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

// Mirrors of server/lib/items/kinds/listen_choice.js caps.
const MAX_CHOICES = 6;
const MEDIA_RE = /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/;

export default function ListenChoiceForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [uploadId, setUploadId] = useState(() => {
    const m = /^\/media\/(\d+)(?:\/captions\.vtt)?(?:\?.*)?$/.exec(String(content.audioUrl ?? "").trim());
    return m ? m[1] : "";
  });
  const [mediaUrl, setMediaUrl] = useState(() => {
    const u = String(content.audioUrl ?? "").trim();
    return u && !/^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(u) ? u : "";
  });
  const [audioText, setAudioText] = useState(content.audioText ?? "");
  const [choicesText, setChoicesText] = useState(() => (Array.isArray(content.choices) ? content.choices.map((x: any) => String(x?.text ?? "")).join("\n") : ""));
  const [answerIdx, setAnswerIdx] = useState(() => {
    const ch = Array.isArray(content.choices) ? content.choices : [];
    const i = ch.findIndex((x: any) => x?.id != null && String(x.id) === String(content.answer ?? ""));
    return i >= 0 ? String(i) : "";
  });
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const uidText = String(uploadId).trim();
    const link = String(mediaUrl).trim();
    if (uidText && link) return { content: null, problem: "audio_conflict" };
    let audioUrl = "";
    if (uidText) {
      if (!/^\d+$/.test(uidText)) return { content: null, problem: "uploadId_invalid" };
      audioUrl = `/media/${Number(uidText)}`;
    } else if (link) {
      if (!MEDIA_RE.test(link)) return { content: null, problem: "audioUrl_invalid" };
      audioUrl = link;
    }
    const at = String(audioText).trim();
    if (!audioUrl && !at) return { content: null, problem: "audio_required" };
    const lines = String(choicesText).split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length < 2) return { content: null, problem: "choices_required" };
    if (lines.length > MAX_CHOICES) return { content: null, problem: "too_many_choices" };
    const choices = lines.map((text, i) => ({ id: `c${i + 1}`, text: text.slice(0, 500) }));
    if (answerIdx === "") return { content: null, problem: "answer_required" };
    const idx = Number(answerIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= choices.length) return { content: null, problem: "answer_invalid" };
    const hs = hints.map((h) => h.trim()).filter(Boolean);
    if (hs.length > 3) return { content: null, problem: "too_many_hints" };
    for (const h of hs) if (h.length > 500) return { content: null, problem: "hint_too_long" };
    const out: Record<string, any> = { prompt: p.slice(0, 2000), kind: "listen_choice", choices, answer: `c${idx + 1}` };
    if (audioUrl) out.audioUrl = audioUrl.slice(0, 500);
    if (at) out.audioText = at.slice(0, 2000);
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, uploadId, mediaUrl, audioText, choicesText, answerIdx, hints, explanation]);

  useEffect(() => { onBuilt(built.content, built.problem); }, [built, onBuilt]);
  useEffect(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What did you hear? Pick the sentence you heard." /></Field>
      <Field label="Audio: uploaded file id (optional, from the media library)"><input className="input small-input" style={{ maxWidth: 140 }} value={uploadId} onChange={(e) => setUploadId(e.target.value)} placeholder="123" /></Field>
      <Field label="Audio: or media link (optional, /media/123)"><input className="input" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="/media/123" /></Field>
      <Field label="Audio text (optional, spoken by the browser; shown as a caption when a file is set)"><input className="input" value={audioText} onChange={(e) => setAudioText(e.target.value)} placeholder="El libro es rojo." /></Field>
      <Field label={`Choices (one per line, 2 to ${MAX_CHOICES}, first is c1)`}><textarea className="input" rows={4} value={choicesText} onChange={(e) => setChoicesText(e.target.value)} placeholder={"El libro es rojo.\nLa silla es azul.\nLa mesa es verde."} /></Field>
      <Field label="Correct answer">
        <select className="input small-input" style={{ maxWidth: 220 }} value={answerIdx} onChange={(e) => setAnswerIdx(e.target.value)}>
          <option value="">Pick the correct choice</option>
          {String(choicesText).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, MAX_CHOICES).map((text, i) => (
            <option key={i} value={String(i)}>c{i + 1}: {text.slice(0, 60)}</option>
          ))}
        </select>
      </Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <ListenChoicePreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function ListenChoicePreview({ content }: { content: Record<string, any> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const check = () => {
    if (!picked) { setResult(null); return; }
    setResult(picked === content.answer ? "Correct" : "Not quite");
  };
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{content.prompt}</p>
      {content.audioUrl
        ? <p className="muted small" style={{ marginBottom: 6 }}>🎧 audio file {content.audioUrl}</p>
        : <p className="muted small" style={{ marginBottom: 6 }}>🔊 browser voice</p>}
      {content.audioText && <p className="muted small" style={{ marginBottom: 8 }}>{content.audioText}</p>}
      <div className="choices" role="radiogroup">
        {(content.choices as { id: string; text: string }[]).map((ch) => (
          <button key={ch.id} type="button" role="radio" aria-checked={picked === ch.id}
            className={`choice${picked === ch.id ? " picked" : ""}`}
            onClick={() => { setPicked(ch.id); setResult(null); }}>
            {ch.text}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn ghost small-btn" type="button" onClick={check}>Check</button>
        {result && <p className="small">{result}</p>}
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
