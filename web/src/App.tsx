// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { MeResponse } from "./types";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Learners from "./pages/Learners";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import Records from "./pages/Records";
import Settings from "./pages/Settings";
import LearnerApp from "./pages/learn/LearnerApp";

function currentRoute(): string {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h.split("?")[0] || "dashboard";
}

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRouteState] = useState(currentRoute);

  useEffect(() => {
    const onHash = () => setRouteState(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((id: string) => {
    window.location.hash = id === "dashboard" ? "/" : `/${id}`;
  }, []);

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

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.hash = "/";
    refresh();
  }, [refresh]);

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
    const learnerRoute = route === "dashboard" ? "" : route;
    return <LearnerApp me={user} route={learnerRoute} onNavigate={navigate} onLogout={logout} />;
  }

  const detailMatch = route.match(/^course\/(\d+)$/);

  return (
    <Shell me={user} route={detailMatch ? "courses" : route} onNavigate={navigate} onLogout={logout}>
      {route === "learners" && <Learners me={me!} onChanged={refresh} />}
      {route === "courses" && <Courses me={me!} onNavigate={navigate} />}
      {detailMatch && <CourseDetail me={me!} courseId={Number(detailMatch[1])} onNavigate={navigate} />}
      {route === "records" && <Records />}
      {route === "settings" && <Settings me={me!} />}
      {route === "dashboard" && <Dashboard me={me!} onNavigate={navigate} />}
    </Shell>
  );
}
