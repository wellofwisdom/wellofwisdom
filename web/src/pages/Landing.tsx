// SPDX-License-Identifier: AGPL-3.0-or-later
// The public home page. Content that also feeds the sitemap and llms.txt
// (pages, features, audiences) comes from server/lib/site.json via site/data.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { linkProps } from "../router";
import { GoogleOneTap } from "../components/GoogleAuth";
import { SITE, REPO } from "../site/data";
import { SitePage, useDemo, usePageTitle, CheckIcon } from "../site/SiteChrome";
import { Well, StudioShot, WorldShot, ReportShot, OpenCourses, useOpenCourses } from "../site/Showcase";
import AuthPanel from "../site/AuthPanel";

type Tab = "signin" | "signup" | "learner";

const FAQ: [string, string][] = [
  ["Who is Well of Wisdom for?", "Anyone who teaches: parents and homeschool families, classroom teachers, schools that want AI on their own terms, co-ops and microschools, tutors, and adults teaching themselves. One group can be a family of two or a co-op of thirty families."],
  ["Do I need an AI key?", "No. Learning path templates, lessons, spaced review, progress, reports, attendance and email all work without one. Course generation and the tutor need a model: any OpenAI-compatible service, Claude, Gemini, or a free local model with Ollama."],
  ["Is student and child data safe?", "Learners sign in with a group code and a PIN, with no email required. Self-hosted, the database sits on your server and nothing leaves it unless you connect an AI service, which the admin screen states plainly. There are no ads and no trackers. Read the children's data page for the details."],
  ["Can a school run it on its own servers?", "Yes. It is one Docker image plus Postgres. Choose your AI provider or run models locally, set spend caps, and give teachers, assistants and observers the access their role needs. The code is AGPL-3.0, so your IT team can read every line."],
  ["Is AI-generated content accurate?", "The adult in charge reviews every word before a learner sees it, a course with a missing answer key cannot be published, and grading happens on the server against keys learners never see. Courses can be grounded in sources you provide."],
  ["What about homeschool filing?", "Attendance is derived from real work and editable per day, portfolios print for any date range, and assessments are stored exactly as they were given. You set your requirements; the app never guesses a state's rules."],
  ["Does it work offline?", "Yes. Run the local AI profile, pull a model, and point the app at it. No cloud is needed and nothing leaves the building."],
  ["What does the demo include?", "One click creates a practice group with learners, published courses and a learner who has already done real work, so you can see reports, the world map and review in action. Nothing there emails anyone."],
  ["What is the licence?", "GNU AGPL-3.0. Free for any family, school or co-op to run forever. The name Well of Wisdom is reserved so a fork that changes meaningfully should rebrand."],
];

export default function Landing({ onAuthed }: { onAuthed: () => void }) {
  usePageTitle("");
  const demo = useDemo(onAuthed);
  const openCourses = useOpenCourses();
  const [tab, setTab] = useState<Tab>("signup");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    api<{ inviteRequired: boolean; googleClientId?: string | null }>("/api/auth/config")
      .then((d) => {
        setInviteRequired(Boolean(d.inviteRequired));
        const cid = d.googleClientId ? String(d.googleClientId).trim() : "";
        setGoogleClientId(cid || null);
      })
      .catch(() => setInviteRequired(false));
  }, []);

  useEffect(() => {
    function scrollHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 60);
    }
    scrollHash();
    window.addEventListener("hashchange", scrollHash);
    return () => window.removeEventListener("hashchange", scrollHash);
  }, []);

  const goStart = (which: Tab) => {
    setTab(which);
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <SitePage onStart={() => goStart("signin")}>
      {googleClientId && <GoogleOneTap clientId={googleClientId} onAuthed={onAuthed} delay={true} />}

      <section className="s-night s-hero" aria-labelledby="hero-title">
        <div className="s-wrap s-hero-grid">
          <div>
            <p className="s-eyebrow">Open source · AI-first · Yours to run</p>
            <h1 id="hero-title">Every learner drinks from <em>their own</em> well.</h1>
            <p className="s-lead">
              Turn any topic into a full course shaped around what each learner loves, then let them play it as a world.
              Spaced review, a tutor that follows your rules, and records that print. Free to run on your own server.
            </p>
            <div className="s-cta-row">
              {demo.available !== false ? (
                <button className="s-btn s-btn-primary" type="button" disabled={demo.busy} onClick={demo.start}>
                  {demo.busy ? "Opening the demo" : "Try the live demo, no email"}
                </button>
              ) : (
                <button className="s-btn s-btn-primary" type="button" onClick={() => goStart("signup")}>Create a group</button>
              )}
              <a className="s-btn s-btn-quiet" {...linkProps("self-host")}>Self-host free</a>
            </div>
            {demo.error && <div className="s-form-error" role="alert">{demo.error}</div>}
            <p className="s-for-line">
              Built for{" "}
              {SITE.audiences.map((a, i) => (
                <span key={a.slug}>
                  <a {...linkProps(a.slug)}>{a.short.toLowerCase()}</a>
                  {i < SITE.audiences.length - 2 ? ", " : i === SITE.audiences.length - 2 ? " and " : "."}
                </span>
              ))}
            </p>
          </div>
          <Well />
        </div>
      </section>

      <section className="s-ledger" aria-label="At a glance">
        <div className="s-wrap s-ledger-in">
          {SITE.facts.map((f) => (
            <div key={f.label} className="s-ledger-item"><strong>{f.value}</strong><span>{f.label}</span></div>
          ))}
        </div>
      </section>

      <section className="s-section" aria-labelledby="acts-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">How it works</p>
            <h2 id="acts-title">Draw the course. Let them drink. Watch what grows.</h2>
            <p className="s-lead">The adult in charge shapes every course. The learner plays it. The records write themselves from real work.</p>
          </div>
          <div className="s-acts">
            <article className="s-act">
              <div className="s-act-copy">
                <p className="s-eyebrow">Draw</p>
                <h3>A full course in about a minute, through what they love</h3>
                <p>Name the topic, the grade and a lens: horses, football, Minecraft, or Alice in Wonderland. Add your own notes or links to keep it grounded. You get units, lessons, exercises and a project to review and edit before anyone sees them.</p>
                <ul className="s-act-list">
                  <li><CheckIcon /><span>Lessons grounded in the sources you choose</span></li>
                  <li><CheckIcon /><span>Paste a worksheet or snap a photo and it becomes graded practice</span></li>
                  <li><CheckIcon /><span>Plan a whole term, or start from a ready template with no AI at all</span></li>
                </ul>
              </div>
              <StudioShot />
            </article>
            <article className="s-act">
              <div className="s-act-copy">
                <p className="s-eyebrow">Drink</p>
                <h3>The course becomes a world worth finishing</h3>
                <p>Learners walk the course as a trail, beat bosses with real answers, and collect loot with lore. Hints nudge before they tell, and "Why was I wrong?" walks from the mistake to the idea. A tutor asks questions instead of handing over answers.</p>
                <ul className="s-act-list">
                  <li><CheckIcon /><span>Story, dungeon crawl, RPG party or choose your own path</span></li>
                  <li><CheckIcon /><span>Real maths notation, vocabulary cards, listening and repetition, translation, dialogue and graded readers, push to talk with transcript, video with questions, projects and read aloud</span></li>
                  <li><CheckIcon /><span>Dailies, streaks and badges earned only from real work</span></li>
                </ul>
              </div>
              <WorldShot />
            </article>
            <article className="s-act">
              <div className="s-act-copy">
                <p className="s-eyebrow">Grow</p>
                <h3>Review that beats forgetting, records that print</h3>
                <p>Every answer feeds a spaced review queue that returns right before a learner would forget. Progress, attendance, portfolios and reports come from the work itself, ready for a parent, a principal or a state reviewer.</p>
                <ul className="s-act-list">
                  <li><CheckIcon /><span>Mistakes come back today; mastered ideas come back later</span></li>
                  <li><CheckIcon /><span>See which misconceptions several learners share</span></li>
                  <li><CheckIcon /><span>Reports with a narrative you edit and signature lines</span></li>
                </ul>
              </div>
              <ReportShot />
            </article>
          </div>
        </div>
      </section>

      <section className="s-section s-band" id="features" aria-labelledby="hazels-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">The nine hazels</p>
            <h2 id="hazels-title">Nine ways the well feeds a learner</h2>
            <p className="s-lead">In the old story, nine hazel trees drop their nuts into the Well of Wisdom, one for each way of knowing. Here is everything the platform does, in nine parts.</p>
          </div>
          <div className="s-pillars">
            {SITE.pillars.map((p) => (
              <article key={p.id} className="s-pillar">
                <span className="s-pillar-num">{p.numeral}</span>
                <h3>{p.title}</h3>
                <p>{p.line}</p>
                <ul>{p.features.slice(0, 4).map((f) => <li key={f.name}>{f.name}</li>)}</ul>
                <a className="s-more" href={`/features#${p.id}`}>All {p.features.length} features in {p.title}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section" aria-labelledby="who-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">Who it's for</p>
            <h2 id="who-title">Built for how you teach</h2>
            <p className="s-lead">A family at the kitchen table and a district IT team need different things. Each gets its own guide.</p>
          </div>
          <div className="s-audiences">
            {SITE.audiences.map((a) => (
              <a key={a.slug} className="s-aud" {...linkProps(a.slug)}>
                <strong>{a.label}</strong>
                <span>{a.title}</span>
                <em>Read the guide</em>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section s-band" aria-labelledby="trust-title">
        <div className="s-wrap s-trust">
          <div>
            <p className="s-eyebrow">Trust</p>
            <h2 id="trust-title" style={{ fontSize: "clamp(32px, 3.8vw, 44px)", margin: "10px 0 14px" }}>The adult in charge stays in charge</h2>
            <p className="s-lead">AI drafts. People decide. These are rules in the code, not promises in a brochure, and the code is public.</p>
          </div>
          <div className="s-promises">
            <div className="s-promise"><strong>Nothing unreviewed</strong><p>Every generated word is editable, and a course with a missing answer key cannot be published to learners.</p></div>
            <div className="s-promise"><strong>Answers stay hidden</strong><p>Grading happens on the server. Answer keys never reach a learner's browser, and in strict tutor modes they are never sent to the AI model.</p></div>
            <div className="s-promise"><strong>Every chat visible</strong><p>Guides read every tutor conversation, and each learner's tutor mode is set by an adult.</p></div>
            <div className="s-promise"><strong>No ads, no trackers</strong><p>Learners sign in without email. Self-hosted, data never leaves your server unless you connect an AI service.</p></div>
            <div className="s-promise"><strong>Take it with you</strong><p>Export any course as a file, or export an entire group's data, at any time.</p></div>
          </div>
        </div>
      </section>

      {(openCourses === null || openCourses.length > 0) && <section className="s-section" aria-labelledby="courses-title">
        <div className="s-wrap">
          <div className="s-head">
            <p className="s-eyebrow">Open courses</p>
            <h2 id="courses-title">Start from a course someone already built</h2>
            <p className="s-lead">Free courses under open licences. Read them here, download the package, and teach them in your own well.</p>
          </div>
          <OpenCourses limit={6} />
          <div className="s-cta-row" style={{ marginTop: 28 }}>
            <a className="s-btn s-btn-quiet" {...linkProps("c")}>Browse every open course</a>
          </div>
        </div>
      </section>}

      <section className="s-section s-night" aria-labelledby="dev-title">
        <div className="s-wrap s-dev">
          <div>
            <p className="s-eyebrow">For developers and IT</p>
            <h2 id="dev-title" style={{ fontSize: "clamp(32px, 3.8vw, 44px)", margin: "10px 0 14px", color: "#f4f8f8" }}>Read it, run it, extend it</h2>
            <p className="s-lead">One Docker image, Node and Postgres, and an AI layer that routes each task to the model you choose.</p>
            <ul className="s-dev-list">
              <li><b>Any model:</b> OpenAI-compatible, Claude, Gemini, or local Ollama</li>
              <li><b>Portable courses:</b> a documented JSON format and a public API</li>
              <li><b>Readable by machines:</b> plain-text courses, llms.txt and a sitemap</li>
              <li><b>Tested:</b> hundreds of automated tests and continuous integration</li>
            </ul>
            <div className="s-cta-row">
              <a className="s-btn s-btn-primary" href={REPO} target="_blank" rel="noreferrer">View the source</a>
              <a className="s-btn s-btn-quiet" {...linkProps("developers")}>Developer guide</a>
            </div>
          </div>
          <div className="s-term" aria-label="Install commands">
            <div className="s-term-bar">terminal</div>
            <pre><code><span className="c"># the whole install</span>{"\n"}<span className="p">$</span> git clone {REPO}.git{"\n"}<span className="p">$</span> cd wellofwisdom{"\n"}<span className="p">$</span> docker compose up -d{"\n\n"}<span className="c"># optional: fully offline AI</span>{"\n"}<span className="p">$</span> docker compose --profile local-ai up -d{"\n"}<span className="p">$</span> docker compose exec ollama ollama pull llama3.1</code></pre>
          </div>
        </div>
      </section>

      <Pricing />

      <section className="s-section s-band" aria-labelledby="faq-title">
        <div className="s-wrap">
          <div className="s-head s-center">
            <p className="s-eyebrow">Questions</p>
            <h2 id="faq-title">Asked by parents, teachers and IT</h2>
          </div>
          <div className="s-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section s-night" id="start" aria-labelledby="start-title" style={{ scrollMarginTop: 68 }}>
        <div className="s-wrap s-start">
          <div>
            <p className="s-eyebrow">Open your well</p>
            <h2 id="start-title">Start with one learner or a whole school</h2>
            <p className="s-lead">
              Create a group for your family, class, co-op or tutoring practice.
              {inviteRequired ? " This server is invite-only, so you will need a code from the person who runs it." : ""}
            </p>
            <ul className="s-start-points">
              <li><CheckIcon /><span>Learners sign in with a code and a PIN, no email needed</span></li>
              <li><CheckIcon /><span>Add guides, assistants and observers later</span></li>
              <li><CheckIcon /><span>Rather look around first? The demo takes one click</span></li>
            </ul>
            {demo.available !== false && (
              <div className="s-cta-row" style={{ marginTop: 24 }}>
                <button className="s-btn s-btn-quiet" type="button" disabled={demo.busy} onClick={demo.start}>
                  {demo.busy ? "Opening the demo" : "Open the demo instead"}
                </button>
              </div>
            )}
          </div>
          <AuthPanel onAuthed={onAuthed} googleClientId={googleClientId} inviteRequired={inviteRequired} initialTab={tab} />
        </div>
      </section>
    </SitePage>
  );
}

function Pricing() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("hosting");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent, which: string) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setMsg(""); setOk(false);
    try {
      await api("/api/waitlist", { method: "POST", body: { email: email.trim(), interest: which || interest } });
      setOk(true);
      setMsg("You're on the list. We'll email you when hosting opens.");
      setEmail("");
    } catch (err) {
      setMsg(niceError(err));
    }
    setBusy(false);
  }

  return (
    <section className="s-section" id="pricing" aria-labelledby="pricing-title" style={{ scrollMarginTop: 68 }}>
      <div className="s-wrap">
        <div className="s-head">
          <p className="s-eyebrow">Pricing</p>
          <h2 id="pricing-title">Own it free, or let us run it</h2>
          <p className="s-lead">Every learning feature is in the free, open-source version. Hosting is for people who would rather not run a server.</p>
        </div>
        <div className="s-plans">
          <div className="s-plan">
            <h3>Self-host</h3>
            <p className="s-price">Free <small>forever</small></p>
            <ul>
              <li><CheckIcon /><span>Every feature, no limits and no feature flags</span></li>
              <li><CheckIcon /><span>Your server, your database, your uploads</span></li>
              <li><CheckIcon /><span>Any AI provider, or fully offline</span></li>
            </ul>
            <a className="s-btn s-btn-primary" {...linkProps("self-host")}>Self-host guide</a>
          </div>
          <div className="s-plan is-featured">
            <h3>Hosted for families</h3>
            <p className="s-price">From $9 <small>per family, per month</small></p>
            <ul>
              <li><CheckIcon /><span>We run the server, updates and backups</span></li>
              <li><CheckIcon /><span>Bring your own AI key, or included generation up to a clear cap</span></li>
              <li><CheckIcon /><span>AI spending shown honestly, per family</span></li>
            </ul>
            <form className="s-wait" onSubmit={(e) => join(e, interest)}>
              <label className="s-note" htmlFor="wait-email">Hosting opens soon. Join the list:</label>
              <div className="s-wait-row">
                <input id="wait-email" className="s-input" type="email" required placeholder="you@example.org" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="s-btn s-btn-primary" type="submit" disabled={busy}>{busy ? "Joining" : "Join"}</button>
              </div>
              <select className="s-input" aria-label="What are you interested in?" value={interest} onChange={(e) => setInterest(e.target.value)}>
                <option value="hosting">Hosting for my family</option>
                <option value="coop">A co-op, school or district</option>
                <option value="pilot">Running a pilot with you</option>
                <option value="updates">Just updates</option>
              </select>
              {msg && <span className={ok ? "s-note" : "s-form-error"} role="status">{msg}</span>}
            </form>
          </div>
          <div className="s-plan">
            <h3>Schools, co-ops and districts</h3>
            <p className="s-price">Let's talk <small>one invoice</small></p>
            <ul>
              <li><CheckIcon /><span>Hosted or on your own infrastructure with support</span></li>
              <li><CheckIcon /><span>Many families or classes under one account</span></li>
              <li><CheckIcon /><span>Pilot programmes with teachers in the loop</span></li>
            </ul>
            <a className="s-btn s-btn-quiet" href="/#pricing" onClick={(e) => { e.preventDefault(); setInterest("coop"); document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" }); window.setTimeout(() => document.getElementById("wait-email")?.focus(), 320); }}>Tell us about your school</a>
          </div>
        </div>
      </div>
    </section>
  );
}
