// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { Field } from "../../ui";
import ClozeItem from "../../../pages/learn/items/ClozeItem";
import type { ItemNode } from "../../../types";

const MAX_BLANKS = 10;
const MAX_ACCEPT = 5;

function extractMarkers(text: string): string[] {
  const re = /\[\[(\w+)\]\]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(String(m[1]));
  return [...new Set(out)];
}

export default function ClozeForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [text, setText] = useState(content.text ?? "");
  const [blanksText, setBlanksText] = useState(() => {
    if (Array.isArray(content.blanks)) return content.blanks.map((b: any) => `${b.id}=${(b.accept ?? []).join("|")}${b.numeric ? " (numeric)" : ""}${b.choices ? ` [${b.choices.join(",")}]` : ""}`).join("\n");
    return "";
  });
  const [hints, setHints] = useState<string[]>(() => (Array.isArray(content.hints) ? content.hints : content.hint ? [content.hint] : []));
  const [explanation, setExplanation] = useState(content.explanation ?? "");

  const built = useMemo(() => {
    const t = String(text).trim();
    if (!t) return { content: null, problem: "text_required" };
    const markers = extractMarkers(t);
    if (!markers.length) return { content: null, problem: "blanks_required" };
    if (markers.length > MAX_BLANKS) return { content: null, problem: "too_many_blanks" };
    const lines = String(blanksText).split("\n").map((s) => s.trim()).filter(Boolean);
    const byId = new Map<string, { accept: string[]; numeric?: boolean; choices?: string[] }>();
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const id = line.slice(0, eq).trim();
      if (!id || !markers.includes(id)) continue;
      if (byId.has(id)) continue;
      const rest = line.slice(eq + 1).trim();
      const numeric = rest.includes("(numeric)");
      const choicesMatch = rest.match(/\[([^\]]+)\]/);
      const choices = choicesMatch ? choicesMatch[1].split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) : undefined;
      const acceptPart = rest.replace(/\(numeric\)/, "").replace(/\[[^\]]+\]/, "").trim();
      const accepts = acceptPart.split("|").map((s) => s.trim()).filter(Boolean).slice(0, MAX_ACCEPT);
      byId.set(id, { accept: accepts, ...(numeric ? { numeric: true } : {}), ...(choices ? { choices } : {}) });
    }
    for (const id of markers) {
      const b = byId.get(id);
      if (!b || !b.accept.length) return { content: null, problem: "answer_required" };
      if (b.choices && b.choices.length > 6) return { content: null, problem: "too_many_choices" };
    }
    const blanks = markers.map((id) => {
      const b = byId.get(id)!;
      const out: Record<string, any> = { id, accept: b.accept };
      if (b.numeric) out.numeric = true;
      if (b.choices) out.choices = b.choices;
      return out;
    });
    const out: Record<string, any> = { text: t, kind: "cloze", blanks };
    if (explanation.trim()) out.explanation = explanation.trim().slice(0, 3000);
    const hs = hints.map((h) => h.trim()).filter(Boolean).slice(0, 3);
    if (hs.length) out.hints = hs;
    return { content: out, problem: null };
  }, [text, blanksText, hints, explanation]);

  useMemo(() => onBuilt(built.content, built.problem), [built, onBuilt]);
  useMemo(() => { if (built.content) onPreview({ id: -1, type: "exercise", position: 0, content: built.content }); }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Text with [[blankId]] markers"><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="The capital is [[city]]." /></Field>
      <Field label="Blanks (one per line as id=accept1|accept2, add (numeric) and [choices] if needed)"><textarea className="input" rows={3} value={blanksText} onChange={(e) => setBlanksText(e.target.value)} placeholder={"city=Paris|paris\nmath=4 (numeric)"} /></Field>
      <Field label="Explanation"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
      <HintsField hints={hints} onChange={setHints} />
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <ClozeItem item={{ id: -1, type: "exercise", position: 0, content: built.content }} solved={{}} onSolved={() => {}} qKey="-1:0" qIdx={0} /> : <p className="muted small">Fix the problem above.</p>}
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
