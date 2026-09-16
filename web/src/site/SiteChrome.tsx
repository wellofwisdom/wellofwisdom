// SPDX-License-Identifier: AGPL-3.0-or-later
// Header, footer and page frame shared by every public page.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, niceError } from "../api";
import { linkProps, go } from "../router";
import { SITE, REPO, pageByPath } from "./data";

/** Open the demo from any public page. The app re-reads the session on load,
 *  so a full navigation to the root is the simplest way into the new family. */
let demoStatus: Promise<boolean> | null = null;
function demoEnabled(): Promise<boolean> {
  // One request per page load, however many demo buttons the page shows.
  if (!demoStatus) demoStatus = api<{ enabled: boolean }>("/api/demo/status").then((d) => Boolean(d.enabled)).catch(() => false);
  return demoStatus;
}

export function useDemo(onAuthed?: () => void) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    demoEnabled().then((ok) => { if (live) setAvailable(ok); });
    return () => { live = false; };
  }, []);
  async function start() {
    setBusy(true); setError("");
    try {
      await api("/api/demo/login", { method: "POST" });
      if (onAuthed) { go("dashboard"); onAuthed(); } else window.location.assign("/");
    } catch (err) {
      setError(niceError(err));
      setBusy(false);
    }
  }
  return { available, busy, error, start };
}

/** Title and description for client-side navigation between public pages; the
 *  server already sends them on a fresh load. */
export function usePageTitle(path: string) {
  useEffect(() => {
    const p = pageByPath(path);
    if (!p) return;
    document.title = p.title;
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute("content", p.description);
  }, [path]);
}

export function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20c0-9 6-15 16-16-1 10-7 16-16 16Z" fill="currentColor" opacity=".9" />
      <path d="M4.5 19.5 14 10" stroke="#0b1a2a" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".55" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10.5 8 14.5 16 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Wordmark() {
  return <span className="s-wordmark">WELL <small>OF</small> WISDOM</span>;
}

function SiteHeader({ onStart }: { onStart?: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const demo = useDemo();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) menuRef.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const signIn = () => {
    if (onStart) onStart();
    else window.location.assign("/#start");
  };

  return (
    <header className={`s-header${open ? " is-open" : ""}`}>
      <div className="s-wrap s-header-in">
        <a className="s-brand" {...linkProps("dashboard")} aria-label="Well of Wisdom home">
          <img src="/logo-96.png" alt="" width={38} height={38} />
          <Wordmark />
        </a>
        <nav className="s-nav" aria-label="Site">
          <a {...linkProps("features")}>Features</a>
          <details className="s-menu" ref={menuRef}>
            <summary>Who it's for</summary>
            <div className="s-menu-panel">
              {SITE.audiences.map((a) => (
                <a key={a.slug} {...linkProps(a.slug)}>
                  {a.label}
                  <span>{a.lead.split(". ")[0]}.</span>
                </a>
              ))}
            </div>
          </details>
          <a {...linkProps("c")}>Open courses</a>
          <a href="/#pricing">Pricing</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="s-nav-signin" href="/#start" onClick={(e) => { if (onStart) { e.preventDefault(); setOpen(false); onStart(); } }}>Sign in</a>
        </nav>
        <div className="s-header-cta">
          <button className="s-btn s-btn-quiet s-btn-small s-hide-sm" type="button" onClick={signIn}>Sign in</button>
          {demo.available !== false && (
            <button className="s-btn s-btn-primary s-btn-small" type="button" disabled={demo.busy} onClick={demo.start}>
              {demo.busy ? "Opening" : "Try the demo"}
            </button>
          )}
        </div>
        <button className="s-btn s-btn-quiet s-btn-small s-burger" type="button" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {demo.error && <div className="s-wrap"><div className="s-form-error" role="alert">{demo.error}</div></div>}
    </header>
  );
}

function SiteFooter() {
  const legal = SITE.pages.filter((p) => p.section === "legal");
  return (
    <footer className="s-footer">
      <div className="s-wrap">
        <div className="s-footer-grid">
          <div className="s-footer-brand">
            <a className="s-brand" {...linkProps("dashboard")}>
              <img src="/logo-96.png" alt="" width={38} height={38} />
              <Wordmark />
            </a>
            <p>Open-source learning for every kind of teacher. Free to run yourself, forever.</p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a {...linkProps("features")}>Every feature</a></li>
              <li><a {...linkProps("c")}>Open courses</a></li>
              <li><a href="/#pricing">Pricing</a></li>
              <li><a href="/#start">Try the demo</a></li>
              <li><a href={`${REPO}/blob/main/docs/ROADMAP.md`} target="_blank" rel="noreferrer">Roadmap</a></li>
            </ul>
          </div>
          <div>
            <h4>Who it's for</h4>
            <ul>
              {SITE.audiences.map((a) => <li key={a.slug}><a {...linkProps(a.slug)}>{a.label}</a></li>)}
            </ul>
          </div>
          <div>
            <h4>Open source</h4>
            <ul>
              <li><a href={REPO} target="_blank" rel="noreferrer">Source on GitHub</a></li>
              <li><a {...linkProps("self-host")}>Self-host</a></li>
              <li><a href={`${REPO}/blob/main/docs/API.md`} target="_blank" rel="noreferrer">API reference</a></li>
              <li><a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">Changelog</a></li>
              <li><a href="/llms.txt">llms.txt</a></li>
            </ul>
          </div>
          <div>
            <h4>Trust</h4>
            <ul>
              {legal.map((p) => <li key={p.path}><a {...linkProps(p.path)}>{p.path === "children" ? "Children's data" : p.path === "privacy" ? "Privacy" : "Terms"}</a></li>)}
              <li><a href={`${REPO}/security/policy`} target="_blank" rel="noreferrer">Security</a></li>
              <li><a href="mailto:support@wellofwisdom.app">Email support</a></li>
              <li><a href={`${REPO}/blob/main/docs/PEDAGOGY.md`} target="_blank" rel="noreferrer">Pedagogy</a></li>
            </ul>
          </div>
        </div>
        <div className="s-footer-myth">
          <em>Nine hazels grow over the well. Wisdom comes in many flavours.</em>
          <span>AGPL-3.0 · No ads · No trackers</span>
        </div>
      </div>
    </footer>
  );
}

export function SitePage({ children, onStart }: { children: ReactNode; onStart?: () => void }) {
  return (
    <div className="site">
      <a className="s-skip" href="#main">Skip to content</a>
      <SiteHeader onStart={onStart} />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
