// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide console shell: sidebar sections + topbar + mobile drawer + palette.
import { useEffect, useState, type ReactNode } from "react";
import type { CourseSummary, Me } from "../types";
import { isDark, setMode } from "../theme";
import Palette from "./Palette";
import {
  IconHome, IconUsers, IconBook, IconClipboard, IconSettings,
  IconSun, IconMoon, IconMenu, IconX, IconLogout, IconSparkle,
} from "./Icons";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  studio: "Course Studio",
  courses: "Courses",
  learners: "Learners",
  records: "Records",
  experience: "Experience",
  settings: "Settings",
};

const SECTIONS: { label: string; items: { id: string; label: string; icon: ReactNode }[] }[] = [
  {
    label: "Learn",
    items: [
      { id: "dashboard", label: "Dashboard", icon: <IconHome /> },
      { id: "studio", label: "Course Studio", icon: <IconSparkle /> },
      { id: "courses", label: "Courses", icon: <IconBook /> },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "learners", label: "Learners", icon: <IconUsers /> },
      { id: "records", label: "Records", icon: <IconClipboard /> },
    ],
  },
  {
    label: "Preferences",
    items: [
      { id: "experience", label: "Experience", icon: <span aria-hidden="true">🎨</span> },
      { id: "settings", label: "Settings", icon: <IconSettings /> },
    ],
  },
];

export default function Shell({
  me,
  route,
  onNavigate,
  onLogout,
  courses,
  children,
}: {
  me: Me;
  route: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  courses: CourseSummary[] | null;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dark, setDark] = useState(isDark());

  useEffect(() => {
    const sync = () => setDark(isDark());
    window.addEventListener("wow-theme-change", sync);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    return () => {
      window.removeEventListener("wow-theme-change", sync);
      mq.removeEventListener("change", sync);
    };
  }, []);

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setMode(next);
    setDark(next === "dark");
    window.dispatchEvent(new Event("wow-theme-change"));
  };

  const go = (id: string) => {
    onNavigate(id);
    setDrawerOpen(false);
  };

  const nav = (
    <nav aria-label="Main">
      {SECTIONS.map((section) => (
        <div key={section.label} className="navsection">
          <div className="navlabel">{section.label}</div>
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navlink${route === item.id ? " active" : ""}`}
              onClick={() => go(item.id)}
              aria-current={route === item.id ? "page" : undefined}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="shell">
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="nut" aria-hidden="true">🌰</span>
          <span>
            Well of Wisdom
            <span className="sub">{me.familyName}</span>
          </span>
          <button
            className="iconbtn hamburger"
            style={{ marginLeft: "auto" }}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            type="button"
          >
            <IconX />
          </button>
        </div>
        {nav}
        <div className="spacer" />
        <div className="sideuser">
          <span className="avatar" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
          <span className="who">
            <span className="n">{me.name}</span>
            <span className="r">Guide</span>
          </span>
          <button className="iconbtn" onClick={onLogout} aria-label="Sign out" title="Sign out" type="button">
            <IconLogout />
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button
            className="iconbtn hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            type="button"
          >
            <IconMenu />
          </button>
          <h1>{TITLES[route] || "Well of Wisdom"}</h1>
          <div className="actions">
            <button
              className="iconbtn"
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
              type="button"
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>

      <Palette courses={courses} onNavigate={onNavigate} onToggleTheme={toggleTheme} />
    </div>
  );
}
