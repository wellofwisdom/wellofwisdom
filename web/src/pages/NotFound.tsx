// SPDX-License-Identifier: AGPL-3.0-or-later
// The console's "that page does not exist". Before this, an unknown path
// rendered the Shell around nothing, which read as a broken app rather than a
// wrong link. PublicNotFound is the logged-out twin: a bogus URL served to a
// visitor who never signed in gets the public site's chrome and way out, not
// the signed-in console's card. App.tsx picks between them by session state.
import { linkProps } from "../router";
import Logo from "../components/Logo";
import { SitePage } from "../site/SiteChrome";

export default function NotFound({ path }: { path: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: "48px auto", textAlign: "center" }}>
      <div><Logo size={64} /></div>
      <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>That page does not exist</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Nothing lives at <code>/{path}</code>. The link may be old, or a letter may be off.
      </p>
      <a className="btn primary" {...linkProps("dashboard")}>Back to the dashboard</a>
    </div>
  );
}

export function PublicNotFound({ path }: { path: string }) {
  return (
    <SitePage>
      <section className="s-night s-page-hero">
        <div className="s-wrap">
          <p className="s-crumbs"><a {...linkProps("dashboard")}>Home</a> / Page not found</p>
          <p className="s-eyebrow" style={{ marginTop: 18 }}>404</p>
          <h1>We could not find that page</h1>
          <p className="s-lead">
            Nothing lives at <code>/{path}</code>. The link may be old, or a letter may be off.
          </p>
          <div className="s-cta-row" style={{ marginTop: 26 }}>
            <a className="s-btn s-btn-primary" {...linkProps("dashboard")}>Go to the home page</a>
            <a className="s-btn s-btn-quiet" {...linkProps("c")}>Browse open courses</a>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
