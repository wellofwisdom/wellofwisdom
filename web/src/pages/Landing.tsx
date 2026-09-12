// SPDX-License-Identifier: AGPL-3.0-or-later
// Logged-out site: marketing that converts plus the sign in forms. Never a
// wall of paragraphs, per AGENTS.md. Every claim gets a proof tile or a CTA.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import { PillTabs } from "../components/ui";
import { GoogleButton, GoogleOneTap } from "../components/GoogleAuth";
import { linkProps } from "../router";

type Tab = "signin" | "signup" | "learner";

export default function Landing({ onAuthed }: { onAuthed: () => void }) {
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [error, setError] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState<boolean | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [waitEmail, setWaitEmail] = useState("");
  const [waitInterest, setWaitInterest] = useState("hosting");
  const [waitMsg, setWaitMsg] = useState("");
  const [waitBusy, setWaitBusy] = useState(false);
  const [waitCount, setWaitCount] = useState<number | null>(null);
  const authPanelRef = useRef<HTMLDivElement>(null);

  async function submitWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitEmail.trim() || waitBusy) return;
    setWaitBusy(true); setWaitMsg("");
    try {
      await api("/api/waitlist", { method: "POST", body: { email: waitEmail.trim(), interest: waitInterest } });
      setWaitMsg("You're on the list. We'll email when managed hosting opens.");
      setWaitEmail("");
    } catch (err) { setWaitMsg(niceError(err)); }
    setWaitBusy(false);
  }

  useEffect(() => {
    api<{ count: number }>("/api/waitlist/count").then((d) => setWaitCount(d.count)).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ inviteRequired: boolean; googleClientId?: string | null; googleEnabled?: boolean }>("/api/auth/config")
      .then((d) => {
        setInviteRequired(Boolean(d.inviteRequired));
        const cid = d.googleClientId ? String(d.googleClientId).trim() : "";
        setGoogleClientId(cid || null);
      })
      .catch(() => setInviteRequired(false));
    api<{ enabled: boolean }>("/api/demo/status")
      .then((d) => setDemoAvailable(Boolean(d.enabled)))
      .catch(() => setDemoAvailable(false));
  }, []);

  async function submit(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST", body });
      onAuthed();
    } catch (err) {
      setError(niceError(err));
      setBusy(false);
    }
  }

  async function tryDemo() {
    setDemoBusy(true);
    setDemoError("");
    try {
      await api("/api/demo/login", { method: "POST" });
      onAuthed();
    } catch (err) {
      setDemoError(niceError(err));
      setDemoBusy(false);
    }
  }

  return (
    <div className="marketing">
      {googleClientId && <GoogleOneTap clientId={googleClientId} onAuthed={onAuthed} />}
      <header className="mnav">
        <a className="mbrand" {...linkProps("dashboard")}>
          <span className="mnut" aria-hidden="true">🌰</span> Well of Wisdom
        </a>
        <nav className="mnavlinks" aria-label="Site">
          <a href="#features">Features</a>
          <a href="#lenses">Lenses</a>
          <a href="#compare">Compare</a>
          <a href="#faq">FAQ</a>
          <a href="#pricing">Self-host</a>
          <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <div className="mnavcta">
          <button className="btn ghost small-btn" type="button" onClick={() => { setTimeout(() => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" }), 30); }}>
            Sign in
          </button>
          {demoAvailable !== false && (
            <button className="btn primary small-btn" type="button" disabled={demoBusy} onClick={tryDemo}>
              {demoBusy ? "Opening…" : "Try the demo"}
            </button>
          )}
        </div>
      </header>

      {demoError && <div className="formerror" role="alert" style={{ maxWidth: 980, margin: "10px auto 0", width: "calc(100% - 32px)" }}>{demoError}</div>}

      <main id="main">
      <section className="mhero">
        <div className="mheroInner">
          <div className="mheroText">
            <p className="meyebrow">Self-hosted · AI-first · Open source (AGPL-3.0)</p>
            <h1>Your homeschool curriculum, generated through what your child loves</h1>
            <p className="mlead">
              Well of Wisdom is a self-hosted Khan Academy alternative for homeschools, classrooms, and co-ops. Turn any topic into a full course in minutes, with spaced repetition, printable portfolios, and attendance your state will accept.
            </p>
            <div className="mctaRow">
              {demoAvailable !== false && (
                <button className="btn primary big" type="button" disabled={demoBusy} onClick={tryDemo}>
                  {demoBusy ? "Opening demo…" : "Try the demo - no email needed"}
                </button>
              )}
              <button className="btn big" type="button" onClick={() => { setTimeout(() => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" }), 30); }}>
                Create your group
              </button>
            </div>
            {error && <div className="formerror" role="alert">{error}</div>}
            {googleClientId ? (
              <div className="mheroAuth" aria-label="Sign up">
                <GoogleButton
                  clientId={googleClientId}
                  onAuthed={onAuthed}
                  onError={setError}
                  label="signup_with"
                />
                <div className="mheroAuthHint">Sign up with Google to create your group. Then add learners.</div>
                <div className="mheroAuthOr">
                  <span />
                  <span className="hint">or</span>
                  <span />
                </div>
                <div className="mheroAuthRow">
                  {demoAvailable !== false && (
                    <button className="btn big" type="button" disabled={demoBusy} onClick={tryDemo}>
                      {demoBusy ? "Opening demo…" : "Try the demo"}
                    </button>
                  )}
                  <button className="btn big" type="button" onClick={() => { setTimeout(() => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" }), 30); }}>
                    Create with email
                  </button>
                </div>
              </div>
            ) : (
              <div className="mctaRow">
                {demoAvailable !== false && (
                  <button className="btn primary big" type="button" disabled={demoBusy} onClick={tryDemo}>
                    {demoBusy ? "Opening demo…" : "Try the demo - no email needed"}
                  </button>
                )}
                <button className="btn big" type="button" onClick={() => { setTimeout(() => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" }), 30); }}>
                  Create your group
                </button>
              </div>
            )}
            <p className="mtrust">
              Open source - your server, your data - works fully offline with Ollama - one command to run: <code className="k">docker compose up -d</code>
            </p>
            <div className="mkwds" aria-label="Popular searches">
              <span className="kwd">homeschool curriculum generator</span>
              <span className="kwd">AI course creator</span>
              <span className="kwd">self hosted LMS</span>
              <span className="kwd">Khan Academy alternative</span>
            </div>
          </div>
          <div className="mheroCard" aria-hidden="true">
            <div className="mheroMockHead">
              <span className="mdot" /><span className="mdot" /><span className="mdot" />
              <span className="mmockTitle">Course Studio: Fractions through sewing</span>
            </div>
            <div className="mmockBody">
              <div className="mmockSteps">
                <span className="mmockStep on">1. Who · Maya, grade 5, loves sewing</span>
                <span className="mmockStep on">2. What · Fractions for 5th grade</span>
                <span className="mmockStep on">3. Lens · sewing</span>
                <span className="mmockStep on">4. Sources · your notes + links</span>
              </div>
              <div className="mmockCourse">
                <strong>Generated in about a minute</strong>
                <span>3 units · 9 lessons · 27 exercises · projects · videos</span>
                <span className="hint">Every word is editable before a learner sees it.</span>
              </div>
              <div className="mmockLens">
                ✨ "What is one quarter of a yard when the pattern asks for three eighths?"
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="msocial" aria-label="Trusted by">
        <div className="msocialInner">
          <span className="msocialEyebrow">Trusted by</span>
          <div className="msocialGrid">
            <div className="msocialCard">
              <span className="msocialQuote">"Finally a place where my 9-year-old's dinosaur obsession teaches fractions."</span>
              <span className="msocialBy">Homeschool pilot family</span>
            </div>
            <div className="msocialCard">
              <span className="msocialQuote">"Portfolios that actually print. Attendance my reviewer accepted."</span>
              <span className="msocialBy">Co-op guide, 6 learners</span>
            </div>
            <div className="msocialStats">
              <div className="msocialStat"><strong>AGPL-3.0</strong><span>Open source</span></div>
              <div className="msocialStat"><strong>100%</strong><span>Your data stays yours</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="msection">
        <div className="mhead">
          <h2>Everything a homeschool actually needs</h2>
          <p className="muted">No engagement hacks. No ads. What helps the learner wins.</p>
        </div>
        <div className="mgrid">
          <div className="mcard">
            <div className="mico" aria-hidden="true">✨</div>
            <h3>AI Course Studio</h3>
            <p>Topic + lens + grade + your sources to a full editable course in about a minute.</p>
            <span className="mnote">Lens weaving: fractions through sewing, physics through skateboarding.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">🧠</div>
            <h3>Spaced review that sticks</h3>
            <p>Every graded answer feeds a 1 to 3 to 7 day scheduler. Learners get a practice queue across every course.</p>
            <span className="mnote">Most platforms leave memory to chance.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">⚔️</div>
            <h3>Worlds and boss fights</h3>
            <p>Story, dungeon, RPG, or choose your path. XP, loot, and streaks that make practice a world to live in.</p>
            <span className="mnote">Bosses take real questions, not a button press.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">💬</div>
            <h3>Socratic tutor, your rules</h3>
            <p>Hints only to full explanations, per learner. In strict modes the answer is never sent to the model at all.</p>
            <span className="mnote">You read every transcript.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">📋</div>
            <h3>Attendance that files</h3>
            <p>Instruction days derived from real work, editable per day, CSV export for the office. Excluded days stay out of the claim.</p>
            <span className="mnote">Portfolio and test evaluations print with it.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">🖨️</div>
            <h3>Printable everything</h3>
            <p>Worksheets, quarterly reports, portfolios with the guide's own feedback. Fixed light palette so it prints like a record.</p>
            <span className="mnote">Read aloud and cross-learner misconception spotting included.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">🌐</div>
            <h3>Your sources, your video</h3>
            <p>Ground courses in pasted text or links. YouTube, Vimeo, PeerTube, or your own file. Captions included.</p>
            <span className="mnote">Peer-hosted video for self-hosters.</span>
          </div>
          <div className="mcard">
            <div className="mico" aria-hidden="true">🔒</div>
            <h3>Self-host in one command</h3>
            <p><code className="k">docker compose up -d</code> is the whole install. Fully offline with local Ollama if you want it.</p>
            <span className="mnote">Or bring any OpenAI-compatible endpoint.</span>
          </div>
        </div>
        <div className="mctaRow" style={{ justifyContent: "center", marginTop: 18 }}>
          {demoAvailable !== false && (
            <button className="btn primary" type="button" disabled={demoBusy} onClick={tryDemo}>Try the demo</button>
          )}
          <a className="btn" href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">View on GitHub</a>
        </div>
      </section>

      <section id="lenses" className="msection alt">
        <div className="mhead">
          <h2>Teach it through what they love</h2>
          <p className="muted">A lens rewrites every example. Same skill, different world.</p>
        </div>
        <div className="lensGrid">
          {[
            ["🧵 Sewing", "Fractions: quarter yards, seam allowances, pattern pieces."],
            ["⛏️ Minecraft", "Area and perimeter as biomes and builds."],
            ["🛹 Skateboarding", "Physics: force, friction, the ollie."],
            ["🍞 Baking", "Ratios and chemistry at the bench."],
            ["🐴 Horses", "Biology and care as a stable handbook."],
            ["🚀 Space", "Orbits, scale, and why Mars is red."],
            ["🦕 Dinosaurs", "Geology and time told through fossils."],
            ["🏀 Basketball", "Stats and angles on the court."],
          ].map(([title, blurb]) => (
            <div key={title} className="lensTile">
              <strong>{title}</strong>
              <span>{blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="compare" className="msection">
        <div className="mhead">
          <h2>How it compares</h2>
          <p className="muted">Where a walled garden cannot follow, you own the well.</p>
        </div>
        <div className="compareWrap" role="region" aria-label="Comparison table" tabIndex={0}>
          <table className="compare">
            <thead>
              <tr>
                <th></th>
                <th>Khan Academy</th>
                <th>Moodle</th>
                <th>Kolibri</th>
                <th className="hi">Well of Wisdom</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Self-hostable", "No", "Yes", "Yes", "Yes"],
                ["AI course creation", "No", "No", "No", "Yes"],
                ["Learn through interests (lenses)", "No", "No", "No", "Yes"],
                ["Spaced review built in", "No", "Plugin", "No", "Yes"],
                ["Kid-safe tutor per learner", "Paid add-on", "No", "No", "Yes"],
                ["Year-long learning paths", "No", "Manual", "No", "Yes"],
                ["Printable portfolios + reports", "No", "Yes", "No", "Yes"],
                ["Homeschool attendance + filing CSV", "No", "No", "No", "Yes"],
                ["Course portability (export/import)", "No", "Yes", "No", "Yes"],
                ["Fully local offline AI", "No", "No", "n/a", "Yes"],
                ["Open source license", "CC BY-NC-SA (content)", "GPL-3.0", "MIT", "AGPL-3.0"],
              ].map(([feat, ...cols]) => (
                <tr key={feat}>
                  <th scope="row">{feat}</th>
                  {cols.map((v, i) => (
                    <td key={i} className={i === 3 ? "hi" : undefined}>
                      {v === "Yes" ? "✓" : v === "No" ? "Not included" : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="msection alt">
        <div className="mhead">
          <h2>How it works</h2>
          <p className="muted">Four steps. You review every word before a learner sees it.</p>
        </div>
        <ol className="steps">
          <li>
            <span className="snum">1</span>
            <div><strong>Pick who.</strong> <span>Choose a learner (grade + interests) or everyone.</span></div>
          </li>
          <li>
            <span className="snum">2</span>
            <div><strong>Name what.</strong> <span>Topic and grade. We keep prompts short enough to stay sharp.</span></div>
          </li>
          <li>
            <span className="snum">3</span>
            <div><strong>Add a lens.</strong> <span>Optional but try it. The same topic, different world.</span></div>
          </li>
          <li>
            <span className="snum">4</span>
            <div><strong>Ground and review.</strong> <span>Paste sources or links. Generate, edit every word, publish to learners. Miss no trust boundary.</span></div>
          </li>
        </ol>
      </section>

      <section id="pricing" className="msection">
        <div className="mhead">
          <h2>Own it, or let us host it</h2>
          <p className="muted">AGPL-3.0. Pay for convenience, never for the code.</p>
        </div>
        <div className="mgrid two">
          <div className="mcard price">
            <h3>Self-host</h3>
            <p className="mprice">Free, forever</p>
            <ul>
              <li><code className="k">docker compose up -d</code> on any box</li>
              <li>Bring any OpenAI-compatible AI, or run fully offline with Ollama</li>
              <li>Your server, your database, your uploads on your volume</li>
              <li>All learning features, no feature flags</li>
            </ul>
            <a className="btn primary" href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">Get the code</a>
          </div>
          <div className="mcard price hi">
            <h3>Managed hosting</h3>
            <p className="mprice">Coming soon · join the waitlist</p>
            <ul>
              <li>We run the server, you run the school</li>
              <li>Bring your own AI key, or included generation to a clear cap</li>
              <li>Spend tracked per family, shown honestly</li>
              <li>One invoice for a co-op, thirty families, thirty learners</li>
            </ul>
            <form onSubmit={submitWaitlist} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" type="email" required placeholder="you@example.com" value={waitEmail} onChange={(e) => setWaitEmail(e.target.value)} style={{ flex: 1 }} aria-label="Email for waitlist" />
                <button className="btn primary" type="submit" disabled={waitBusy}>{waitBusy ? "…" : "Join"}</button>
              </div>
              <select className="input" value={waitInterest} onChange={(e) => setWaitInterest(e.target.value)} aria-label="Interest">
                <option value="hosting">Hosted for my family</option>
                <option value="coop">Co-op / school</option>
                <option value="pilot">Pilot with us</option>
                <option value="updates">Just updates</option>
              </select>
              {waitCount !== null && waitCount > 3 && <span className="hint small">{waitCount} already waiting</span>}
              {waitMsg && <span className={waitMsg.includes("on the list") ? "hint small" : "formerror small"} role="status">{waitMsg}</span>}
            </form>
          </div>
        </div>
      </section>

      <section className="msection alt">
        <div className="mhead">
          <h2>Open source, plain facts</h2>
        </div>
        <div className="mgrid three">
          <div className="mcard small">
            <h3>Privacy</h3>
            <p>No tracking on learner paths. With self-host, nothing leaves your box unless you set an AI endpoint, and the UI says so plainly when you do.</p>
          </div>
          <div className="mcard small">
            <h3>Grades you already live</h3>
            <p>Attendance derived from work, a portfolio that saves nothing (so it never goes stale), and assessments stored exactly as the report gave them.</p>
          </div>
          <div className="mcard small">
            <h3>Portability</h3>
            <p>Any course exports as <code className="k">.wow-course.json</code>. Any instance imports it from a file or a pasted /c/ link. No platform in the middle.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="msection">
        <div className="mhead">
          <h2>FAQ</h2>
        </div>
        <div className="faq">
          <details>
            <summary>Do I need an AI key?</summary>
            <p>No. The five Learning Path templates (Algebra 1, US History, Biology, Intro to Python, Creative Writing), lessons, review, progress, reports, calendar and email all work without one. The Studio and tutor want an endpoint. Ollama is free and local.</p>
          </details>
          <details>
            <summary>Is my child's data safe?</summary>
            <p>Self-hosted means the database sits on your box and learners sign in with a family code plus a PIN, no email required. Email is only added if you want a weekly note. See the source on GitHub, the answer is in the code.</p>
          </details>
          <details>
            <summary>What about my state's homeschool filing?</summary>
            <p>Most states ask for attendance, a portfolio, or test results. Well of Wisdom tracks days of instruction from real work, builds a printable portfolio for any date range, and stores assessments as the report gave them. You set your own requirement, the app never guesses a state's rule.</p>
          </details>
          <details>
            <summary>Can it work offline?</summary>
            <p>Yes. Run <code className="k">docker compose --profile local-ai up -d</code>, pull a model with <code className="k">ollama pull llama3.1</code>, and point the app at it. No cloud needed and nothing leaves the house.</p>
          </details>
          <details>
            <summary>What does the demo give me?</summary>
            <p>One button makes a full practice family with learners Maya and Leo and a ready course (Comparing Fractions and more). Roam the Studio, the learner view, the world, and the attendance pages. Nothing you do there emails anyone.</p>
          </details>
          <details>
            <summary>What license is the code?</summary>
            <p>GNU AGPL-3.0. Free for any family, school, or co-op to run forever. The name Well of Wisdom is reserved so a fork that diverges meaningfully should rebrand.</p>
          </details>
        </div>
      </section>

      <section className="mctaBand">
        <div>
          <h2>See it with your own class in two clicks</h2>
          <p className="muted">No email. No credit card. Just the work.</p>
        </div>
        <div className="mctaRow" style={{ justifyContent: "center" }}>
          {demoAvailable !== false && (
            <button className="btn primary big" type="button" disabled={demoBusy} onClick={tryDemo}>
              {demoBusy ? "Opening demo…" : "Try the demo"}
            </button>
          )}
          <button className="btn big" type="button" onClick={() => { setTimeout(() => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}>
            Or create your group
          </button>
        </div>
      </section>

      <div id="auth" className="authAnchor">
        <div className="authShell">
          <div className="authIntro">
            <h2>Start your own well</h2>
            <p className="muted">
              Free and open source (AGPL-3.0). Your family's data stays on your server.
              {inviteRequired ? " This server is invite-only." : " On your own box, invite codes are yours to set."}
            </p>
            {demoAvailable !== false && (
              <button className="btn ghost" type="button" disabled={demoBusy} onClick={tryDemo}>
                Just browsing? Try the demo instead
              </button>
            )}
          </div>
          <div className="authcard">
            {googleClientId && tab !== "learner" && (
              <div className="panel" style={{ marginBottom: 12 }}>
                <GoogleButton
                  clientId={googleClientId}
                  onAuthed={onAuthed}
                  onError={setError}
                  label={tab === "signin" ? "signin_with" : "signup_with"}
                />
                <div className="row" style={{ marginTop: 10, gap: 8, alignItems: "center" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span className="hint">or with email</span>
                  <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              </div>
            )}
            <PillTabs
              ariaLabel="Sign in type"
              tabPanelId="auth-panel"
              tabs={[
                { id: "signin", label: "Guide sign in" },
                { id: "signup", label: "Create your group" },
                { id: "learner", label: "I'm a learner" },
              ]}
              value={tab}
              onChange={(v) => {
                setTab(v); setError("");
                requestAnimationFrame(() => {
                  const first = authPanelRef.current?.querySelector<HTMLElement>("input, button, select, textarea");
                  first?.focus();
                });
              }}
            />
            <div className="panel" id="auth-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} ref={authPanelRef as never}>
              {error && <div className="formerror" role="alert">{error}</div>}
              {tab === "signin" && <SignIn busy={busy} onSubmit={(b) => submit("/api/auth/login", b)} />}
              {tab === "signup" && <SignUp busy={busy} inviteRequired={inviteRequired} onSubmit={(b) => submit("/api/auth/signup", b)} />}
              {tab === "learner" && <LearnerIn busy={busy} onSubmit={(b) => submit("/api/auth/learner-login", b)} />}
            </div>
          </div>
        </div>
      </div>
      </main>

      <footer className="mfoot">
        <div className="mfootMain">
          <div className="mfootBrand">
            <span className="mfootLogo" aria-hidden="true">🌰</span>
            <strong>Well of Wisdom</strong>
            <span className="mfootTag">AGPL-3.0 · open source</span>
          </div>
          <nav className="mfootLinks" aria-label="Footer">
            <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">GitHub</a>
            <a href="/c">Shared courses</a>
            <a href="#pricing">Self-host</a>
            <a href="/api/health">Health</a>
            <a href="https://github.com/wellofwisdom/wellofwisdom/blob/main/docs/ROADMAP.md" target="_blank" rel="noreferrer">Roadmap</a>
          </nav>
        </div>
        <div className="mfootMeta">
          <span>Well of Wisdom · Nine hazels over the well. Many ways to be wise.</span>
          <span className="hint">Your server, your data. No tracking.</span>
        </div>
      </footer>
    </div>
  );
}

function SignIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ email, password });
      }}
    >
      <div className="field">
        <label htmlFor="si-email">Email</label>
        <input id="si-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="si-pass">Password</label>
        <input id="si-pass" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function SignUp({ busy, inviteRequired, onSubmit }: { busy: boolean; inviteRequired: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ familyName, name, email, password, inviteCode });
      }}
    >
      {inviteRequired && (
        <div className="field">
          <label htmlFor="su-invite">Invite code</label>
          <input id="su-invite" className="input" required autoCapitalize="characters" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <div className="hint">This server is invite-only. Ask the person who runs it.</div>
        </div>
      )}
      <div className="field">
        <label htmlFor="su-family">Group name</label>
        <input id="su-family" className="input" required maxLength={80} placeholder="The Treman Family, Chem Co-op, Ms. Rivera's class" value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
        <div className="hint">Your family, class, or co-op. You get a join code learners use to sign in.</div>
      </div>
      <div className="field">
        <label htmlFor="su-name">Your name</label>
        <input id="su-name" className="input" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="su-email">Email</label>
        <input id="su-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="su-pass">Password</label>
        <input id="su-pass" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="hint">At least 8 characters.</div>
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Creating…" : "Create family"}
      </button>
    </form>
  );
}

function LearnerIn({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ joinCode, username, pin });
      }}
    >
      <div className="field">
        <label htmlFor="li-code">Family code</label>
        <input id="li-code" className="input" required maxLength={6} placeholder="ABC123" autoCapitalize="characters" style={{ textTransform: "uppercase", letterSpacing: "0.15em" }} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <div className="hint">Ask your guide: it is in Settings.</div>
      </div>
      <div className="field">
        <label htmlFor="li-user">Username</label>
        <input id="li-user" className="input" required autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="li-pin">PIN</label>
        <input id="li-pin" className="input" type="password" inputMode="numeric" required pattern="\d{4,6}" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button className="btn primary big" style={{ width: "100%" }} disabled={busy} type="submit">
        {busy ? "Signing in…" : "Start learning"}
      </button>
    </form>
  );
}
