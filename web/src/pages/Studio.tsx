// SPDX-License-Identifier: AGPL-3.0-or-later
// The Course Studio — its own page, so the magic has room to breathe.
// Four clear steps in separate panels, then generate.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import type { Job, Learner, MeResponse } from "../types";
import RichTextEditor from "../lib/RichTextEditor";

const LENS_IDEAS = [
  "sewing", "Minecraft", "skateboarding", "baking", "horses", "space",
  "dinosaurs", "basketball", "fashion design", "video games", "cooking", "cars",
];

export default function Studio({ me, onNavigate }: { me: MeResponse; onNavigate: (hash: string) => void }) {
  const learners: Learner[] = me.learners || [];

  // Step 1 — who
  const [learnerId, setLearnerId] = useState<number | null>(null); // null = everyone
  const [learnerNotes, setLearnerNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState("");
  // Step 2 — what
  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  // Step 3 — lens
  const [lens, setLens] = useState("");
  // Step 4 — grounding
  const [notes, setNotes] = useState("");
  const [srcTitle, setSrcTitle] = useState("");
  const [srcUrl, setSrcUrl] = useState("");
  const [sources, setSources] = useState<{ type: "text" | "url"; title: string; text?: string; url?: string }[]>([]);
  // generate
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  const selected = learners.find((l) => l.id === learnerId) || null;

  useEffect(() => {
    setLearnerNotes(selected?.ai_notes || "");
    setNotesSaved(selected?.ai_notes || "");
    if (selected?.grade_level) setGradeLevel(String(selected.grade_level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId]);

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  async function saveLearnerNotes() {
    if (!selected) return;
    try {
      await api(`/api/family/learners/${selected.id}`, { method: "PATCH", body: { aiNotes: learnerNotes } });
      setNotesSaved(learnerNotes);
    } catch (e) {
      setError(niceError(e));
    }
  }

  function addTextSource() {
    if (!notes.trim() || sources.length >= 5) return;
    setSources([...sources, { type: "text", title: srcTitle.trim() || "Notes", text: notes }]);
    setNotes("");
    setSrcTitle("");
  }

  async function generate() {
    setBusy(true);
    setError("");
    // persist remembered notes before generating
    if (selected && learnerNotes !== notesSaved) await saveLearnerNotes();
    try {
      const d = await api<{ jobId: number }>("/api/courses/generate", {
        method: "POST",
        body: {
          topic,
          lens: lens || null,
          learnerId: learnerId ?? null,
          gradeLevel: gradeLevel ? Number(gradeLevel) : null,
          notes: null,
          sources: sources.map((s) => ({ type: s.type, title: s.title, text: s.text, url: s.url })),
        },
      });
      setJob({ id: d.jobId, type: "course", status: "queued", error: null, result: null });
      poll(d.jobId);
    } catch (e) {
      setError(niceError(e));
      setBusy(false);
    }
  }

  function poll(jobId: number) {
    pollRef.current = window.setTimeout(async () => {
      try {
        const d = await api<{ job: Job }>(`/api/courses/jobs/${jobId}`);
        setJob(d.job);
        if (d.job.status === "done" && d.job.result?.courseId) {
          onNavigate(`course/${d.job.result.courseId}`);
          return;
        }
        if (d.job.status === "error") {
          setError(
            d.job.error?.includes("ai_not_configured")
              ? "No AI provider is configured on this server (an admin sets AI_BASE_URL)."
              : `Generation failed: ${d.job.error}`
          );
          setBusy(false);
          return;
        }
        poll(jobId);
      } catch {
        poll(jobId);
      }
    }, 2500);
  }

  if (busy && job) {
    return (
      <div className="studiobrew">
        <div className="brewnut" aria-hidden="true">🌰</div>
        <h1>Brewing your course</h1>
        <p className="muted">
          {topic}{lens ? ` · through ${lens}` : ""} — drafting units, writing lessons, building exercises.
          This usually takes a minute or two.
        </p>
        <div className="skel" style={{ height: 12, width: "70%", margin: "18px auto" }} />
        <div className="skel" style={{ height: 12, width: "50%", margin: "0 auto 10px" }} />
        <div className="skel" style={{ height: 12, width: "60%", margin: "0 auto" }} />
      </div>
    );
  }

  const canGenerate = topic.trim().length >= 3;

  return (
    <>
      <div className="studiohead">
        <h1>✨ Course Studio</h1>
        <p className="muted">Four quick steps. The AI drafts; you review every word before anyone sees it.</p>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      {/* STEP 1 — who */}
      <section className="panel step">
        <div className="stepnum" aria-hidden="true">1</div>
        <div className="grow">
          <h2>Who is this course for?</h2>
          <div className="whocardrow">
            <button type="button" className={`whocard${learnerId === null ? " on" : ""}`} onClick={() => setLearnerId(null)}>
              <span className="wc-ava" aria-hidden="true">👨‍👩‍👧‍👦</span>
              <span className="wc-name">Everyone</span>
              <span className="wc-sub">All learners in your group</span>
            </button>
            {learners.map((l) => (
              <button key={l.id} type="button" className={`whocard${learnerId === l.id ? " on" : ""}`} onClick={() => setLearnerId(l.id)}>
                <span className="wc-ava" aria-hidden="true">{(l.name.slice(0, 1) || "?").toUpperCase()}</span>
                <span className="wc-name">{l.name}</span>
                <span className="wc-sub">
                  {l.grade_level ? `Grade ${l.grade_level}` : "No grade set"}
                  {l.interests.length ? ` · loves ${l.interests.slice(0, 2).join(", ")}` : ""}
                </span>
              </button>
            ))}
          </div>
          {learners.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              No learners yet — <a href="#/learners">add some first</a> so the AI can personalize. Or generate for everyone.
            </p>
          )}
          {selected && (
            <div className="ainotes">
              <label className="small" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                🧠 AI notes for {selected.name} — remembered for <em>every</em> course
              </label>
              <RichTextEditor value={learnerNotes} onChange={setLearnerNotes} rows={4}
                placeholder="Struggles with common denominators. Loves period dramas. Keep examples kind and funny." />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn small-btn" type="button" disabled={learnerNotes === notesSaved} onClick={saveLearnerNotes}>
                  {learnerNotes === notesSaved ? "✓ Saved" : "Save notes"}
                </button>
                <span className="hint">Also editable any time on the Learners page.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* STEP 2 — what */}
      <section className="panel step">
        <div className="stepnum" aria-hidden="true">2</div>
        <div className="grow">
          <h2>What should they learn?</h2>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow">
              <input className="input biginput" placeholder="e.g. Fractions for 6th grade · Basic chemistry · World War II overview"
                value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
            </div>
            <select className="input" style={{ maxWidth: 160 }} value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} aria-label="Grade level">
              <option value="">Level: auto</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Grade {g}</option>)}
              <option value="13">College</option>
              <option value="14">Adult</option>
            </select>
          </div>
        </div>
      </section>

      {/* STEP 3 — lens */}
      <section className="panel step">
        <div className="stepnum" aria-hidden="true">3</div>
        <div className="grow">
          <h2>The magic — a lens <span className="muted small">(optional but try it)</span></h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Teach the subject through something they love. Same math — different world.
          </p>
          <input className="input biginput" placeholder="sewing · Minecraft · skateboarding · baking · horses…"
            value={lens} maxLength={100} onChange={(e) => setLens(e.target.value)} aria-label="Lens" />
          <div className="row wrap" style={{ marginTop: 10 }}>
            {LENS_IDEAS.map((idea) => (
              <button key={idea} type="button" className={`pilltab${lens === idea ? " on" : ""}`}
                onClick={() => setLens(lens === idea ? "" : idea)}>{idea}</button>
            ))}
          </div>
          {topic && lens && (
            <p className="lenspreview" aria-live="polite">
              ✨ “{topic}” taught through <strong>{lens}</strong> — every example, problem, and project comes from the world of {lens}.
            </p>
          )}
        </div>
      </section>

      {/* STEP 4 — sources */}
      <section className="panel step">
        <div className="stepnum" aria-hidden="true">4</div>
        <div className="grow">
          <h2>Ground it in sources <span className="muted small">(optional)</span></h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Paste notes or add links — the course sticks to these facts instead of guessing.
          </p>
          {sources.length > 0 && (
            <div className="row wrap" style={{ marginBottom: 10 }}>
              {sources.map((s, i) => (
                <span className="chip" key={i}>
                  {s.type === "url" ? "🔗" : "📄"} {s.title.slice(0, 34)}
                  <button className="iconbtn" style={{ width: 20, height: 20 }} aria-label={`Remove ${s.title}`}
                    type="button" onClick={() => setSources(sources.filter((_, j) => j !== i))}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="row" style={{ alignItems: "flex-start" }}>
            <input className="input" placeholder="Source title (e.g. Chapter 3)" style={{ flex: 1 }}
              value={srcTitle} onChange={(e) => setSrcTitle(e.target.value)} aria-label="Source title" />
            <button className="btn" type="button" disabled={!notes.trim() || sources.length >= 5} onClick={addTextSource}>＋ Add text</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <RichTextEditor value={notes} onChange={setNotes} rows={5} label="Pasted source"
              placeholder="…paste a chapter, your notes, or key facts here, then click ＋ Add text" />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" placeholder="https://a-web-page-or-article.example" style={{ flex: 1 }}
              value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} aria-label="Source URL" />
            <button className="btn" type="button"
              disabled={!/^https?:\/\//.test(srcUrl.trim()) || sources.length >= 5}
              onClick={() => {
                setSources([...sources, { type: "url", title: srcTitle.trim() || srcUrl, url: srcUrl.trim() }]);
                setSrcUrl(""); setSrcTitle("");
              }}>＋ Add link</button>
          </div>
        </div>
      </section>

      <div className="stickybar">
        <div className="muted small">
          {selected ? `For ${selected.name}` : "For everyone"}{gradeLevel ? ` · Grade ${gradeLevel}` : ""}{lens ? ` · through ${lens}` : ""}
          {sources.length ? ` · ${sources.length} source${sources.length > 1 ? "s" : ""}` : ""}
        </div>
        <button className="btn primary big" type="button" disabled={!canGenerate || busy} onClick={generate}>
          ✨ Generate course
        </button>
      </div>
    </>
  );
}
