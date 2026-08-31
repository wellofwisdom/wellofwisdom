// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent course detail: review the AI's work, edit items, publish for learners.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import type { CourseTree, ItemNode, Learner, MeResponse } from "../types";
import { Panel, Modal, Field } from "../components/ui";
import { MathText } from "../lib/rich";
import { IconPencil, IconTrash, IconCheck } from "../components/Icons";

const TYPE_ICON: Record<string, string> = { article: "📖", exercise: "✏️", video: "▶️", project: "🛠️" };

export default function CourseDetail({ me, courseId, onNavigate }: { me: MeResponse; courseId: number; onNavigate: (hash: string) => void }) {
  const [course, setCourse] = useState<CourseTree | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ItemNode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () =>
    api<{ course: CourseTree }>(`/api/courses/${courseId}`)
      .then((d) => setCourse(d.course))
      .catch((e) => setError(niceError(e)));

  useEffect(() => {
    load();
  }, [courseId]);

  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/courses/${courseId}`, { method: "PATCH", body });
      load();
    } catch (e) {
      setError(niceError(e));
    }
  }

  async function patchLesson(lessonId: number, body: Record<string, unknown>) {
    try {
      await api(`/api/courses/lessons/${lessonId}`, { method: "PATCH", body });
      load();
    } catch (e) {
      setError(niceError(e));
    }
  }

  async function deleteItem(itemId: number) {
    try {
      await api(`/api/courses/items/${itemId}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(niceError(e));
    }
  }

  if (error && !course) {
    return <Panel title="Course"><div className="formerror">{error}</div></Panel>;
  }
  if (!course) {
    return <div className="skel" style={{ height: 200 }} />;
  }

  const learners: Learner[] = me.learners || [];

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <button className="btn ghost" type="button" onClick={() => onNavigate("courses")}>← Courses</button>
        <span className={`chip${course.status === "published" ? " on" : ""}`}>
          {course.status === "published" ? "✅ Published" : "📝 Draft"}
        </span>
        {course.lens && <span className="chip">🧵 through {course.lens}</span>}
        {course.grade_level && <span className="chip">grade {course.grade_level}</span>}
        <div className="grow" />
        {course.status === "published" ? (
          <button className="btn" type="button" onClick={() => patch({ status: "draft" })}>Unpublish</button>
        ) : (
          <button className="btn primary" type="button" onClick={() => patch({ status: "published" })}>
            <IconCheck /> Publish to learners
          </button>
        )}
        <button className="btn" type="button" title="Download this course as a shareable .json file"
          onClick={async () => {
            try {
              const d = await api<Record<string, unknown>>(`/api/courses/${courseId}/export`);
              const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${course.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wow-course.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              setError(niceError(e));
            }
          }}>⬇ Export</button>
        <button className="btn danger ghost" aria-label="Delete course" type="button" onClick={() => setConfirmDelete(true)}>
          <IconTrash />
        </button>
      </div>

      <Panel title={course.title} side="review everything before publishing">
        {course.description && <p className="muted" style={{ marginBottom: 6 }}>{course.description}</p>}
        <div className="row wrap">
          <Field label="Assigned to">
            <select
              className="input"
              value={course.learner_id ?? ""}
              onChange={(e) => patch({ learnerId: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">Everyone</option>
              {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
      </Panel>

      {course.units.map((u, ui) => (
        <Panel key={u.id} title={`Unit ${ui + 1}: ${u.title}`}>
          {u.lessons.map((l, li) => (
            <details key={l.id} style={{ marginBottom: 10 }} open={ui === 0 && li === 0}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>
                Lesson {ui + 1}.{li + 1}: {l.title}
              </summary>
              <div className="row" style={{ margin: "6px 0" }}>
                <button className="btn ghost small-btn" type="button" onClick={() => {
                  const title = window.prompt("Lesson title", l.title);
                  if (title && title.trim()) patchLesson(l.id, { title: title.trim() });
                }}>✏️ Rename lesson</button>
                <button className="btn ghost small-btn" type="button"
                  onClick={() => window.open(`#/print/lesson/${l.id}`, "_blank")}>🖨️ Worksheet</button>
              </div>
              {l.summary && <p className="muted small" style={{ margin: "4px 0 10px" }}>{l.summary}</p>}
              {l.items.map((item) => (
                <ItemPreview key={item.id} item={item} onEdit={() => setEditing(item)}
                  onDelete={() => {
                    if (window.confirm("Remove this item from the lesson?")) deleteItem(item.id);
                  }} />
              ))}
            </details>
          ))}
        </Panel>
      ))}

      {editing && (
        <EditItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete this course?" onClose={() => setConfirmDelete(false)}>
          <p className="muted" style={{ marginBottom: 16 }}>The course, its lessons, and all learner progress on it are removed. This cannot be undone.</p>
          <div className="row">
            <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn danger" type="button" onClick={async () => {
              await api(`/api/courses/${courseId}`, { method: "DELETE" }).catch(() => {});
              onNavigate("courses");
            }}>Delete course</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ItemPreview({ item, onEdit, onDelete }: { item: ItemNode; onEdit: () => void; onDelete: () => void }) {
  const c = item.content || {};
  return (
    <div className="lessonitem">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <span aria-hidden="true">{TYPE_ICON[item.type]}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          {item.type === "article" && (
            <>
              <strong>{c.title}</strong>
              <div className="small muted" style={{ marginTop: 4 }}>
                {String(c.body || "").slice(0, 160)}
                {String(c.body || "").length > 160 ? "…" : ""}
              </div>
            </>
          )}
          {item.type === "exercise" && (
            <>
              <MathText text={c.prompt} />
              <div className="small muted" style={{ marginTop: 2 }}>
                {c.kind === "mcq" ? `multiple choice · answer: ${answerText(c)}` : c.kind === "numeric" ? `number · answer: ${c.answer}` : "written · self-check"}
              </div>
            </>
          )}
          {item.type === "video" && (
            <>
              <strong>{c.title}</strong>
              <div className="small muted">youtube: {c.youtubeId}{c.questions?.length ? ` · ${c.questions.length} questions` : ""}</div>
            </>
          )}
          {item.type === "project" && (
            <>
              <strong>🛠️ {c.title}</strong>
              <div className="small muted">{String(c.description || "").slice(0, 120)}…</div>
            </>
          )}
        </div>
        <button className="iconbtn" aria-label="Edit item" type="button" onClick={onEdit}><IconPencil /></button>
        <button className="iconbtn" aria-label="Remove item" type="button" onClick={onDelete}><IconTrash /></button>
      </div>
    </div>
  );
}

function answerText(c: Record<string, any>): string {
  const ch = (c.choices || []).find((x: any) => x.id === c.answer);
  return ch ? ch.text : "?";
}

function EditItemDialog({ item, onClose, onSaved }: { item: ItemNode; onClose: () => void; onSaved: () => void }) {
  const c = item.content || {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // article
  const [aTitle, setATitle] = useState(c.title ?? "");
  const [aBody, setABody] = useState(c.body ?? "");
  // exercise
  const [prompt, setPrompt] = useState(c.prompt ?? "");
  const [kind, setKind] = useState(c.kind ?? "mcq");
  const [choices, setChoices] = useState<string>((c.choices ?? []).map((x: any) => x.text).join("\n"));
  const [answerIdx, setAnswerIdx] = useState<string>("0");
  const [numericAnswer, setNumericAnswer] = useState(c.answer != null && c.kind === "numeric" ? String(c.answer) : "");
  const [textAnswer, setTextAnswer] = useState(c.kind === "text" ? String(c.answer ?? "") : "");
  const [explanation, setExplanation] = useState(c.explanation ?? "");
  const [hint, setHint] = useState(c.hint ?? "");
  // video
  const [vTitle, setVTitle] = useState(c.title ?? "");
  const [vId, setVId] = useState(c.youtubeId ?? "");
  // project
  const [pTitle, setPTitle] = useState(c.title ?? "");
  const [pDesc, setPDesc] = useState(c.description ?? "");
  const [rubric, setRubric] = useState(c.rubric ?? "");

  const origAnswerId: string = c.answer ?? "c1";
  useEffect(() => {
    if (c.kind === "mcq" && Array.isArray(c.choices)) {
      const i = c.choices.findIndex((x: any) => x.id === origAnswerId);
      setAnswerIdx(String(Math.max(0, i)));
    }
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    let content: Record<string, unknown>;
    if (item.type === "article") content = { title: aTitle, body: aBody };
    else if (item.type === "exercise") {
      content = { prompt, kind };
      if (kind === "mcq") {
        const lines = choices.split("\n").map((s) => s.trim()).filter(Boolean);
        if (lines.length < 2) { setError("Need at least 2 choices."); setBusy(false); return; }
        const idx = Math.min(Number(answerIdx) || 0, lines.length - 1);
        content.choices = lines.map((text, i) => ({ id: `c${i + 1}`, text }));
        content.answer = `c${idx + 1}`;
      } else if (kind === "numeric") {
        const n = Number(numericAnswer.replace(/[^0-9.\-]/g, ""));
        if (!Number.isFinite(n)) { setError("Numeric answer must be a number."); setBusy(false); return; }
        content.answer = n;
      } else {
        content.answer = textAnswer;
      }
      if (explanation) content.explanation = explanation;
      if (hint) content.hint = hint;
    } else if (item.type === "video") content = { ...c, title: vTitle, youtubeId: vId };
    else content = { title: pTitle, description: pDesc, ...(rubric ? { rubric } : {}) };

    try {
      await api(`/api/courses/items/${item.id}`, { method: "PATCH", body: { content } });
      onSaved();
    } catch (e) {
      setError(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${item.type}`} onClose={onClose}>
      {error && <div className="formerror" role="alert">{error}</div>}
      {item.type === "article" && (
        <>
          <Field label="Title"><input className="input" value={aTitle} onChange={(e) => setATitle(e.target.value)} /></Field>
          <Field label="Body" hint="Blank line = new paragraph. **bold**, - bullets, $math$ supported.">
            <textarea className="input" rows={12} value={aBody} onChange={(e) => setABody(e.target.value)} />
          </Field>
        </>
      )}
      {item.type === "exercise" && (
        <>
          <Field label="Prompt"><textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field>
          <Field label="Kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="mcq">Multiple choice</option>
              <option value="numeric">Number</option>
              <option value="text">Written (self-check)</option>
            </select>
          </Field>
          {kind === "mcq" && (
            <>
              <Field label="Choices (one per line)">
                <textarea className="input" rows={4} value={choices} onChange={(e) => setChoices(e.target.value)} />
              </Field>
              <Field label="Correct answer">
                <select className="input" value={answerIdx} onChange={(e) => setAnswerIdx(e.target.value)}>
                  {choices.split("\n").map((s) => s.trim()).filter(Boolean).map((s, i) => (
                    <option key={i} value={String(i)}>#{i + 1}: {s.slice(0, 60)}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {kind === "numeric" && <Field label="Answer (number)"><input className="input" value={numericAnswer} onChange={(e) => setNumericAnswer(e.target.value)} /></Field>}
          {kind === "text" && <Field label="Model answer"><textarea className="input" rows={3} value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)} /></Field>}
          <Field label="Explanation (shown after answering)"><textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>
          <Field label="Hint (a nudge, not the answer)"><input className="input" value={hint} onChange={(e) => setHint(e.target.value)} /></Field>
        </>
      )}
      {item.type === "video" && (
        <>
          <Field label="Title"><input className="input" value={vTitle} onChange={(e) => setVTitle(e.target.value)} /></Field>
          <Field label="YouTube id or URL"><input className="input" value={vId} onChange={(e) => setVId(e.target.value)} /></Field>
        </>
      )}
      {item.type === "project" && (
        <>
          <Field label="Title"><input className="input" value={pTitle} onChange={(e) => setPTitle(e.target.value)} /></Field>
          <Field label="Description"><textarea className="input" rows={4} value={pDesc} onChange={(e) => setPDesc(e.target.value)} /></Field>
          <Field label="Rubric"><textarea className="input" rows={3} value={rubric} onChange={(e) => setRubric(e.target.value)} /></Field>
        </>
      )}
      <div className="row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}
