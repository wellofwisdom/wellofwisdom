// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { MeResponse } from "./types";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Learners from "./pages/Learners";
import LearnerForm from "./pages/LearnerForm";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import Progress from "./pages/Progress";
import Plans from "./pages/Plans";
import Notes from "./pages/Notes";
import Library from "./pages/Library";
import Calendar from "./pages/Calendar";
import ReportView from "./pages/ReportView";
import PlanWizard from "./pages/PlanWizard";
import PlanDetail from "./pages/PlanDetail";
import Settings from "./pages/Settings";
import Studio from "./pages/Studio";
import Experience from "./pages/Experience";
import LearnerApp from "./pages/learn/LearnerApp";
import PrintLesson from "./pages/PrintLesson";
import type { CourseSummary } from "./types";
import { go, routeFromLocation, ROUTE_EVENT } from "./router";
import { PublicGallery, PublicCourse } from "./pages/PublicCourse";

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

  const refresh = useCallback(async () => {
    try {
      const data = await api<MeResponse>("/api/me");
      setMe(data);
    } catch {
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

  // Public course pages answer before anything else. No session required, and
  // no /api/me round trip, so a crawler or a logged-out visitor sees content.
  const publicCourseMatch = route.match(/^c\/([A-Za-z0-9-]+)$/);
  if (publicCourseMatch) return <PublicCourse slug={publicCourseMatch[1]} />;
  if (route === "c") return <PublicGallery />;

  if (loading) {
    return (
      <div className="landing">
        <div className="nutbig" aria-hidden="true">🌰</div>
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
    return <LearnerApp me={user} route={learnerRoute} onNavigate={navigate} onLogout={logout} />;
  }

  if (route.startsWith("print/lesson/")) {
    return <PrintLesson lessonId={Number(route.split("/")[2])} role="parent" />;
  }

  const detailMatch = route.match(/^course\/(\d+)$/);
  const planMatch = route.match(/^plan\/(\d+)$/);
  const reportMatch = route.match(/^report\/(\d+)$/);
  const learnerEditMatch = route.match(/^learners\/(\d+)$/);
  const learnerNew = route === "learners/new";

  return (
    <Shell me={user} route={detailMatch ? "courses" : planMatch ? "plans" : learnerEditMatch || learnerNew ? "learners" : route} onNavigate={navigate} onLogout={logout} courses={courses}>
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
      {route === "experience" && <Experience />}
      {detailMatch && <CourseDetail me={me!} courseId={Number(detailMatch[1])} onNavigate={navigate} />}
      {route === "records" && <Progress />}
      {route === "plans" && <Plans onNavigate={navigate} />}
      {route === "notes" && <Notes />}
      {route === "library" && <Library />}
      {route === "calendar" && <Calendar onNavigate={navigate} />}
      {route === "plans/new" && <PlanWizard me={me!} onNavigate={navigate} />}
      {reportMatch && <ReportView reportId={Number(reportMatch[1])} onNavigate={navigate} />}
      {planMatch && <PlanDetail planId={Number(planMatch[1])} onNavigate={navigate} meLearners={me.learners || []} />}
      {route === "settings" && <Settings me={me!} />}
      {route === "dashboard" && <Dashboard me={me!} onNavigate={navigate} />}
    </Shell>
  );
}
