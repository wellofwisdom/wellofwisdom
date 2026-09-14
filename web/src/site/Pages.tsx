// SPDX-License-Identifier: AGPL-3.0-or-later
// Inner public pages: every feature, one guide per audience, and self-hosting.
import type { ReactNode } from "react";
import { linkProps } from "../router";
import { SITE, REPO, audienceBySlug, pillarById } from "./data";
import { SitePage, useDemo, usePageTitle, CheckIcon } from "./SiteChrome";
import { OpenCourses, useOpenCourses } from "./Showcase";

function PageHero({ crumb, eyebrow, title, lead, children }: { crumb: string; eyebrow: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <section className="s-night s-page-hero">
      <div className="s-wrap">
        <p className="s-crumbs"><a {...linkProps("dashboard")}>Home</a> / {crumb}</p>
        <p className="s-eyebrow" style={{ marginTop: 18 }}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className="s-lead">{lead}</p>
        {children && <div className="s-cta-row" style={{ marginTop: 26 }}>{children}</div>}
      </div>
    </section>
  );
}

function DemoButton({ label = "Try the live demo" }: { label?: string }) {
  const demo = useDemo();
  if (demo.available === false) return <a className="s-btn s-btn-primary" href="/#start">Create a group</a>;
  return (
    <>
      <button className="s-btn s-btn-primary" type="button" disabled={demo.busy} onClick={demo.start}>{demo.busy ? "Opening the demo" : label}</button>
      {demo.error && <span className="s-form-error" role="alert">{demo.error}</span>}
    </>
  );
}

function ClosingBand() {
  return (
    <section className="s-section-tight s-night">
      <div className="s-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 32, color: "#f4f8f8" }}>See it with real work in it</h2>
          <p className="s-lead">The demo opens a group with courses, learners and reports already filled in.</p>
        </div>
        <div className="s-cta-row">
          <DemoButton />
          <a className="s-btn s-btn-quiet" {...linkProps("self-host")}>Self-host free</a>
        </div>
      </div>
    </section>
  );
}

export function FeaturesPage() {
  usePageTitle("features");
  const total = SITE.pillars.reduce((n, p) => n + p.features.length, 0);
  return (
    <SitePage>
      <PageHero crumb="Features" eyebrow="Every feature" title="Everything Well of Wisdom does" lead={`${total} features in nine parts, all included in the free, open-source version. If it is on this page, it is in the app today.`}>
        <DemoButton />
        <a className="s-btn s-btn-quiet" href={REPO} target="_blank" rel="noreferrer">Read the source</a>
      </PageHero>
      <nav className="s-feature-nav" aria-label="Feature groups">
        <div className="s-wrap">
          <ol>
            {SITE.pillars.map((p) => <li key={p.id}><a href={`#${p.id}`}><b>{p.numeral}</b>{p.title}</a></li>)}
          </ol>
        </div>
      </nav>
      <div className="s-wrap">
        {SITE.pillars.map((p) => (
          <section key={p.id} id={p.id} className="s-feature-block" aria-labelledby={`${p.id}-title`}>
            <div>
              <span className="s-pillar-num">{p.numeral}</span>
              <h2 id={`${p.id}-title`}>{p.title}</h2>
              <p>{p.line}</p>
            </div>
            <div className="s-feature-list">
              {p.features.map((f) => (
                <div key={f.name}><strong>{f.name}</strong><p>{f.detail}</p></div>
              ))}
            </div>
          </section>
        ))}
        <section className="s-section-tight" aria-labelledby="roadmap-title">
          <p className="s-eyebrow">On the roadmap</p>
          <h2 id="roadmap-title" style={{ fontSize: 34, margin: "8px 0 20px" }}>Being built now</h2>
          <div className="s-roadmap">
            {SITE.roadmap.map((r) => <div key={r.name}><strong>{r.name}</strong><p>{r.detail}</p></div>)}
          </div>
          <p className="s-note" style={{ marginTop: 16 }}>
            Follow along in the <a href={`${REPO}/blob/main/docs/ROADMAP.md`} target="_blank" rel="noreferrer">public roadmap</a>.
          </p>
        </section>
      </div>
      <ClosingBand />
    </SitePage>
  );
}

export function AudiencePage({ slug }: { slug: string }) {
  usePageTitle(slug);
  const courses = useOpenCourses();
  const a = audienceBySlug(slug);
  if (!a) return null;
  const related = Array.from(new Set(a.needs.map((n) => n.pillar))).map((id) => pillarById(id)).filter(Boolean);
  return (
    <SitePage>
      <PageHero crumb={a.label} eyebrow={a.eyebrow} title={a.title} lead={a.lead}>
        <DemoButton />
        <a className="s-btn s-btn-quiet" href="/#start">Create a group</a>
      </PageHero>

      <section className="s-section" aria-labelledby="needs-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">What you get</p>
            <h2 id="needs-title">Made for the way {a.short.toLowerCase()} work</h2>
          </div>
          <div className="s-needs">
            {a.needs.map((n) => {
              const p = pillarById(n.pillar);
              return (
                <article key={n.title} className="s-need">
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  {p && <a href={`/features#${p.id}`}>{p.numeral}. {p.title}</a>}
                </article>
              );
            })}
          </div>
          {a.note && <p className="s-callout">{a.note}</p>}
        </div>
      </section>

      <section className="s-section-tight s-band" aria-labelledby="steps-title">
        <div className="s-wrap">
          <p className="s-eyebrow">Getting started</p>
          <h2 id="steps-title" style={{ fontSize: 34, margin: "8px 0 24px" }}>Four steps from sign-up to learning</h2>
          <ol className="s-steps">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </section>

      <section className="s-section" aria-labelledby="related-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">The parts you will use most</p>
            <h2 id="related-title">Features for {a.short.toLowerCase()}</h2>
          </div>
          <div className="s-pillars">
            {related.map((p) => p && (
              <article key={p.id} className="s-pillar">
                <span className="s-pillar-num">{p.numeral}</span>
                <h3>{p.title}</h3>
                <p>{p.line}</p>
                <ul>{p.features.map((f) => <li key={f.name}>{f.name}</li>)}</ul>
                <a className="s-more" href={`/features#${p.id}`}>Details</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {(courses === null || courses.length > 0) && <section className="s-section-tight s-band" aria-labelledby="open-title">
        <div className="s-wrap">
          <p className="s-eyebrow">Open courses</p>
          <h2 id="open-title" style={{ fontSize: 34, margin: "8px 0 24px" }}>Courses you can teach tomorrow</h2>
          <OpenCourses limit={3} prefer={a.courseTag} />
        </div>
      </section>}

      <ClosingBand />
    </SitePage>
  );
}

export function SelfHostPage() {
  usePageTitle("self-host");
  return (
    <SitePage>
      <PageHero crumb="Self-host" eyebrow="Self-host" title="One command. Your server. Offline if you want it." lead="Well of Wisdom is AGPL-3.0 and ships as one Docker image with Postgres. Every learning feature is included, with no licence key and nothing phoning home.">
        <a className="s-btn s-btn-primary" href={REPO} target="_blank" rel="noreferrer">Get the code</a>
        <a className="s-btn s-btn-quiet" href={`${REPO}/blob/main/docs/OPERATIONS.md`} target="_blank" rel="noreferrer">Operations guide</a>
      </PageHero>

      <section className="s-section" aria-labelledby="install-title">
        <div className="s-wrap s-dev">
          <div>
            <p className="s-eyebrow">Install</p>
            <h2 id="install-title" style={{ fontSize: 38, margin: "8px 0 14px" }}>Up in under a minute</h2>
            <p className="s-lead">Any machine with Docker: a home server, a school server, or a small cloud box. Open http://localhost:3000 when it starts.</p>
            <ul className="s-act-list">
              <li><CheckIcon /><span>Postgres data and uploads live on volumes you control</span></li>
              <li><CheckIcon /><span>Bring any OpenAI-compatible endpoint, Claude or Gemini, or run Ollama locally</span></li>
              <li><CheckIcon /><span>No AI endpoint? Templates, lessons, review, records and email still work</span></li>
            </ul>
          </div>
          <div className="s-term" aria-label="Install commands">
            <div className="s-term-bar">terminal</div>
            <pre><code><span className="p">$</span> git clone {REPO}.git{"\n"}<span className="p">$</span> cd wellofwisdom{"\n"}<span className="p">$</span> docker compose up -d{"\n\n"}<span className="c"># fully offline AI</span>{"\n"}<span className="p">$</span> docker compose --profile local-ai up -d{"\n"}<span className="p">$</span> docker compose exec ollama ollama pull llama3.1</code></pre>
          </div>
        </div>
      </section>

      <section className="s-section-tight s-band" aria-labelledby="run-title">
        <div className="s-wrap">
          <p className="s-eyebrow">Running it well</p>
          <h2 id="run-title" style={{ fontSize: 34, margin: "8px 0 24px" }}>What an administrator controls</h2>
          <div className="s-needs">
            <article className="s-need"><h3>Who runs the server</h3><p>Set the administrators by email. Only they can change the AI provider, email provider, media keys and spend limits.</p></article>
            <article className="s-need"><h3>AI spending</h3><p>Costs are tracked per group, with monthly and daily caps checked before anything is generated.</p></article>
            <article className="s-need"><h3>Invite-only sign-up</h3><p>An invite code keeps sign-up closed on a public server while AI is connected.</p></article>
            <article className="s-need"><h3>Backups and export</h3><p>Back up the Postgres volume and the uploads volume, and let any group export its own data.</p></article>
          </div>
        </div>
      </section>
      <ClosingBand />
    </SitePage>
  );
}
