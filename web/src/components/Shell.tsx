// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent console shell: sidebar + topbar + mobile drawer + theme toggle.
import { useEffect, useState, type ReactNode } from "react";
import type { Me } from "../types";
import { isDark, setMode } from "../theme";
import {
  IconHome, IconUsers, IconBook, IconClipboard, IconSettings,
  IconSun, IconMoon, IconMenu, IconX, IconLogout,
} from "./Icons";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export const PARENT_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <IconHome /> },
  { id: "learners", label: "Learners", icon: <IconUsers /> },
  { id: "courses", label: "Courses", icon: <IconBook /> },
  { id: "records", label: "Records", icon: <IconClipboard /> },
  { id: "settings", label: "Settings", icon: <IconSettings /> },
];

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  learners: "Learners",
  courses: "Courses",
  records: "Records",
  settings: "Settings",
};

export default function Shell({
  me,
  route,
  onNavigate,
  onLogout,
  children,
}: {
  me: Me;
  route: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dark, setDark] = useState(isDark());

  // keep the toggle in sync when the theme changes elsewhere (Settings, OS)
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

  const go = (id: string) => {
    onNavigate(id);
    setDrawerOpen(false);
  };

  const nav = (
    <nav aria-label="Main">
      {PARENT_NAV.map((item) => (
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
            <span className="r">Parent</span>
          </span>
          <button
            className="iconbtn"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            type="button"
          >
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
              onClick={() => {
                const next = dark ? "light" : "dark";
                setMode(next);
                setDark(next === "dark");
                window.dispatchEvent(new Event("wow-theme-change"));
              }}
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
    </div>
  );
}
