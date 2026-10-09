// SPDX-License-Identifier: AGPL-3.0-or-later
// The one central route -> document.title map, applied in App.tsx on route
// change. Before this, every signed-in page shared the shell's generic
// <title>, so browser history and screen readers could not tell Learners
// from Calendar. Page components never set their own title: a new route adds
// one line here instead. Public pages already get their titles from the
// server (server/lib/seo.js reads the same site.json this module reads), so
// client-side navigation answers with the same words the HTML was served
// with. Detail pages fall back to a generic plus the id, and take a real
// name only from state App already holds: no fetch is made just for a title.

import { SITE, pageByPath } from "./site/data";

export type TitleSession = "public" | "guide" | "learner";

export interface TitleInput {
  route: string;
  session: TitleSession;
  /** The guide's course list App keeps for the palette, or undefined. */
  courseTitle?: (id: number) => string | undefined;
  /** The family's learners that arrived with /api/me, or undefined. */
  learnerName?: (id: number) => string | undefined;
}

const BRAND = SITE.name;

/** "{Page} · {brand}": brand as suffix, the pattern the public pages follow. */
function branded(page: string): string {
  return `${page} · ${BRAND}`;
}

// Guide console routes, worded like the heading the Shell already shows for
// each one (web/src/components/Shell.tsx).
const GUIDE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  learners: "Learners",
  "learners/new": "Add a learner",
  "roster-import": "Import roster",
  studio: "Course Studio",
  courses: "Courses",
  community: "Community",
  records: "Progress",
  tutor: "Tutor",
  work: "Submitted Work",
  attendance: "Attendance and Assessments",
  plans: "Learning Paths",
  notes: "Workspace",
  library: "Library",
  calendar: "Calendar",
  "plans/new": "Plan Assistant",
  settings: "Settings",
  experience: "Experience",
};

// Learner app routes (web/src/pages/learn/LearnerApp.tsx). Unmatched learner
// routes render the learner home, so they title as Home too.
const LEARNER_TITLES: Record<string, string> = {
  "": "Home",
  home: "Home",
  practice: "Practice",
};

function guideTitle(route: string, input: TitleInput): string {
  const exact = GUIDE_TITLES[route];
  if (exact) return branded(exact);
  let m = route.match(/^learners\/(\d+)$/);
  if (m) {
    const name = input.learnerName?.(Number(m[1]));
    return branded(name || `Edit learner ${m[1]}`);
  }
  m = route.match(/^course\/(\d+)$/);
  if (m) {
    const name = input.courseTitle?.(Number(m[1]));
    return branded(name || `Course ${m[1]}`);
  }
  m = route.match(/^plan\/(\d+)$/);
  if (m) return branded(`Learning path ${m[1]}`);
  m = route.match(/^report\/(\d+)$/);
  if (m) return branded(`Progress report ${m[1]}`);
  m = route.match(/^portfolio\/(\d+)$/);
  if (m) {
    const name = input.learnerName?.(Number(m[1]));
    return branded(name ? `Portfolio: ${name}` : `Portfolio ${m[1]}`);
  }
  if (route.startsWith("print/lesson/")) return branded("Print lesson");
  // Unknown console path: the Shell renders NotFound around it.
  return branded("Page not found");
}

function learnerTitle(route: string): string {
  const exact = LEARNER_TITLES[route];
  if (exact) return branded(exact);
  const m = route.match(/^(?:course|world)\/(\d+)$/);
  if (m) return branded(`${route.startsWith("course/") ? "Course" : "World"} ${m[1]}`);
  if (route.startsWith("lesson/")) return branded("Lesson");
  if (route.startsWith("print/lesson/")) return branded("Print lesson");
  return branded("Home");
}

/** The title for one route, or null to leave document.title alone (the public
 *  course page: the server already injected the specific course name into the
 *  HTML, and overwriting it with a generic would be a downgrade). */
export function titleFor(input: TitleInput): string | null {
  const { route, session } = input;

  // Public site pages render for every session, before the session gate in
  // App, so they come first here too. Their titles are site.json's own words,
  // the same the server put in the HTML on a fresh load.
  if (route === "c") return pageByPath("c")?.title ?? branded("Open courses");
  const page = pageByPath(route);
  if (page) return page.title;
  if (/^c\/[A-Za-z0-9-]+$/.test(route)) return null;
  if (/^join\/[A-Za-z0-9_-]+$/.test(route)) return branded("Join a family");

  if (session === "learner") return learnerTitle(route);
  if (session === "guide") return guideTitle(route, input);

  // Logged out: the root is the landing page, everything else that reached
  // the session gate is the public 404.
  if (route === "dashboard") return pageByPath("")?.title ?? branded("Home");
  return branded("Page not found");
}
