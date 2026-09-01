// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide console shell: sidebar matching the Trinacle design language:
// colored icon chips, collapsible submenus, hover lift, active accent bar.
import { useEffect, useState, type ReactNode } from "react";
import type { CourseSummary, Me } from "../types";
import { isDark, setMode } from "../theme";
import Palette from "./Palette";
import {
  IconHome, IconUsers, IconBook, IconClipboard, IconSettings,
  IconSun, IconMoon, IconMenu, IconX, IconLogout, IconSparkle,
} from "./Icons";

const TITLES: Record<string, string> = {
  plans: "Learning Paths",
  notes: "Workspace",
  tutor: "Tutor",
  library: "Library",
  calendar: "Calendar",
  "plans/new": "Plan Assistant",
  dashboard: "Dashboard",
  studio: "Course Studio",
  courses: "Courses",
  learners: "Learners",
  records: "Progress",
  experience: "Experience",
  settings: "Settings",
};

// chip color per item. The Trinacle rainbow
const CHIPS: Record<string, string> = {
  dashboard: "c-green",
  studio: "c-violet",
  courses: "c-indigo",
  learners: "c-sky",
  records: "c-amber",
  plans: "c-lime",
  notes: "c-teal",
  tutor: "c-amber",
  library: "c-pink",
  calendar: "c-sky",
  experience: "c-rose",
  settings: "c-slate",
};

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
  const [settingsOpen, setSettingsOpen] = useState(route === "experience");
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

  const Item = ({ id, label, icon, sub = false }: { id: string; label: string; icon: ReactNode; sub?: boolean }) => (
    <button
      type="button"
      className={`navlink${route === id ? " on" : ""}${sub ? " subitem" : ""}`}
      onClick={() => go(id)}
      aria-current={route === id ? "page" : undefined}
    >
      <span className={`ic ${CHIPS[id] || "c-slate"}${sub ? " small" : ""}`} aria-hidden="true">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="shell">
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="nut" aria-hidden="true">🌰</span>
          <span className="brandname">
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

        <nav className="nav" aria-label="Main">
          <div className="grp">Learn</div>
          <Item id="dashboard" label="Dashboard" icon={<IconHome />} />
          <Item id="studio" label="Course Studio" icon={<IconSparkle />} />
          <Item id="courses" label="Courses" icon={<IconBook />} />
        </nav>

        <nav className="nav" aria-label="Manage">
          <div className="grp">Manage</div>
          <Item id="learners" label="Learners" icon={<IconUsers />} />
          <Item id="plans" label="Learning Paths" icon={<span style={{ fontSize: 15 }}>🗺️</span>} />
          <Item id="calendar" label="Calendar" icon={<span style={{ fontSize: 15 }}>🗓️</span>} />
          <Item id="notes" label="Workspace" icon={<span style={{ fontSize: 15 }}>🗒️</span>} />
          <Item id="library" label="Library" icon={<span style={{ fontSize: 15 }}>📚</span>} />
          <Item id="records" label="Progress" icon={<IconClipboard />} />
          <Item id="tutor" label="Tutor" icon={<span style={{ fontSize: 15 }}>🌰</span>} />
        </nav>

        <div className="foot">
          <nav className="nav" aria-label="Preferences">
            <button
              type="button"
              className={`navlink${route === "settings" ? " on" : ""}`}
              onClick={() => go("settings")}
            >
              <span className={`ic ${CHIPS.settings}`} aria-hidden="true"><IconSettings /></span>
              Settings
              <span
                className={`caret${settingsOpen ? " exp" : ""}`}
                aria-label={settingsOpen ? "Collapse" : "Expand"}
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setSettingsOpen(!settingsOpen); } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            {settingsOpen && (
              <div className="navsub">
                <Item id="experience" label="Experience" icon={<span style={{ fontSize: 14 }}>🎨</span>} sub />
              </div>
            )}
          </nav>

          <div className="acct">
            <span className="av" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
            <span className="who">
              <span className="nm">{me.name}</span>
              <span className="em">Guide</span>
            </span>
            <button className="iconbtn ch" onClick={onLogout} aria-label="Sign out" title="Sign out" type="button">
              <IconLogout />
            </button>
          </div>
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
