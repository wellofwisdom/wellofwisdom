// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent courses: list + the AI Course Studio generate dialog with job polling.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import type { CourseSummary, Job, Learner, MeResponse } from "../types";
import { Panel, Modal, Field, EmptyState, StatBar } from "../components/ui";
import { IconSparkle, IconX } from "../components/Icons";

export default function Courses({ me, onNavigate }: { me: MeResponse; onNavigate: (hash: string) => void }) {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = () => api<{ courses: CourseSummary[] }>("/api/courses").then((d) => setCourses(d.courses)).catch((e) => setError(niceError(e)));

  useEffect(() => {
    load();
  }, []);

  const published = courses?.filter((c) => c.status === "published").length ?? 0;
  const drafts = courses?.filter((c) => c.status === "draft").length ?? 0;

  return (
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
          <button className="btn primary" type="button" onClick={() => setGenerating(true)}>
            <IconSparkle /> Generate course
          </button>
        }
      >
        {error && <div className="formerror" role="alert">{error}</div>}
        {!courses ? (
          <div className="skel" style={{ height: 80 }} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon="✨"
            title="Generate your first course"
            message="Describe what your learner needs, add a lens — the interest that makes it fun — and the AI builds a full course with lessons, exercises, and projects. You review every word before they see it."
            action={
              <button className="btn primary big" type="button" onClick={() => setGenerating(true)}>
                <IconSparkle /> Open the Course Studio
              </button>
            }
          />
        ) : (
          courses.map((c) => (
            <div
              key={c.id}
              className="learnerrow"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate(`course/${c.id}`)}
              onKeyDown={(e) => e.key === "Enter" && onNavigate(`course/${c.id}`)}
              tabIndex={0}
              role="link"
              aria-label={`Open course ${c.title}`}
            >
              <span className="avatar" aria-hidden="true">📘</span>
              <div className="meta">
                <div className="n">{c.title}</div>
                <div className="u">
                  {c.unit_count} units · {c.lesson_count} lessons · {c.exercise_count} exercises
                  {c.lens ? ` · through ${c.lens}` : ""}
                  {c.learner_name ? ` · for ${c.learner_name}` : " · whole family"}
                </div>
              </div>
              <span className={`chip${c.status === "published" ? " on" : ""}`}>{c.status === "published" ? "✅ Published" : "📝 Draft"}</span>
            </div>
          ))
        )}
      </Panel>

      {generating && (
        <GenerateDialog
          me={me}
          onClose={() => setGenerating(false)}
          onDone={(courseId) => {
            setGenerating(false);
            onNavigate(`course/${courseId}`);
          }}
        />
      )}
    </>
  );
}

interface Source {
  type: "text" | "url";
  title: string;
  text?: string;
  url?: string;
}

function GenerateDialog({
  me,
  onClose,
  onDone,
}: {
  me: MeResponse;
  onClose: () => void;
  onDone: (courseId: number) => void;
}) {
  const learners: Learner[] = me.learners || [];
  const [topic, setTopic] = useState("");
  const [lens, setLens] = useState("");
  const [learnerId, setLearnerId] = useState<string>("");
  const [gradeLevel, setGradeLevel] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [srcText, setSrcText] = useState("");
  const [srcTitle, setSrcTitle] = useState("");
  const [srcUrl, setSrcUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  function poll(jobId: number) {
    pollRef.current = window.setTimeout(async () => {
      try {
        const d = await api<{ job: Job }>(`/api/courses/jobs/${jobId}`);
        setJob(d.job);
        if (d.job.status === "done" && d.job.result?.courseId) {
          onDone(d.job.result.courseId);
          return;
        }
        if (d.job.status === "error") {
          setError(
            d.job.error?.includes("ai_not_configured")
              ? "No AI provider is configured on this server. An admin needs to add one (see Settings → System)."
              : `Generation failed: ${d.job.error}`
          );
          setBusy(false);
          return;
        }
        poll(jobId);
      } catch {
        poll(jobId); // transient poll error: keep trying
      }
    }, 2500);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ jobId: number }>("/api/courses/generate", {
        method: "POST",
        body: {
          topic,
          lens: lens || null,
          learnerId: learnerId ? Number(learnerId) : null,
          gradeLevel: gradeLevel ? Number(gradeLevel) : null,
          notes: notes || null,
          sources: sources.map((s) => ({ type: s.type, title: s.title, text: s.text, url: s.url })),
        },
      });
      setJob({ id: d.jobId, type: "course", status: "queued", error: null, result: null });
      poll(d.jobId);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("ai_not_configured")
          ? "No AI provider is configured on this server. An admin adds one via the AI_BASE_URL setting — works with free local models too."
          : niceError(err)
      );
      setBusy(false);
    }
  }

  const running = busy && job;

  return (
    <Modal title="Course Studio" onClose={running ? () => {} : onClose}>
      {running ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">🌰</div>
          <h2>Brewing your course…</h2>
          <p className="muted" style={{ margin: "8px 0 16px" }}>
            The AI is writing units, lessons, exercises{sources.length ? ", grounded in your sources" : ""}
            {lens ? `, all through ${lens}` : ""}. This takes a minute or two.
          </p>
          <div className="skel" style={{ height: 12, marginBottom: 8 }} />
          <div className="skel" style={{ height: 12, marginBottom: 8, width: "80%", marginLeft: "10%" }} />
          <div className="skel" style={{ height: 12, width: "60%", marginLeft: "20%" }} />
        </div>
      ) : (
        <>
          {error && <div className="formerror" role="alert">{error}</div>}
          <Field label="What should they learn?">
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="6th-grade fractions" maxLength={300} />
          </Field>
          <Field label="Lens (optional, but magical)" hint="The interest everything gets woven through — this is the superpower.">
            <input className="input" value={lens} onChange={(e) => setLens(e.target.value)}
              placeholder="sewing · Minecraft · basketball · horses" maxLength={100} />
          </Field>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow">
              <Field label="For">
                <select className="input" value={learnerId} onChange={(e) => {
                  setLearnerId(e.target.value);
                  const l = learners.find((x) => String(x.id) === e.target.value);
                  if (l?.grade_level) setGradeLevel(String(l.grade_level));
                }}>
                  <option value="">Whole family</option>
                  {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grow">
              <Field label="Grade level">
                <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
                  <option value="">Auto</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Grade {g}</option>)}
                </select>
              </Field>
            </div>
          </div>
          <Field label="Notes for the AI (optional)">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="She struggles with common denominators; loves period dramas." maxLength={1000} />
          </Field>

          <Field label={`Sources (${sources.length}/5) — the course stays grounded in these`}>
            {sources.length > 0 && (
              <div className="row wrap" style={{ marginBottom: 8 }}>
                {sources.map((s, i) => (
                  <span className="chip" key={i}>
                    {s.type === "url" ? "🔗" : "📄"} {s.title.slice(0, 30)}
                    <button className="iconbtn" style={{ width: 20, height: 20 }} aria-label={`Remove ${s.title}`}
                      type="button" onClick={() => setSources(sources.filter((_, j) => j !== i))}>
                      <IconX width={12} height={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="row" style={{ alignItems: "flex-start" }}>
              <input className="input" placeholder="Title (e.g. Chapter 3 notes)" value={srcTitle}
                onChange={(e) => setSrcTitle(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" type="button" onClick={() => {
                if (!srcText.trim() || sources.length >= 5) return;
                setSources([...sources, { type: "text", title: srcTitle.trim() || "Notes", text: srcText }]);
                setSrcText(""); setSrcTitle("");
              }}>＋ Text</button>
            </div>
            <textarea className="input" rows={3} style={{ marginTop: 8 }} placeholder="…paste notes, a chapter, or facts here first, then click ＋ Text"
              value={srcText} onChange={(e) => setSrcText(e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" placeholder="https://a-web-page-or-article.example" value={srcUrl}
                onChange={(e) => setSrcUrl(e.target.value)} style={{ flex: 1 }} />
              <button className="btn" type="button" onClick={() => {
                if (!/^https?:\/\//.test(srcUrl.trim()) || sources.length >= 5) return;
                setSources([...sources, { type: "url", title: srcTitle.trim() || srcUrl, url: srcUrl.trim() }]);
                setSrcUrl(""); setSrcTitle("");
              }}>＋ Link</button>
            </div>
          </Field>

          <div className="row">
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
            <button className="btn primary" type="button" disabled={busy || topic.trim().length < 3} onClick={submit}>
              <IconSparkle /> {busy ? "Starting…" : "Generate course"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
