// SPDX-License-Identifier: AGPL-3.0-or-later
// Editor supplementals for well17/editor-kind-forms: regenerate-with-instruction,
// verification flags (with publish gate handled server-side), make-lesson-interactive.
// Each reuses existing generation / verification routes where possible, so the
// editor does not own its own AI prompt; it just drives the jobs and renders
// draft beside original for accept or discard.

import { useEffect, useState } from "react";
import { api, niceError } from "../../api";
import type { ItemNode } from "../../types";
import { Modal, Panel } from "../ui";

// --- Verification flags ---

type FlagRow = { itemId: number; lessonId: number; verification: { flag: string; got?: string; dismissed?: boolean } };

export function VerificationFlags({ courseId, onRefresh }: { courseId: number; onRefresh: () => void }) {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const d = await api<{ flags: FlagRow[] }>(`/api/courses/${courseId}/verification`);
      setFlags((d.flags ?? []).filter((f) => !f.verification?.dismissed && f.verification?.flag === "check_this_answer"));
    } catch { /* ignore */ }
  }

  async function verify() {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/courses/${courseId}/verify`, { method: "POST" });
      setMsg("Verification started. Flags will refresh.");
    } catch (e) { setMsg(niceError(e)); } finally { setBusy(false); }
  }

  async function dismiss(itemId: number) {
    try {
      await api(`/api/courses/items/${itemId}/verification/dismiss`, { method: "POST" });
      await load();
      onRefresh();
    } catch (e) { setMsg(niceError(e)); }
  }

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  if (!flags.length) return (
    <Panel title="Verification">
      <p className="muted small">Verification flags from generator v2 appear here inline. Publish is blocked until each is resolved or dismissed.</p>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn ghost small-btn" type="button" disabled={busy} onClick={verify}>{busy ? "Starting…" : "Run verification"}</button>
        <button className="btn ghost small-btn" type="button" onClick={load}>Refresh</button>
      </div>
      {msg && <p className="small muted" style={{ marginTop: 6 }}>{msg}</p>}
    </Panel>
  );

  return (
    <Panel title="Verification" side={`${flags.length} flag${flags.length === 1 ? "" : "s"}`}>
      <p className="muted small">Each item was re-solved without the key. A mismatch is flagged as check this answer. Resolve by editing the answer, or dismiss when the flag is wrong.</p>
      {flags.map((f) => (
        <div key={f.itemId} className="row wrap" style={{ alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border, #eee)" }}>
          <span className="small grow">Item {f.itemId} (lesson {f.lessonId}) : got {String(f.verification.got ?? "?").slice(0, 80)}</span>
          <button className="btn ghost small-btn" type="button" onClick={() => dismiss(f.itemId)}>Dismiss</button>
        </div>
      ))}
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn ghost small-btn" type="button" disabled={busy} onClick={verify}>{busy ? "Starting…" : "Re-verify"}</button>
        <button className="btn ghost small-btn" type="button" onClick={load}>Refresh</button>
      </div>
      {msg && <p className="small muted" style={{ marginTop: 6 }}>{msg}</p>}
    </Panel>
  );
}

// --- Regenerate with instruction (lesson or item) ---

type Draft = { lessonId: number; items: ItemNode[]; instruction: string };

export function RegeneratePanel({ courseId: _courseId, lessonId, itemId, lessonTitle, onAccept, onDismissed }: {
  courseId: number;
  lessonId?: number;
  itemId?: number;
  lessonTitle?: string;
  onAccept: (draft: Draft) => void;
  onDismissed?: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Instruction is free text; server side reuses existing course-lesson regen
  // with the instruction appended to the lesson plan prompt. Editor just
  // tracks a single draft beside the original for accept or discard.
  async function regenerate() {
    const ins = String(instruction).trim().slice(0, 500);
    if (!ins) { setErr("Give an instruction first."); return; }
    setBusy(true);
    setErr("");
    setDraft(null);
    try {
      if (lessonId) {
        const d = await api<{ jobId: number }>(`/api/courses/lessons/${lessonId}/regenerate`, { method: "POST", body: { instruction: ins } });
        // poll job for completion, then fetch draft
        const draftItems = await pollLessonRegen(lessonId, d.jobId);
        setDraft({ lessonId, items: draftItems, instruction: ins });
      } else if (itemId) {
        const d = await api<{ item: ItemNode }>(`/api/courses/items/${itemId}/regenerate`, { method: "POST", body: { instruction: ins } });
        setDraft({ lessonId: lessonId ?? -1, items: [d.item], instruction: ins });
      }
    } catch (e) { setErr(niceError(e)); } finally { setBusy(false); }
  }

  async function pollLessonRegen(lid: number, jobId: number): Promise<ItemNode[]> {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const j = await api<{ job: { status: string; error?: string; result?: { lessonId?: number } } }>(`/api/courses/jobs/${jobId}`);
      if (j.job.status === "done") {
        const d = await api<{ lesson: { items: ItemNode[] } }>(`/api/courses/lessons/${lid}/draft`);
        return d.lesson.items ?? [];
      }
      if (j.job.status === "error") throw new Error(j.job.error ?? "Regenerate failed");
    }
    throw new Error("Regenerate timed out");
  }

  const label = lessonId ? `Regenerate lesson${lessonTitle ? ` "${lessonTitle}"` : ""} with instruction` : "Regenerate this item with instruction";

  return (
    <Panel title={label}>
      {!draft && (
        <>
          <p className="muted small">Try: make it harder, add a manipulative, use the horse lens, shorter.</p>
          <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
            <input className="input" style={{ minWidth: 220, flex: 1 }} value={instruction} maxLength={500} placeholder="make it harder" onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") regenerate(); }} />
            <button className="btn ghost small-btn" type="button" disabled={busy || !instruction.trim()} onClick={regenerate}>{busy ? "Drafting…" : "Regenerate"}</button>
          </div>
          {err && <p className="formerror small" role="alert" style={{ marginTop: 6 }}>{err}</p>}
        </>
      )}
      {draft && (
        <>
          <p className="small muted">Draft for: {draft.instruction}</p>
          <p className="small">Preview {draft.items.length} item{draft.items.length === 1 ? "" : "s"} beside the original. Accept or discard.</p>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <button className="btn primary small-btn" type="button" onClick={() => { onAccept(draft); setDraft(null); }}>Accept</button>
            <button className="btn ghost small-btn" type="button" onClick={() => { setDraft(null); onDismissed?.(); }}>Discard</button>
          </div>
        </>
      )}
    </Panel>
  );
}

// --- Make this lesson interactive ---

export function MakeInteractivePanel({ lessonId, onDone }: { lessonId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);

  async function convert() {
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ jobId: number }>(`/api/courses/lessons/${lessonId}/make-interactive`, { method: "POST" });
      // poll briefly, then refresh
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const j = await api<{ job: { status: string; error?: string } }>(`/api/courses/jobs/${d.jobId}`);
        if (j.job.status === "done") { setMsg("Converted. Lesson now follows the section 6 shape."); onDone(); break; }
        if (j.job.status === "error") { setMsg(niceError({ code: j.job.error } as any) || String(j.job.error)); break; }
      }
    } catch (e) { setMsg(niceError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <button className="btn ghost small-btn" type="button" onClick={() => setShow(true)}>Make this lesson interactive</button>
      {show && (
        <Modal title="Make this lesson interactive" onClose={() => setShow(false)}>
          <p className="muted small">Converts a read-then-quiz lesson into the section 6 shape, keeping your text. A draft is created beside the original; accept or discard it.</p>
          <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
            <button className="btn primary" type="button" disabled={busy} onClick={convert}>{busy ? "Converting…" : "Convert"}</button>
            <button className="btn" type="button" onClick={() => setShow(false)}>Cancel</button>
          </div>
          {msg && <p className="small muted" style={{ marginTop: 8 }}>{msg}</p>}
        </Modal>
      )}
    </>
  );
}
