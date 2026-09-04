// SPDX-License-Identifier: AGPL-3.0-or-later
// Public, logged-out course pages: the shared gallery (/c) and one course
// (/c/<slug>). Read-only, no answer keys, and every course offers its portable
// package so any other instance can import it.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { linkProps } from "../router";
import { RichText } from "../lib/rich";
import { VideoPlayer } from "../components/VideoUI";

interface PublicMeta {
  slug: string;
  title: string;
  topic: string;
  lens: string | null;
  gradeLevel: number | null;
  description: string | null;
  license: string;
  author: string | null;
  publishedAt: string | null;
  trailerUploadId: number | null;
}

/** Gallery cards carry counts; the course page carries the actual units. */
interface PublicCard extends PublicMeta {
  units: number;
  lessons: number;
}

interface PublicItem { type: string; position: number; content: Record<string, unknown> }
interface PublicLesson { title: string; summary: string | null; items: PublicItem[] }
interface PublicUnit { title: string; lessons: PublicLesson[] }
interface PublicCourseData extends PublicMeta { units: PublicUnit[] }

function Banner() {
  return (
    <div className="publicbanner">
      <a {...linkProps("c")} className="brand">🌰 Well of Wisdom</a>
      <span className="grow" />
      <a className="btn ghost" href="https://github.com/wellofwisdom/wellofwisdom"
        target="_blank" rel="noopener noreferrer">Run your own</a>
    </div>
  );
}

export function PublicGallery() {
  const [courses, setCourses] = useState<PublicCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ courses: PublicCard[] }>("/api/public/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(niceError(e)));
  }, []);

  return (
    <div className="publicwrap">
      <Banner />
      <main id="main">
        <h1>Shared courses</h1>
        <p className="muted">
          Courses published from this instance. Every one is a free download you can import into your
          own Well of Wisdom. No account, no platform in the middle.
        </p>
        {error && <div className="formerror" role="alert">{error}</div>}
        {!courses && !error && <p className="muted small">Loading…</p>}
        {courses && courses.length === 0 && (
          <p className="muted">Nothing published yet. A guide can publish any course from its page.</p>
        )}
        <div className="publicgrid">
          {(courses || []).map((c) => (
            <a key={c.slug} className="publiccard" {...linkProps(`c/${c.slug}`)}>
              <h2>{c.title}</h2>
              {c.lens && <span className="tag">through {c.lens}</span>}
              {c.gradeLevel != null && <span className="tag">Grade {c.gradeLevel}</span>}
              <p className="muted small">{c.description}</p>
              <div className="muted small">
                {c.units} units · {c.lessons} lessons · {c.license}
                {c.author ? ` · ${c.author}` : ""}
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}

function ItemView({ item }: { item: PublicItem }) {
  const c = item.content as Record<string, string | undefined> & {
    choices?: { id: string; text: string }[]; uploadId?: number | string;
  };
  if (item.type === "article") {
    return (
      <div className="publicitem">
        {c.title && <h4>{c.title}</h4>}
        <RichText text={String(c.body || "")} />
      </div>
    );
  }
  if (item.type === "video" && (c.youtubeId || c.uploadId || c.vimeoId || c.fileUrl || (c.peertubeHost && c.peertubeId))) {
    return (
      <div className="publicitem">
        <h4>{c.title || "Video"}</h4>
        <VideoPlayer content={{
          youtubeId: c.youtubeId,
          uploadId: c.uploadId ? Number(c.uploadId) : undefined,
          vimeoId: c.vimeoId,
          fileUrl: c.fileUrl,
          peertubeHost: c.peertubeHost,
          peertubeId: c.peertubeId,
          title: c.title,
        }} />
        {c.note && <p className="muted small">{c.note}</p>}
      </div>
    );
  }
  if (item.type === "exercise") {
    return (
      <div className="publicitem exercise">
        <p><strong>Practice.</strong> <RichText text={String(c.prompt || "")} /></p>
        {c.choices && (
          <ul className="publicchoices">
            {c.choices.map((ch) => <li key={ch.id}>{ch.text}</li>)}
          </ul>
        )}
        <p className="muted small">Answers are not shown here: import the course to teach with it.</p>
      </div>
    );
  }
  if (item.type === "project") {
    return (
      <div className="publicitem">
        <h4>🛠 {c.title || "Project"}</h4>
        <RichText text={String(c.description || "")} />
        {c.rubric && <><h5>Rubric</h5><RichText text={String(c.rubric)} /></>}
      </div>
    );
  }
  return null;
}

export function PublicCourse({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicCourseData | null>(null);
  const [stats, setStats] = useState<{ units: number; lessons: number; exercises: number; videos: number } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ course: PublicCourseData; stats: typeof stats }>(`/api/public/courses/${encodeURIComponent(slug)}`)
      .then((d) => { setData(d.course); setStats(d.stats); })
      .catch((e) => setError(niceError(e)));
  }, [slug]);

  if (error) {
    return (
      <div className="publicwrap">
        <Banner />
        <main id="main">
          <h1>Course not found</h1>
          <p className="muted">It may have been unpublished. <a {...linkProps("c")}>See what else is shared</a>.</p>
        </main>
      </div>
    );
  }
  if (!data) return <div className="publicwrap"><Banner /><main id="main"><p className="muted">Loading…</p></main></div>;

  const exportUrl = `/api/public/courses/${encodeURIComponent(slug)}/export`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const textUrl = `${origin}/c/${encodeURIComponent(slug)}.txt`;
  const pageUrl = `${origin}/c/${encodeURIComponent(slug)}`;

  // Plain-text URL first: it is the highest-signal one to hand a research tool.
  const sourceLinks = [textUrl, pageUrl, `${origin}${exportUrl}`].join("\n");
  const copyLinks = () => {
    navigator.clipboard?.writeText(sourceLinks).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
  };

  return (
    <div className="publicwrap">
      <Banner />
      <main id="main">
        <p className="muted small"><a {...linkProps("c")}>← Shared courses</a></p>
        <h1>{data.title}</h1>
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {data.lens && <span className="tag">through {data.lens}</span>}
          {data.gradeLevel != null && <span className="tag">Grade {data.gradeLevel}</span>}
          <span className="tag">{data.license}</span>
          {data.author && <span className="tag">by {data.author}</span>}
        </div>
        {data.trailerUploadId && (
          <div style={{ margin: "14px 0" }}>
            <VideoPlayer content={{ uploadId: data.trailerUploadId, title: `${data.title}: trailer` }} />
          </div>
        )}
        {data.description && <p className="lead">{data.description}</p>}
        {stats && (
          <p className="muted small">
            {stats.units} units · {stats.lessons} lessons · {stats.exercises} exercises
            {stats.videos ? ` · ${stats.videos} videos` : ""}
          </p>
        )}

        <div className="publicactions">
          <a className="btn primary" href={exportUrl} download>⬇ Download course file</a>
          <a className="btn" {...linkProps("dashboard")}>Import into my instance</a>
          <a className="btn ghost" href={textUrl} target="_blank" rel="noopener noreferrer">View as plain text</a>
          <button className="btn ghost" type="button" onClick={copyLinks}>
            {copied ? "Links copied" : "Copy source links"}
          </button>
        </div>
        <p className="hint">
          Downloading gives you a <code>.wow-course.json</code> package. In your own Well of Wisdom,
          go to Courses → Import, or paste this page's URL to pull it straight across.
          <br />
          <strong>Copy source links</strong> puts the plain-text, page and download URLs on your
          clipboard, ready to paste into a research tool like NotebookLM as sources.
        </p>

        {data.units.map((u, ui) => (
          <section className="panel" key={ui}>
            <h2>{u.title}</h2>
            {u.lessons.map((l, li) => (
              <div className="publiclesson" key={li}>
                <h3>{l.title}</h3>
                {l.summary && <p className="muted small">{l.summary}</p>}
                {l.items.map((it, ii) => <ItemView item={it} key={ii} />)}
              </div>
            ))}
          </section>
        ))}

        <footer className="publicfooter">
          <p className="muted small">
            Published with <a href="https://github.com/wellofwisdom/wellofwisdom"
              target="_blank" rel="noopener noreferrer">Well of Wisdom</a>. Open source, self-hosted,
            AGPL-3.0. This course is licensed {data.license}.
          </p>
        </footer>
      </main>
    </div>
  );
}
