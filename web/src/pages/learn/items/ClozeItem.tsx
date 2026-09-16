// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from "react";
import { api, niceError } from "../../../api";
import { triggerRumble } from "../../../lib/gamepad";
import type { ItemNode } from "../../../types";
import { useT } from "../../../i18n";
import HintLadder from "./HintLadder";
import TutorChat from "../TutorChat";

interface AttemptResponse {
  correct: boolean | null;
  score?: number | null;
  reveal: { kind: string; explanation: string | null };
}

type ClozeBlank = { id: string; choices?: string[] };
type ClozeData = { text: string; blanks: ClozeBlank[]; prompt?: string };

function parseCloze(content: Record<string, unknown>): ClozeData | null {
  const rawText = String((content as { text?: unknown }).text ?? (content as { prompt?: unknown }).prompt ?? "").trim();
  const prompt = String((content as { prompt?: unknown }).prompt ?? "").trim();
  const rawBlanks = (content as { blanks?: unknown }).blanks;
  let blanks: ClozeBlank[] = [];
  if (Array.isArray(rawBlanks)) {
    blanks = rawBlanks
      .filter((b) => b && typeof (b as { id?: unknown }).id === "string")
      .map((b) => {
        const id = String((b as { id: string }).id);
        const ch = (b as { choices?: unknown }).choices;
        const choices = Array.isArray(ch) ? ch.map((v) => String(v ?? "").trim()).filter(Boolean) : undefined;
        return choices && choices.length ? { id, choices } : { id };
      });
  }
  const markers = [...rawText.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => String(m[1]).trim()).filter(Boolean);
  if (!rawText) return null;
  if (blanks.length === 0 && markers.length === 0) return null;
  if (blanks.length === 0 && markers.length > 0) {
    blanks = markers.map((id) => ({ id }));
  }
  const blankIds = new Set(blanks.map((b) => b.id));
  const hasMarker = markers.length > 0 ? markers.some((id) => blankIds.has(id)) : true;
  if (markers.length > 0 && !hasMarker) return null;
  return { text: rawText, blanks, prompt: prompt || undefined };
}

type Segment = { kind: "text"; text: string } | { kind: "blank"; id: string };

function splitText(text: string): Segment[] {
  const segs: Segment[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) segs.push({ kind: "text", text: text.slice(last, m.index) });
    segs.push({ kind: "blank", id: String(m[1]).trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ kind: "text", text: text.slice(last) });
  if (segs.length === 0) segs.push({ kind: "text", text });
  return segs;
}

export function parseClozeForTest(content: Record<string, unknown>): ClozeData | null {
  return parseCloze(content);
}

export function splitClozeTextForTest(text: string): Segment[] {
  return splitText(text);
}

export default function ClozeItem({
  item,
  solved,
  onSolved,
  qKey,
  qIdx,
}: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  qKey: string;
  qIdx: number;
}) {
  const { t } = useT();
  const data = useMemo(() => parseCloze(item.content as Record<string, unknown>), [item.content]);
  const c = item.content as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [err, setErr] = useState("");
  const isSolved = solved[qKey] === true;
  const correct = result?.correct === true;

  if (!data) {
    const fallback = String((c as { text?: unknown }).text ?? (c as { prompt?: unknown }).prompt ?? "").trim();
    if (fallback) {
      const plain = fallback.replace(/\[\[([^\]]+)\]\]/g, "___");
      return (
        <section className="litem exercise" aria-label={t("cloze.label")}>
          <p>{plain}</p>
        </section>
      );
    }
    return (
      <section className="litem exercise" aria-label={t("cloze.label")}>
        <p className="muted small">{t("cloze.empty")}</p>
      </section>
    );
  }

  const segments = splitText(data.text);
  const blankMap = new Map(data.blanks.map((b) => [b.id, b]));
  const allFilled = data.blanks.every((b) => String(values[b.id] ?? "").trim() !== "");

  async function submit() {
    if (busy || result) return;
    setBusy(true);
    setErr("");
    try {
      const answer: Record<string, string> = {};
      for (const b of data!.blanks) answer[b.id] = String(values[b.id] ?? "").trim();
      const d = await api<AttemptResponse>("/api/learn/attempt", { method: "POST", body: { itemId: item.id, questionIndex: qIdx, answer } });
      setResult(d);
      onSolved(qKey, d.correct);
      if (d.correct === true) triggerRumble("hit");
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && allFilled && !busy && !result) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section className={`litem exercise${isSolved ? " solved" : ""}`} aria-labelledby={`cloze-prompt-${item.id}`}>
      <div className="exhead">
        <div id={`cloze-prompt-${item.id}`}>{data.prompt ? data.prompt : t("cloze.label")}</div>
        {isSolved && <span className="chip on">✓</span>}
      </div>

      {!result && (
        <>
          <div className="cloze-text" role="group" aria-labelledby={`cloze-prompt-${item.id}`} onKeyDown={handleKeyDown} style={{ lineHeight: 1.9, marginBottom: 12 }}>
            {segments.map((seg, i) => {
              if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
              const blank = blankMap.get(seg.id);
              const val = values[seg.id] ?? "";
              if (blank?.choices && blank.choices.length > 0) {
                return (
                  <select
                    key={i}
                    className="input"
                    value={val}
                    onChange={(e) => setValues((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                    aria-label={t("cloze.blankLabel", { id: seg.id })}
                    data-nav
                    data-say={val || t("cloze.blankEmpty")}
                    style={{ display: "inline-block", width: "auto", minWidth: 120, margin: "0 4px", verticalAlign: "middle" }}
                  >
                    <option value="">{t("cloze.choose")}</option>
                    {blank.choices.map((ch) => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </select>
                );
              }
              return (
                <input
                  key={i}
                  className="input"
                  value={val}
                  onChange={(e) => setValues((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                  placeholder={t("cloze.blankPlaceholder")}
                  aria-label={t("cloze.blankLabel", { id: seg.id })}
                  data-nav
                  data-say={val || t("cloze.blankEmpty")}
                  style={{ display: "inline-block", width: 140, margin: "0 4px", verticalAlign: "middle" }}
                />
              );
            })}
          </div>
          <div className="row wrap">
            <HintLadder content={c} />
            <button className="btn ghost" type="button" data-nav onClick={() => setTutorOpen(true)}>
              {t("exercise.askForHelp")}
            </button>
            <button className="btn primary" type="button" data-nav disabled={busy || !allFilled} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
        </>
      )}

      {tutorOpen && <TutorChat itemId={item.id} onClose={() => setTutorOpen(false)} />}

      {result && (
        <div className={`feedback ${correct ? "good" : "bad"}`} role="status" aria-live="polite">
          <strong>
            <span aria-hidden="true">{correct ? "✅" : "❌"}</span> {correct ? t("exercise.correct") : t("exercise.notQuite")}
          </strong>
          {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
          {!correct && (
            <button className="btn ghost" type="button" data-nav onClick={() => setResult(null)} style={{ marginTop: 8 }}>
              {t("exercise.tryAgain")}
            </button>
          )}
        </div>
      )}
      {err && <div className="formerror" role="alert">{err}</div>}
    </section>
  );
}
