// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide console shell: sidebar matching the Trinacle design language:
// colored icon chips, collapsible sections, hover lift, active accent bar.
import { useEffect, useState, type ReactNode } from "react";
import Logo from "./Logo";
import type { CourseSummary, Me } from "../types";
import { isDark, setMode } from "../theme";
import Palette from "./Palette";
import DemoBanner from "./DemoBanner";
import {
  IconHome, IconUsers, IconBook, IconClipboard, IconSettings,
  IconSun, IconMoon, IconMenu, IconX, IconLogout, IconSparkle,
  IconGlobe, IconMap, IconCalendar, IconNotebook, IconLibrary,
  IconWrench, IconMessage, IconBarChart, IconClipboardCheck, IconLens,
} from "./Icons";

const TITLES: Record<string, string> = {
  plans: "Learning Paths",
  notes: "Workspace",
  tutor: "Tutor",
  library: "Library",
  calendar: "Calendar",
  community: "Community",
  "plans/new": "Plan Assistant",
  dashboard: "Dashboard",
  studio: "Course Studio",
  courses: "Courses",
  learners: "Learners",
  records: "Progress",
  work: "Submitted Work",
  attendance: "Attendance and Assessments",
  lens: "Lens",
  experience: "Experience",
  settings: "Settings",
};

const CHIPS: Record<string, string> = {
  dashboard: "c-green",
  studio: "c-violet",
  courses: "c-indigo",
  community: "c-plum",
  learners: "c-sky",
  records: "c-amber",
  work: "c-violet",
  attendance: "c-teal",
  plans: "c-lime",
  notes: "c-teal",
  tutor: "c-amber",
  library: "c-pink",
  calendar: "c-sky",
  lens: "c-amber",
  experience: "c-rose",
  settings: "c-slate",
};

type GroupId = "teach" | "learners" | "records" | "workspace";

const GROUP_OF: Record<string, GroupId> = {
  studio: "teach",
  courses: "teach",
  community: "teach",
  plans: "teach",
  learners: "learners",
  work: "learners",
  tutor: "learners",
  records: "records",
  attendance: "records",
  calendar: "records",
  lens: "workspace",
  notes: "workspace",
  library: "workspace",
};

const GROUP_LABELS: Record<GroupId, string> = {
  teach: "Teach",
  learners: "Learners",
  records: "Records",
  workspace: "Workspace",
};

const STORAGE_KEY = "wow-sidebar-open";

function loadOpen(): Record<GroupId, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") return parsed as Record<GroupId, boolean>;
    }
  } catch { /* ignore */ }
  return { teach: true, learners: true, records: true, workspace: true };
}

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
  const [open, setOpen] = useState<Record<GroupId, boolean>>(() => loadOpen());
  const [accountOpen, setAccountOpen] = useState(false);
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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(open)); } catch { /* ignore */ }
  }, [open]);

  useEffect(() => {
    const g = GROUP_OF[route];
    if (g && !open[g]) setOpen((prev) => ({ ...prev, [g]: true }));
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setAccountOpen(false); }, [route]);

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

  const toggleGroup = (g: GroupId) => setOpen((prev) => ({ ...prev, [g]: !prev[g] }));

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

  function renderGroup(id: GroupId, groupChildren: ReactNode) {
    const isOpen = open[id];
    const containsActive = Object.entries(GROUP_OF).some(([r, g]) => g === id && r === route);
    const show = isOpen || containsActive;
    return (
      <div key={id} className="navgrp">
        <button
          type="button"
          className="grpbtn"
          onClick={() => toggleGroup(id)}
          aria-expanded={show}
          aria-controls={`grp-${id}`}
        >
          <span>{GROUP_LABELS[id]}</span>
          <span className={`grpcaret${show ? " exp" : ""}`} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
        {show ? <div id={`grp-${id}`} className="grpbody">{groupChildren}</div> : null}
      </div>
    );
  }

  return (
    <div className="shell">
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
      <aside className={`sidebar${drawerOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="nut"><Logo size={34} /></span>
          <span className="brandword" aria-label="Well of Wisdom">Well of Wisdom</span>
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
        <div className="brandsub">{me.familyName}</div>

        <nav className="nav" aria-label="Main">
          <button
            type="button"
            className={`navlink${route === "dashboard" ? " on" : ""}`}
            onClick={() => go("dashboard")}
            aria-current={route === "dashboard" ? "page" : undefined}
          >
            <span className={`ic ${CHIPS.dashboard}`} aria-hidden="true"><IconHome /></span>
            Dashboard
          </button>

          {renderGroup("teach", (
            <>
            <Item id="studio" label="Course Studio" icon={<IconSparkle />} />
            <Item id="courses" label="Courses" icon={<IconBook />} />
            <Item id="community" label="Open courses" icon={<IconGlobe />} />
            <Item id="plans" label="Learning paths" icon={<IconMap />} />
            </>
          ))}
          {renderGroup("learners", (
            <>
            <Item id="learners" label="Learners" icon={<IconUsers />} />
            <Item id="work" label="Submitted work" icon={<IconWrench />} />
            <Item id="tutor" label="Tutor log" icon={<IconMessage />} />
            </>
          ))}
          {renderGroup("records", (
            <>
            <Item id="records" label="Progress" icon={<IconBarChart />} />
            <Item id="attendance" label="Attendance" icon={<IconClipboardCheck />} />
            <Item id="calendar" label="Calendar" icon={<IconCalendar />} />
            </>
          ))}
          {renderGroup("workspace", (
            <>
            <Item id="lens" label="Lens" icon={<IconLens />} />
            <Item id="notes" label="Workspace" icon={<IconNotebook />} />
            <Item id="library" label="Library" icon={<IconLibrary />} />
            </>
          ))}
        </nav>

        <div className="foot">
          <div className="acctwrap">
            <button
              type="button"
              className="acct"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <span className="av" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
              <span className="who">
                <span className="nm">{me.name}</span>
                <span className="em">Guide</span>
              </span>
              <span className={`caret${accountOpen ? " exp" : ""}`} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            {accountOpen && (
              <div className="acctmenu" role="menu">
                <button type="button" role="menuitem" className={`acctitem${route === "settings" ? " on" : ""}`} onClick={() => go("settings")}>
                  <span className={`ic ${CHIPS.settings} small`} aria-hidden="true"><IconSettings /></span>
                  Settings
                </button>
                <button type="button" role="menuitem" className={`acctitem${route === "experience" ? " on" : ""}`} onClick={() => go("experience")}>
                  <span className="ic c-rose small" aria-hidden="true"><IconClipboard /></span>
                  Experience
                </button>
                <div className="acctsep" />
                <button type="button" role="menuitem" className="acctitem" onClick={onLogout}>
                  <span className="ic c-slate small" aria-hidden="true"><IconLogout /></span>
                  Sign out
                </button>
              </div>
            )}
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
        <main className="page" id="main">
          <DemoBanner />
          {children}
        </main>
      </div>

      <Palette courses={courses} onNavigate={onNavigate} onToggleTheme={toggleTheme} />
    </div>
  );
}
