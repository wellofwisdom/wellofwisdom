// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent course detail: review the AI's work, edit items, publish for learners.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import type { CourseTree, ItemNode, Learner, MeResponse } from "../types";
import { Panel, Modal, Field } from "../components/ui";
import { MathText } from "../lib/rich";
import { IconPencil, IconTrash, IconCheck } from "../components/Icons";
import { AdventureDialog, AdventuresPanel, CoverButton } from "../components/AdventureUI";
import { VideoUploader, VideoLibrary, VideoPlayer, loadVideos, humanBytes } from "../components/VideoUI";
import type { UploadRow } from "../components/VideoUI";

const TYPE_ICON: Record<string, string> = { article: "📖", exercise: "✏️", video: "▶️", project: "🛠️" };


const LICENSES = [
  { id: "CC-BY-4.0", label: "CC BY 4.0: reuse with credit" },
  { id: "CC-BY-SA-4.0", label: "CC BY-SA 4.0: credit, share alike" },
  { id: "CC0-1.0", label: "CC0: public domain" },
  { id: "all-rights-reserved", label: "All rights reserved" },
];

function SharePanel({ courseId, initialSlug, initialPublished }:
  { courseId: number; initialSlug: string | null; initialPublished: boolean }) {
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [published, setPublished] = useState(initialPublished);
  const [license, setLicense] = useState("CC-BY-4.0");
  const [author, setAuthor] = useState("");
  const [shareAnswers, setShareAnswers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const url = slug ? `${window.location.origin}/c/${slug}` : "";

  async function publish() {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ public_slug: string }>(`/api/courses/${courseId}/publish`, {
        method: "POST", body: { license, author: author || null, shareAnswers },
      });
      setSlug(r.public_slug); setPublished(true);
      setMsg("✅ Published. Anyone with the link can read it and download the course file.");
    } catch (e) { setMsg(niceError(e)); } finally { setBusy(false); }
  }

  async function unpublish() {
    setBusy(true); setMsg("");
    try {
      await api(`/api/courses/${courseId}/unpublish`, { method: "POST" });
      setPublished(false);
      setMsg("Unpublished. The public page is gone; the link is kept in case you republish.");
    } catch (e) { setMsg(niceError(e)); } finally { setBusy(false); }
  }

  return (
    <Panel title="Share this course" side={published ? "public" : "private"}>
      {!published && (
        <>
          <p className="muted small">
            Publishing puts this course on a public, read-only page on this server. Answer keys are
            never shown there. Anyone can download the course file and teach with it, including
            people running their own Well of Wisdom.
          </p>
          <div className="field">
            <label htmlFor="share-license">License</label>
            <select id="share-license" className="input" value={license} onChange={(e) => setLicense(e.target.value)}>
              {LICENSES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="share-author">Credit as (optional)</label>
            <input id="share-author" className="input" value={author} maxLength={120}
              onChange={(e) => setAuthor(e.target.value)} placeholder="Your name, or your co-op" />
          </div>
          <label className="checkitem" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={shareAnswers} onChange={(e) => setShareAnswers(e.target.checked)} />
            <span className="t">
              Include answer keys in the downloadable file
              <span className="hint"> Other teachers need these to grade. The public page never shows them either way.</span>
            </span>
          </label>
          <button className="btn primary" type="button" disabled={busy} onClick={publish}>
            🌍 Publish this course
          </button>
        </>
      )}
      {published && slug && (
        <>
          <p className="small">Live at <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
          <div className="row wrap">
            <button className="btn" type="button" onClick={() => { navigator.clipboard?.writeText(url); setMsg("Link copied."); }}>
              Copy link
            </button>
            <a className="btn ghost" href={`/api/public/courses/${slug}/export`} download>Download course file</a>
            <button className="btn ghost" type="button" disabled={busy} onClick={unpublish}>Unpublish</button>
          </div>
        </>
      )}
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    </Panel>
  );
}


function VideoPanel({ courseId, trailerUploadId, onChanged }:
  { courseId: number; trailerUploadId: number | null; onChanged: () => void }) {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [usage, setUsage] = useState<{ bytes: number; files: number } | null>(null);
  const [lessons, setLessons] = useState<{ id: number; label: string }[]>([]);
  const [msg, setMsg] = useState("");

  const reload = () => loadVideos().then((d) => { setUploads(d.uploads); setUsage(d.usage); }).catch(() => {});
  useEffect(() => { reload(); }, []);

  async function setTrailer(u: UploadRow | null) {
    setMsg("");
    try {
      await api(`/api/courses/${courseId}`, { method: "PATCH", body: { trailerUploadId: u ? u.id : null } });
      // A trailer on a shared course has to be readable without a session.
      if (u && !u.is_public) await api(`/api/uploads/${u.id}`, { method: "PATCH", body: { isPublic: true } });
      setMsg(u ? "✅ Set as the course trailer." : "Trailer removed.");
      reload();
      onChanged();
    } catch (e) { setMsg(niceError(e)); }
  }

  async function addToLesson(u: UploadRow, lessonId: number) {
    setMsg("");
    try {
      await api(`/api/courses/lessons/${lessonId}/items`, {
        method: "POST",
        body: { type: "video", content: { uploadId: u.id, title: u.title || "Video" } },
      });
      setMsg("✅ Added to the lesson.");
      onChanged();
    } catch (e) { setMsg(niceError(e)); }
  }

  async function remove(u: UploadRow) {
    if (!window.confirm(`Delete "${u.title || u.original_name}"? Any lesson using it will lose the video.`)) return;
    try {
      await api(`/api/uploads/${u.id}`, { method: "DELETE" });
      reload();
      onChanged();
    } catch (e) { setMsg(niceError(e)); }
  }

  const trailer = uploads.find((u) => u.id === trailerUploadId) || null;

  return (
    <Panel title="Videos" side={usage ? `${usage.files} files · ${humanBytes(usage.bytes)}` : undefined}>
      <VideoUploader onUploaded={() => reload()} />

      {trailer && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 6px" }}>Course trailer</h4>
          <VideoPlayer content={{ uploadId: trailer.id, title: trailer.title || "Trailer" }} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn ghost small-btn" type="button" onClick={() => setTrailer(null)}>Remove trailer</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <VideoLibrary
          uploads={uploads}
          pickLabel="Set as trailer"
          onPick={setTrailer}
          onDelete={remove}
        />
      </div>

      {uploads.length > 0 && lessons.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: "0 0 6px" }}>Add a video to a lesson</h4>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="input" id="vid-pick" style={{ maxWidth: 220 }}>
              {uploads.map((u) => <option key={u.id} value={u.id}>{u.title || u.original_name}</option>)}
            </select>
            <select className="input" id="vid-lesson" style={{ maxWidth: 260 }}>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <button className="btn" type="button" onClick={() => {
              const uid = Number((document.getElementById("vid-pick") as HTMLSelectElement).value);
              const lid = Number((document.getElementById("vid-lesson") as HTMLSelectElement).value);
              const u = uploads.find((x) => x.id === uid);
              if (u) addToLesson(u, lid);
            }}>Add</button>
          </div>
        </div>
      )}

      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
      <LessonOptions courseId={courseId} onLessons={setLessons} />
    </Panel>
  );
}

/** Pulls the course's lesson list for the "add to lesson" picker. */
function LessonOptions({ courseId, onLessons }:
  { courseId: number; onLessons: (l: { id: number; label: string }[]) => void }) {
  useEffect(() => {
    api<{ course: CourseTree }>(`/api/courses/${courseId}`)
      .then((d) => {
        const out: { id: number; label: string }[] = [];
        d.course.units.forEach((u, ui) =>
          u.lessons.forEach((l, li) => out.push({ id: l.id, label: `${ui + 1}.${li + 1} ${l.title}` })));
        onLessons(out);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);
  return null;
}

export default function CourseDetail({ me, courseId, onNavigate }: { me: MeResponse; courseId: number; onNavigate: (hash: string) => void }) {
  const [course, setCourse] = useState<CourseTree | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ItemNode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

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
        <CoverButton courseId={courseId} onDone={load} onError={setError} />
        <button className="btn primary" type="button" onClick={() => setAdvOpen(true)}>⚔️ Adventure</button>
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
                  onClick={() => window.open(`/print/lesson/${l.id}`, "_blank")}>🖨️ Worksheet</button>
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

      <VideoPanel
        courseId={courseId}
        trailerUploadId={course.trailer_upload_id ?? null}
        onChanged={load}
      />

      <SharePanel
        courseId={courseId}
        initialSlug={course.public_slug || null}
        initialPublished={Boolean(course.published_at)}
      />

      <AdventuresPanel courseId={courseId} onChanged={load} />

      {advOpen && (
        <AdventureDialog courseId={courseId} me={me} onClose={() => setAdvOpen(false)} onCreated={() => setAdvOpen(false)} />
      )}
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
