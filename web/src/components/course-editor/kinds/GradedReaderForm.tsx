// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Field } from "../../ui";
import type { ItemNode } from "../../../types";
import GradedReaderItem from "../../../pages/learn/items/GradedReaderItem";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const MAX_GLOSSES = 100;

export default function GradedReaderForm({ content, onBuilt, onPreview }: { content: Record<string, any>; onBuilt: (c: Record<string, any> | null, p: string | null) => void; onPreview: (it: ItemNode) => void }) {
  const [title, setTitle] = useState(content.title ?? "");
  const [body, setBody] = useState(content.body ?? "");
  const [level, setLevel] = useState(content.level ?? "A1");
  const [glossesText, setGlossesText] = useState(() => {
    const g = content.glosses;
    if (!g || typeof g !== "object" || Array.isArray(g)) return "";
    return Object.entries(g as Record<string, string>).map(([k, v]) => `${k}=${v}`).join("\n");
  });

  const built = useMemo(() => {
    const b = String(body).trim();
    if (!b) return { content: null, problem: "body_required" };
    const lvl = String(level).trim().toUpperCase().slice(0, 4);
    if (!LEVELS.includes(lvl as (typeof LEVELS)[number])) return { content: null, problem: "level_invalid" };
    let glosses: Record<string, string> | undefined;
    const gt = String(glossesText).trim();
    if (gt) {
      const lines = gt.split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length > MAX_GLOSSES) return { content: null, problem: "too_many_glosses" };
      const out: Record<string, string> = {};
      for (const line of lines) {
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim().slice(0, 100);
        const v = line.slice(eq + 1).trim().slice(0, 500);
        if (!k || !v) return { content: null, problem: "gloss_invalid" };
        if (k.length > 100) return { content: null, problem: "gloss_too_long" };
        if (v.length > 500) return { content: null, problem: "gloss_too_long" };
        if (out[k] != null) continue;
        out[k] = v;
      }
      if (Object.keys(out).length) glosses = out;
      else if (lines.length) return { content: null, problem: "gloss_invalid" };
    }
    const out: Record<string, any> = { title: String(title).trim().slice(0, 300) || "Reader", body: b.slice(0, 20000), level: lvl };
    if (glosses) out.glosses = glosses;
    return { content: out, problem: null };
  }, [title, body, level, glossesText]);

  useEffect(() => { onBuilt(built.content, built.problem); }, [built, onBuilt]);
  useEffect(() => {
    if (built.content) onPreview({ id: -1, type: "graded_reader", position: 0, content: built.content });
  }, [built, onPreview]);

  return (
    <div className="kindform">
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A morning in Paris" maxLength={300} /></Field>
      <Field label="Body (reader text)"><textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Bonjour ! Je m'appelle..." /></Field>
      <Field label="Level">
        <select className="input small-input" style={{ maxWidth: 120 }} value={String(level).toUpperCase()} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label={`Glosses (one per line as word=meaning, max ${MAX_GLOSSES})`} hint="Tap to reveal in the learner view"><textarea className="input" rows={4} value={glossesText} onChange={(e) => setGlossesText(e.target.value)} placeholder={"bonjour=hello\nmerci=thank you"} /></Field>
      {built.problem && <p className="formerror small" role="alert">{built.problem}</p>}
      <div className="previewPane" style={{ marginTop: 12, border: "1px solid var(--border, #eee)", borderRadius: 8, padding: 12 }}>
        <p className="muted small" style={{ marginBottom: 8 }}>Live preview</p>
        {built.content ? <GradedReaderItem item={{ id: -1, type: "graded_reader", position: 0, content: built.content }} /> : <p className="muted small">Fix the problem above.</p>}
      </div>
    </div>
  );
}
