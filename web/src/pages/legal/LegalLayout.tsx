// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from "react";
import { linkProps } from "../../router";
import { SitePage, usePageTitle } from "../../site/SiteChrome";

export function LegalChrome({ title, updated, path, children }: { title: string; updated?: string; path: string; children: ReactNode }) {
  usePageTitle(path);
  return (
    <SitePage>
      <section className="s-night s-page-hero">
        <div className="s-wrap">
          <p className="s-crumbs"><a {...linkProps("dashboard")}>Home</a> / {title}</p>
          <h1 style={{ marginTop: 18 }}>{title}</h1>
          {updated && <p className="s-lead">Last updated {updated}</p>}
        </div>
      </section>
      <div className="s-wrap">
        <article className="s-legal">{children}</article>
      </div>
    </SitePage>
  );
}
