// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import Logo from "./components/Logo";
import { api, getPreviewLearner } from "./api";
import type { MeResponse } from "./types";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Learners from "./pages/Learners";
import LearnerForm from "./pages/LearnerForm";
import Courses from "./pages/Courses";
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
import Progress from "./pages/Progress";
import Plans from "./pages/Plans";
const Notes = lazy(() => import("./pages/Notes"));
import Community from "./pages/Community";
const Library = lazy(() => import("./pages/Library"));
import Calendar from "./pages/Calendar";
import ReportView from "./pages/ReportView";
const PlanWizard = lazy(() => import("./pages/PlanWizard"));
import PlanDetail from "./pages/PlanDetail";
const Settings = lazy(() => import("./pages/Settings"));
const Studio = lazy(() => import("./pages/Studio"));
import Experience from "./pages/Experience";
const LearnerApp = lazy(() => import("./pages/learn/LearnerApp"));
import PrintLesson from "./pages/PrintLesson";
import type { CourseSummary } from "./types";
import { go, routeFromLocation, ROUTE_EVENT } from "./router";
import { PublicGallery, PublicCourse } from "./pages/PublicCourse";
import TutorLog from "./pages/TutorLog";
import Work from "./pages/Work";
import Attendance from "./pages/Attendance";
import Portfolio from "./pages/Portfolio";
import Join from "./pages/Join";
import NotFound from "./pages/NotFound";
import PreviewBar, { restorePreview, clearPreview } from "./components/PreviewBar";
import { I18nContext, normalizeLang, tKey } from "./i18n";

// Public site pages. Which pages exist is decided by server/lib/site.json, so
// the sitemap, robots.txt, llms.txt and these routes can never disagree.
import { FeaturesPage, AudiencePage, SelfHostPage } from "./site/Pages";
import { SITE } from "./site/data";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Children from "./pages/legal/Children";

function Fallback() {
  return <div className="skel" style={{ width: "100%", height: 120 }} />;
}

function currentRoute(): string {
  return routeFromLocation();
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRouteState] = useState(currentRoute);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    const onRoute = () => setRouteState(currentRoute());
    // popstate = back/forward; ROUTE_EVENT = our own pushState navigations.
    window.addEventListener("popstate", onRoute);
    window.addEventListener(ROUTE_EVENT, onRoute);
    return () => {
      window.removeEventListener("popstate", onRoute);
      window.removeEventListener(ROUTE_EVENT, onRoute);
    };
  }, []);

  const navigate = useCallback((id: string) => go(id), []);

  // Preview must be restored BEFORE the session bootstrap, or /api/me answers
  // as the guide and the app flips back to the console on every reload.
  const [previewing, setPreviewing] = useState<{ id: number; name: string } | null>(() => restorePreview());

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>("/api/me");
      setMe(data);
    } catch {
      // A preview that the server will not honour (the learner was deleted, or
      // is no longer ours to see) must never read as "logged out", and must
      // never strand us in a session that cannot write. Drop it and ask again
      // as ourselves.
      if (getPreviewLearner()) {
        clearPreview();
        setPreviewing(null);
        try {
          setMe(await api<MeResponse>("/api/me"));
          return;
        } catch {
          /* genuinely logged out, fall through */
        }
      }
      setMe({ user: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep the palette's course list fresh whenever we land back on the console.
  useEffect(() => {
    if (me?.user?.role === "parent") {
      api<{ courses: CourseSummary[] }>("/api/courses")
        .then((d) => setCourses(d.courses))
        .catch(() => {});
    }
  }, [me, route]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    go("dashboard");
    refresh();
  }, [refresh]);

  // Public marketing and legal pages: reachable logged out, with no /api/me
  // wait. One block so every new public page only touches this section.
  const publicMap: Record<string, React.ReactElement> = {
    features: <FeaturesPage />,
    "self-host": <SelfHostPage />,
    privacy: <Privacy />,
    terms: <Terms />,
    children: <Children />,
    ...Object.fromEntries(SITE.audiences.map((a) => [a.slug, <AudiencePage key={a.slug} slug={a.slug} />])),
  };
  if (publicMap[route]) return publicMap[route];

  // Public course pages answer before anything else. No session required, and
  // no /api/me round trip, so a crawler or a logged-out visitor sees content.
  const publicCourseMatch = route.match(/^c\/([A-Za-z0-9-]+)$/);
  if (publicCourseMatch) return <PublicCourse slug={publicCourseMatch[1]} />;
  if (route === "c") return <PublicGallery />;

  // Accepting an invite happens logged out, so it resolves before the gate.
  const joinMatch = route.match(/^join\/([A-Za-z0-9_-]+)$/);
  if (joinMatch) return <Join token={joinMatch[1]} />;

  if (loading) {
    return (
      <div className="landing">
        <div className="nutbig"><Logo size={72} /></div>
        <div className="skel" style={{ width: 180, height: 20 }} />
      </div>
    );
  }

  const user = me?.user;

  if (!user) {
    return <Landing onAuthed={refresh} />;
  }

  if (user.role === "learner") {
    if (route.startsWith("print/lesson/")) {
      return <PrintLesson lessonId={Number(route.split("/")[2])} role="learner" />;
    }
    const learnerRoute = route === "dashboard" ? "" : route;
    const lang = normalizeLang((user.prefs as Record<string, unknown>)?.lang);
    const ctx = { lang, t: (k: any, vars?: any) => tKey(lang, k, vars) } as { lang: typeof lang; t: (k: any, vars?: any) => string };
    if (typeof document !== "undefined") { try { document.documentElement.lang = lang; } catch {} }
    return (
      <I18nContext.Provider value={ctx}>
        {previewing && <PreviewBar name={previewing.name} />}
        <Suspense fallback={<Fallback />}><LearnerApp me={user} route={learnerRoute} onNavigate={navigate} onLogout={logout} /></Suspense>
      </I18nContext.Provider>
    );
  }

  if (route.startsWith("print/lesson/")) {
    return <PrintLesson lessonId={Number(route.split("/")[2])} role="parent" />;
  }

  const portfolioMatch = route.match(/^portfolio\/(\d+)$/);
  const detailMatch = route.match(/^course\/(\d+)$/);
  const planMatch = route.match(/^plan\/(\d+)$/);
  const reportMatch = route.match(/^report\/(\d+)$/);
  const learnerEditMatch = route.match(/^learners\/(\d+)$/);
  const learnerNew = route === "learners/new";
  const knownRoutes = new Set([
    "learners", "studio", "courses", "community", "experience", "records", "tutor", "work", "attendance",
    "plans", "notes", "library", "calendar", "plans/new", "settings", "dashboard",
  ]);
  const known = knownRoutes.has(route) || Boolean(portfolioMatch || detailMatch || planMatch || reportMatch || learnerEditMatch || learnerNew);

  return (
    <>
    {/* Belt and braces: if a preview is somehow live while the console is on
        screen, the way out has to be visible here too. That combination is what
        made world-builder saves fail with preview_read_only and no explanation. */}
    {previewing && <PreviewBar name={previewing.name} />}
    <Shell me={user} route={detailMatch ? "courses" : planMatch ? "plans" : portfolioMatch ? "attendance" : learnerEditMatch || learnerNew ? "learners" : route} onNavigate={navigate} onLogout={logout} courses={courses}>
    <Suspense fallback={<Fallback />}>
      {route === "learners" && <Learners me={me!} />}
      {(learnerNew || learnerEditMatch) && (
        // key forces a remount between learners, so switching from an edit
        // to "add" cannot leave the previous learner's values on screen.
        <LearnerForm
          key={learnerEditMatch ? learnerEditMatch[1] : "new"}
          learnerId={learnerEditMatch ? Number(learnerEditMatch[1]) : null}
          onSaved={refresh}
        />
      )}
      {route === "studio" && <Studio me={me!} onNavigate={navigate} />}
      {route === "courses" && <Courses onNavigate={navigate} />}
      {route === "community" && <Community onNavigate={navigate} />}
      {route === "experience" && <Experience />}
      {detailMatch && <CourseDetail me={me!} courseId={Number(detailMatch[1])} onNavigate={navigate} />}
      {route === "records" && <Progress />}
      {route === "tutor" && <TutorLog me={me!} />}
      {route === "work" && <Work />}
      {route === "attendance" && <Attendance />}
      {portfolioMatch && <Portfolio learnerId={Number(portfolioMatch[1])} onNavigate={navigate} />}
      {route === "plans" && <Plans onNavigate={navigate} />}
      {route === "notes" && <Notes />}
      {route === "library" && <Library />}
      {route === "calendar" && <Calendar onNavigate={navigate} />}
      {route === "plans/new" && <PlanWizard me={me!} onNavigate={navigate} />}
      {reportMatch && <ReportView reportId={Number(reportMatch[1])} onNavigate={navigate} />}
      {planMatch && <PlanDetail planId={Number(planMatch[1])} onNavigate={navigate} meLearners={me.learners || []} />}
      {route === "settings" && <Settings me={me!} />}
      {route === "dashboard" && <Dashboard me={me!} onNavigate={navigate} />}
      {!known && <NotFound path={route} />}
    </Suspense>
    </Shell>
    </>
  );
}
