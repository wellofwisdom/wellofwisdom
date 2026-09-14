// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import { api, niceError } from "../../api";
import { linkProps } from "../../router";

interface Card {
  public_slug: string;
  title: string;
  topic: string;
  lens: string | null;
  grade_level: number | null;
  description: string | null;
  license: string;
  author_name: string | null;
  published_at: string | null;
  units: number;
  lessons: number;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="msection alt" style={{ paddingTop: 28, paddingBottom: 28 }}>
      <div className="mhead" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22 }}>{title}</h2>
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function CoursesFor({ tag, title }: { tag: string; title: string }) {
  const [courses, setCourses] = useState<Card[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ courses: Card[] }>("/api/public/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setErr(niceError(e)));
  }, []);
  const pick = (() => {
    if (!courses || !courses.length) return [];
    const needle = tag.toLowerCase();
    const scored = courses.map((c) => ({
      c,
      score:
        (c.title.toLowerCase().includes(needle) ? 3 : 0) +
        (c.topic.toLowerCase().includes(needle) ? 2 : 0) +
        (String(c.lens || "").toLowerCase().includes(needle) ? 2 : 0) +
        ((c.description || "").toLowerCase().includes(needle) ? 1 : 0),
    }));
    const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.c);
    return (ranked.length ? ranked : courses).slice(0, 3);
  })();
  return (
    <Section title={title}>
      {err && <div className="formerror">{err}</div>}
      {!courses && !err && <p className="muted small">Loading…</p>}
      {courses && !pick.length && <p className="muted small">Nothing published yet for this lens.</p>}
      <div className="publicgrid" style={{ marginTop: 10 }}>
        {pick.map((c) => (
          <a key={c.public_slug} className="publiccard" {...linkProps(`c/${c.public_slug}`)}>
            <h2>{c.title}</h2>
            {c.lens && <span className="tag">through {c.lens}</span>}
            {c.grade_level != null && <span className="tag">Grade {c.grade_level}</span>}
            {c.description && <p className="muted small" style={{ marginTop: 8 }}>{c.description}</p>}
            <div className="muted small" style={{ marginTop: 8 }}>{c.units} units · {c.lessons} lessons</div>
          </a>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        <a {...linkProps("c")}>See all shared courses →</a>
      </p>
    </Section>
  );
}

export function ForChrome({
  eyebrow,
  title,
  lead,
  tag,
  tagTitle,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  tag: string;
  tagTitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="marketing">
      <header className="mnav">
        <a className="mbrand" {...linkProps("dashboard")}><span className="mnut" aria-hidden="true">🌰</span> Well of Wisdom</a>
        <nav className="mnavlinks" aria-label="Site">
          <a {...linkProps("for-homeschools")}>Homeschools</a>
          <a {...linkProps("for-co-ops")}>Co-ops</a>
          <a {...linkProps("for-teachers")}>Teachers</a>
          <a {...linkProps("self-host")}>Self-host</a>
          <a {...linkProps("c")}>Shared courses</a>
        </nav>
        <div className="mnavcta">
          <a className="btn ghost small-btn" {...linkProps("dashboard")}>Sign in</a>
          <a className="btn primary small-btn" {...linkProps("dashboard")}>Try the demo</a>
        </div>
      </header>
      <main id="main">
        <section className="mhero" style={{ paddingBottom: 36 }}>
          <div className="mheroInner" style={{ gridTemplateColumns: "1fr" }}>
            <div className="mheroText" style={{ maxWidth: 860 }}>
              <p className="meyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="mlead">{lead}</p>
              <div className="mctaRow">
                <a className="btn primary big" {...linkProps("dashboard")}>Start your group</a>
                <a className="btn big" {...linkProps("c")}>Browse shared courses</a>
              </div>
            </div>
          </div>
        </section>
        {children}
        <CoursesFor tag={tag} title={tagTitle} />
        <section className="mctaBand" style={{ marginBottom: 18 }}>
          <div>
            <h2>Your data stays yours</h2>
            <p className="muted">Open source (AGPL-3.0). Self-host free, or let us host it when ready.</p>
          </div>
          <div className="mctaRow">
            <a className="btn primary" {...linkProps("self-host")}>How to self-host</a>
            <a className="btn" {...linkProps("dashboard")}>Create your group</a>
          </div>
        </section>
      </main>
      <footer className="mfoot">
        <div className="mfootMain">
          <div className="mfootBrand"><span className="mfootLogo" aria-hidden="true">🌰</span><strong>Well of Wisdom</strong><span className="mfootTag">AGPL-3.0</span></div>
          <nav className="mfootLinks" aria-label="Footer">
            <a {...linkProps("privacy")}>Privacy</a>
            <a {...linkProps("terms")}>Terms</a>
            <a {...linkProps("children")}>Children</a>
            <a {...linkProps("c")}>Shared courses</a>
            <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export { Section };
