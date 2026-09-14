// SPDX-License-Identifier: AGPL-3.0-or-later
import { linkProps } from "../../router";

export function LegalChrome({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="publicwrap" style={{ paddingBottom: 64 }}>
      <div className="publicbanner">
        <a {...linkProps("dashboard")} className="brand">🌰 Well of Wisdom</a>
        <span className="grow" />
        <a {...linkProps("c")} className="btn ghost">Shared courses</a>
        <a href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noopener noreferrer" className="btn ghost">GitHub</a>
      </div>
      <main id="main">
        <p className="muted small"><a {...linkProps("dashboard")} className="muted small">← Home</a></p>
        <h1 style={{ fontSize: 28 }}>{title}</h1>
        {updated && <p className="muted small">Last updated: {updated}</p>}
        <div className="panel" style={{ marginTop: 18, lineHeight: 1.65 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
