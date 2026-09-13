// SPDX-License-Identifier: AGPL-3.0-or-later
// Community library as its own first-class page, not a hidden tab inside
// "Your courses". With 17 demo courses it is invisible behind a second
// click; with growth it is the whole gallery.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "../components/ui";

type CommunityCourse = {
  slug: string; title: string; description: string;
  topic: string | null; lens: string | null; gradeLevel: number | null;
  license: string; units: number; lessons: number;
  rawUrl: string | null; local?: boolean;
};

export default function Community({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [courses, setCourses] = useState<CommunityCourse[] | null>(null);
  const [error, setError] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [lensFilter, setLensFilter] = useState("");

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
      onNavigate(`course/${d.courseId}`);
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusySlug(null);
    }
  }

  if (!courses) {
    return (
      <Panel title="Community library">
        <p className="muted small" style={{ marginBottom: 10 }}>Browse the shared CC-BY gallery. Import any course as a draft you review before learners see it.</p>
        <div className="skel" style={{ height: 80 }} />
      </Panel>
    );
  }
  if (error && !courses.length) {
    return (
      <Panel title="Community library">
        <div className="formerror" role="alert">{error}</div>
      </Panel>
    );
  }

  const lenses = [...new Set(courses.map((c) => String(c.lens || "").trim()).filter(Boolean))].sort();
  const lowerQ = q.trim().toLowerCase();
  const filtered = courses.filter((c) => {
    if (lensFilter && String(c.lens || "").trim() !== lensFilter) return false;
    if (!lowerQ) return true;
    const hay = `${c.title} ${c.description || ""} ${c.topic || ""} ${c.lens || ""}`.toLowerCase();
    return hay.includes(lowerQ);
  });

  return (
    <Panel
      title="Community library"
      side={
        <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ width: 220 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, topic, lens"
            aria-label="Search community"
          />
          <select
            className="input"
            style={{ width: 160 }}
            value={lensFilter}
            onChange={(e) => setLensFilter(e.target.value)}
            aria-label="Filter by lens"
          >
            <option value="">All lenses</option>
            {lenses.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <a className="btn" href="https://github.com/wellofwisdom/community-courses" target="_blank" rel="noopener noreferrer">On GitHub →</a>
        </span>
      }
    >
      {error && <div className="formerror" role="alert">{error}</div>}
      {msg && <div className="hint" role="status" style={{ marginBottom: 8 }}>{msg}</div>}
      {courses.length === 0 ? (
        <p className="muted">No community courses yet. Check back soon, or publish one of your own.</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No courses match that filter.</p>
      ) : (
        filtered.map((c) => (
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
    </Panel>
  );
}
