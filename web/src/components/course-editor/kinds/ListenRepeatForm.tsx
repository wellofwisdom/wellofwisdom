// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";

// Mirrors of server/lib/items/kinds/listen_repeat.js caps.
const MAX_ALTERNATIVES = 10;
const MEDIA_RE = /^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/;

export default function ListenRepeatForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [prompt, setPrompt] = useState(content.prompt ?? "");
  const [expected, setExpected] = useState(content.expected ?? "");
  const [uploadId, setUploadId] = useState(() => {
    const m = /^\/media\/(\d+)(?:\/captions\.vtt)?(?:\?.*)?$/.exec(String(content.audioUrl ?? "").trim());
    return m ? m[1] : "";
  });
  const [mediaUrl, setMediaUrl] = useState(() => {
    const u = String(content.audioUrl ?? "").trim();
    return u && !/^\/media\/\d+(?:\/captions\.vtt)?(?:\?.*)?$/.test(u) ? u : "";
  });
  const [audioText, setAudioText] = useState(content.audioText ?? "");
  const [alternativesText, setAlternativesText] = useState(() => (Array.isArray(content.alternatives) ? content.alternatives.join("\n") : ""));
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const p = String(prompt).trim();
    if (!p) return { content: null, problem: "prompt_required" };
    const exp = String(expected).trim();
    if (!exp) return { content: null, problem: "expected_required" };
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
    const out: Record<string, any> = { prompt: p.slice(0, 2000), kind: "listen_repeat", expected: exp.slice(0, 2000) };
    if (audioUrl) out.audioUrl = audioUrl.slice(0, 500);
    if (at) out.audioText = at.slice(0, 2000);
    if (alts.length) out.alternatives = alts.map((s) => s.slice(0, 2000));
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [prompt, expected, uploadId, mediaUrl, audioText, alternativesText, hints, explanation]);

  useEffect(() => { onBuilt(built.content, built.problem); }, [built, onBuilt]);
  useEffect(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Prompt"><textarea className="input" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Listen and repeat:" /></Field>
      <Field label="Expected phrase (what the learner should say)"><input className="input" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Le livre est rouge." /></Field>
      <Field label="Audio: uploaded file id (optional, from the media library)"><input className="input small-input" style={{ maxWidth: 140 }} value={uploadId} onChange={(e) => setUploadId(e.target.value)} placeholder="123" /></Field>
      <Field label="Audio: or media link (optional, /media/123)"><input className="input" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="/media/123" /></Field>
      <Field label="Audio text (optional, spoken by the browser; shown as a caption when a file is set)"><input className="input" value={audioText} onChange={(e) => setAudioText(e.target.value)} placeholder="Le livre est rouge." /></Field>
      <Field label={`Accepted alternatives (one per line, max ${MAX_ALTERNATIVES})`}><textarea className="input" rows={3} value={alternativesText} onChange={(e) => setAlternativesText(e.target.value)} placeholder={"Le livre est rouge\nle livre est rouge"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <ListenRepeatPreview content={built.content} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}

function ListenRepeatPreview({ content }: { content: Record<string, any> }) {
  const [said, setSaid] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const check = () => {
    const tokens = (s: string) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const given = tokens(said);
    if (!given.length) { setResult(null); return; }
    const options = [tokens(content.expected), ...(Array.isArray(content.alternatives) ? content.alternatives.map(tokens) : [])];
    let best = 0;
    for (const words of options) {
      let matched = 0;
      for (let i = 0; i < words.length; i++) {
        if (i < given.length && words[i] === given[i]) matched++;
        else break;
      }
      if (words.length) best = Math.max(best, matched / words.length);
    }
    setResult(best === 1 ? "Correct" : `Matches ${Math.round(best * 100)}% of the words in order`);
  };
  return (
    <div>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{content.prompt}</p>
      {content.audioUrl
        ? <p className="muted small" style={{ marginBottom: 6 }}>🎧 audio file {content.audioUrl}</p>
        : <p className="muted small" style={{ marginBottom: 6 }}>🔊 browser voice</p>}
      {content.audioText && <p className="muted small" style={{ marginBottom: 8 }}>{content.audioText}</p>}
      <div className="row" style={{ gap: 6 }}>
        <input className="input" value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Type what you would say" style={{ flex: 1 }} />
        <button className="btn ghost small-btn" type="button" onClick={check}>Check</button>
      </div>
      {result && <p className="small" style={{ marginTop: 6 }}>{result}</p>}
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
