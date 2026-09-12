// SPDX-License-Identifier: AGPL-3.0-or-later
// Courses list. Generation lives in the Course Studio; worksheet import and
// course import/export live here.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import type { CourseSummary, Job } from "../types";
import { Panel, EmptyState, PillTabs, StatBar, Modal, Field } from "../components/ui";
import { IconSparkle } from "../components/Icons";
import { linkProps } from "../router";

export default function Courses({ onNavigate }: { onNavigate: (hash: string) => void }) {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState("");
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "community">("mine");

  const load = () =>
    api<{ courses: CourseSummary[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(niceError(e)));

  useEffect(() => {
    load();
  }, []);

  const published = courses?.filter((c) => c.status === "published").length ?? 0;
  const drafts = courses?.filter((c) => c.status === "draft").length ?? 0;

  return (
    <>
      <PillTabs
        ariaLabel="Course library"
        tabs={[{ id: "mine", label: "Your courses" }, { id: "community", label: "Community library" }]}
        value={tab}
        onChange={(v) => setTab(v as "mine" | "community")}
      />
      {tab === "community" ? (
        <CommunityLibrary onDone={(cid) => { load(); onNavigate(`course/${cid}`); }} />
      ) : (
        <>
      <StatBar
        stats={[
          { label: "Courses", value: courses?.length ?? "…" },
          { label: "Published", value: published, active: published > 0 },
          { label: "Drafts", value: drafts },
          { label: "Exercises", value: courses?.reduce((n, c) => n + c.exercise_count, 0) ?? "…" },
        ]}
      />
      <Panel
        title="Your courses"
        side={
          <span className="row">
            <button className="btn" type="button" onClick={() => setWorksheetOpen(true)}>📥 Import worksheet</button>
            <button className="btn" type="button" onClick={() => setImportOpen(true)}>⬆ Import course</button>
            <button className="btn primary" type="button" onClick={() => onNavigate("studio")}>
              <IconSparkle /> Course Studio
            </button>
          </span>
        }
      >
        {error && <div className="formerror" role="alert">{error}</div>}
        {!courses ? (
          <div className="skel" style={{ height: 80 }} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon="✨"
            title="No courses yet"
            message="The Course Studio builds a complete course around any topic: lessons, exercises, projects, all woven through what your learners love. You can also import a paper worksheet, or a course file from another family."
            action={
              <span className="row">
                <button className="btn big" type="button" onClick={() => setWorksheetOpen(true)}>📥 Import a worksheet</button>
                <button className="btn primary big" type="button" onClick={() => onNavigate("studio")}>
                  <IconSparkle /> Open the Course Studio
                </button>
              </span>
            }
          />
        ) : (
          courses.map((c) => (
            <div
              key={c.id}
              className="learnerrow coursecard"
              style={{ cursor: "pointer" }}
              // Mouse convenience; the real, accessible link is the title.
              onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) return; onNavigate(`course/${c.id}`); }}
            >
              <span className="avatar" aria-hidden="true">{c.lens ? "🧵" : "📘"}</span>
              <div className="meta">
                <div className="n"><a {...linkProps(`course/${c.id}`)} className="cardlink">{c.title}</a></div>
                <div className="u">
                  {c.unit_count} units · {c.lesson_count} lessons · {c.exercise_count} exercises
                  {c.lens ? ` · through ${c.lens}` : ""}
                  {c.learner_name ? ` · for ${c.learner_name}` : " · for everyone"}
                </div>
              </div>
              <span className={`chip${c.status === "published" ? " on" : ""}`}>
                {c.status === "published" ? "✅ Published" : "📝 Draft"}
              </span>
            </div>
          ))
        )}
      </Panel>

      {worksheetOpen && (
        <WorksheetDialog onClose={() => setWorksheetOpen(false)} onDone={(cid) => { setWorksheetOpen(false); load(); onNavigate(`course/${cid}`); }} />
      )}
      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} onDone={(cid) => { setImportOpen(false); load(); onNavigate(`course/${cid}`); }} />
      )}
        </>
      )}
    </>
  );
}

type CommunityCourse = {
  slug: string; title: string; description: string;
  topic: string | null; lens: string | null; gradeLevel: number | null;
  license: string; units: number; lessons: number;
  rawUrl: string | null; local?: boolean;
};

function CommunityLibrary({ onDone }: { onDone: (courseId: number) => void }) {
  const [courses, setCourses] = useState<CommunityCourse[] | null>(null);
  const [error, setError] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ courses: CommunityCourse[] }>("/api/community")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(niceError(e)));
  }, []);

  async function add(c: CommunityCourse) {
    setBusySlug(c.slug); setMsg(""); setError("");
    try {
      const d = await api<{ courseId: number }>("/api/community/import", {
        method: "POST", body: { slug: c.slug, rawUrl: c.rawUrl || undefined },
      });
      setMsg(`Added ${c.title}. Opening it now.`);
      onDone(d.courseId);
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusySlug(null);
    }
  }

  if (!courses) return <div className="skel" style={{ height: 80 }} />;
  if (error && !courses.length) return <div className="formerror" role="alert">{error}</div>;

  return (
    <>
      <p className="muted small" style={{ marginBottom: 10 }}>
        CC-BY courses from the <a href="https://github.com/wellofwisdom/community-courses" target="_blank" rel="noopener noreferrer">community library</a>.
        Tap Add and it lands in Your courses as a draft to review before learners see it.
      </p>
      {error && <div className="formerror" role="alert">{error}</div>}
      {msg && <div className="hint" role="status" style={{ marginBottom: 8 }}>{msg}</div>}
      {courses.length === 0 ? (
        <p className="muted">No community courses yet. Check back soon, or publish one of your own.</p>
      ) : (
        courses.map((c) => (
          <div key={c.slug} className="learnerrow coursecard">
            <span className="avatar" aria-hidden="true">{c.lens ? "🧵" : "📘"}</span>
            <div className="meta" style={{ minWidth: 0 }}>
              <div className="n">{c.title}</div>
              <div className="u">
                {c.units} units · {c.lessons} lessons
                {c.lens ? ` · through ${c.lens}` : ""}
                {c.gradeLevel != null ? ` · grade ${c.gradeLevel}` : ""}
                {c.license ? ` · ${c.license}` : ""}
              </div>
              {c.description && <div className="muted small" style={{ marginTop: 2, lineHeight: 1.4 }}>{c.description}</div>}
            </div>
            <button className="btn primary" type="button" disabled={busySlug === c.slug} onClick={() => add(c)}>
              {busySlug === c.slug ? "Adding…" : "Add to my library"}
            </button>
          </div>
        ))
      )}
    </>
  );
}

function WorksheetDialog({ onClose, onDone }: { onClose: () => void; onDone: (courseId: number) => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [photoName, setPhotoName] = useState("");
  const [err, setErr] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ jobId: number }>("/api/courses/worksheet-import", {
        method: "POST",
        body: { title: title || "Imported worksheet", text },
      });
      pollRef.current = window.setInterval(async () => {
        try {
          const j = await api<{ job: Job }>(`/api/courses/jobs/${d.jobId}`);
          if (j.job.status === "done" && j.job.result) {
            window.clearInterval(pollRef.current!);
            onDone((j.job.result as unknown as { courseId: number }).courseId);
          } else if (j.job.status === "error") {
            window.clearInterval(pollRef.current!);
            setErr(
              j.job.error?.includes("ai_not_configured")
                ? "No AI provider configured on this server."
                : `Import failed: ${j.job.error}`
            );
            setBusy(false);
          }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e) {
      setErr(e instanceof Error && e.message.includes("ai_not_configured") ? "No AI provider configured on this server." : niceError(e));
      setBusy(false);
    }
  }

  // Photo path: upload the image, OCR it to text, fill the textarea so the
  // guide can correct it before it becomes exercises.
  async function onPhoto(file: File) {
    setErr("");
    setPhotoName(file.name);
    setOcrBusy(true);
    try {
      const up = await new Promise<{ id: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/uploads");
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upload-name", encodeURIComponent(file.name).slice(0, 260));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).upload); } catch { reject(new Error("Bad upload response")); }
          } else {
            let msg = `Upload failed (${xhr.status})`;
            if (xhr.status === 415) msg = "That image type isn't supported.";
            if (xhr.status === 413) msg = "That file is too large.";
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check the connection."));
        xhr.send(file);
      });
      const r = await api<{ text: string }>("/api/courses/worksheet-ocr", {
        method: "POST",
        body: { uploadId: up.id },
      });
      setText(r.text);
      if (!title && file.name) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <Modal title="Import a worksheet" onClose={busy ? () => {} : onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      {busy ? (
        <div style={{ textAlign: "center", padding: "18px 0" }}>
          <div className="brewnut" aria-hidden="true">📥</div>
          <p className="muted" style={{ marginTop: 8 }}>Reading the worksheet and writing graded exercises…</p>
        </div>
      ) : (
        <>
          <Field label="Worksheet title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fractions practice: page 42" />
          </Field>
          <Field label="Photo of the worksheet" hint="A photo works too: snap the page with your phone and correct the extracted text before it becomes exercises. Needs AI_VISION_MODEL on the server.">
            <label className="btn" style={{ cursor: ocrBusy ? "default" : "pointer", opacity: ocrBusy ? 0.6 : 1 }}>
              {ocrBusy ? "Reading photo…" : photoName ? `📷 ${photoName}` : "📷 Choose photo…"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }}
                disabled={ocrBusy}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onPhoto(f); e.target.value = ""; }} />
            </label>
            {ocrBusy && <span className="muted small" style={{ marginLeft: 8 }}>Extracting text…</span>}
          </Field>
          <Field label="Worksheet text" hint="Questions in order. The AI turns each question into a graded exercise with an explanation and a hint. Correct the photo's text here if it misread a number.">
            <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here, or use a photo above…" />
          </Field>
          <div className="row">
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="button" disabled={text.trim().length < 30 || ocrBusy} onClick={submit}>✨ Turn into exercises</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (courseId: number) => void }) {
  const [json, setJson] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Pull straight from another instance's public course page. This is the
  // whole sharing story: a URL between two servers, no registry in between.
  async function submitUrl() {
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ courseId: number }>("/api/courses/import-url", {
        method: "POST", body: { url: url.trim() },
      });
      onDone(d.courseId);
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const parsed = JSON.parse(json);
      const d = await api<{ courseId: number }>("/api/courses/import", { method: "POST", body: parsed });
      onDone(d.courseId);
    } catch (e) {
      setErr(e instanceof SyntaxError ? "That's not valid JSON. Paste the whole exported file." : niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Import a course" onClose={onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      <Field label="Paste a shared course link"
        hint="A /c/… page from any Well of Wisdom instance, or a .wow-course.json file (a GitHub file link works too). The course is fetched and copied into your own library.">
        <div className="row">
          <input className="input grow" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.org/c/fractions-through-sewing" />
          <button className="btn primary" type="button" disabled={busy || !url.trim()} onClick={submitUrl}>
            {busy ? "Fetching…" : "Import"}
          </button>
        </div>
      </Field>
      <p className="muted small" style={{ textAlign: "center", margin: "10px 0" }}>or</p>
      <Field label="Paste an exported course file (.json)" hint="Exported from any Well of Wisdom instance. Share courses between families, classes, or servers.">
        <textarea className="input" rows={6} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "format": "wellofwisdom-course", …' />
      </Field>
      <div className="row">
        <label className="btn" style={{ cursor: "pointer" }}>
          📂 Choose file…
          <input type="file" accept=".json,application/json" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files && e.target.files[0];
              if (f) setJson(await f.text());
            }} />
        </label>
        <div className="grow" />
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !json.trim()} onClick={submit}>{busy ? "Importing…" : "Import"}</button>
      </div>
    </Modal>
  );
}
