// SPDX-License-Identifier: AGPL-3.0-or-later
// The console's "that page does not exist". Before this, an unknown path
// rendered the Shell around nothing, which read as a broken app rather than a
// wrong link.
import { linkProps } from "../router";

export default function NotFound({ path }: { path: string }) {
  return (
    <div className="card" style={{ maxWidth: 520, margin: "48px auto", textAlign: "center" }}>
      <div aria-hidden="true" style={{ fontSize: 40 }}>🌰</div>
      <h1 style={{ fontSize: 22, margin: "8px 0 6px" }}>That page does not exist</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Nothing lives at <code>/{path}</code>. The link may be old, or a letter may be off.
      </p>
      <a className="btn primary" {...linkProps("dashboard")}>Back to the dashboard</a>
    </div>
  );
}
