// SPDX-License-Identifier: AGPL-3.0-or-later
// The public site's content lives in server/lib/site.json so the server can
// build page heads, the sitemap, robots.txt and llms.txt from the same list
// the pages render. Add a page, a feature or an audience there, not here.
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/alegreya/500.css";
import "@fontsource/alegreya/500-italic.css";
import "@fontsource/alegreya/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./site.css";
import raw from "../../../server/lib/site.json";

export interface SitePage { path: string; title: string; description: string; section: string; priority?: string }
export interface Feature { name: string; detail: string }
export interface Pillar { id: string; numeral: string; title: string; line: string; features: Feature[] }
export interface Need { title: string; body: string; pillar: string }
export interface Audience {
  slug: string; label: string; short: string; eyebrow: string; title: string; lead: string;
  needs: Need[]; steps: string[]; courseTag: string; note?: string;
}
export interface Site {
  name: string; tagline: string; summary: string; repo: string;
  pages: SitePage[]; facts: { value: string; label: string }[];
  pillars: Pillar[]; roadmap: Feature[]; audiences: Audience[];
}

export const SITE = raw as Site;
export const REPO = SITE.repo;

export function pillarById(id: string): Pillar | undefined {
  return SITE.pillars.find((p) => p.id === id);
}

export function audienceBySlug(slug: string): Audience | undefined {
  return SITE.audiences.find((a) => a.slug === slug);
}

export function pageByPath(path: string): SitePage | undefined {
  return SITE.pages.find((p) => p.path === path);
}
