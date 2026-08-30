// SPDX-License-Identifier: AGPL-3.0-or-later
// Ctrl+K command palette (guide console): navigation, courses, actions.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CourseSummary } from "../types";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

export default function Palette({
  courses,
  onNavigate,
  onToggleTheme,
}: {
  courses: CourseSummary[] | null;
  onNavigate: (hash: string) => void;
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setSel(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const commands: PaletteCommand[] = useMemo(() => {
    const nav: PaletteCommand[] = [
      { id: "n-dash", label: "Go to Dashboard", icon: "🏠", run: () => onNavigate("dashboard") },
      { id: "n-studio", label: "Generate a course — Course Studio", icon: "✨", run: () => onNavigate("studio") },
      { id: "n-courses", label: "Go to Courses", icon: "📘", run: () => onNavigate("courses") },
      { id: "n-learners", label: "Manage learners", icon: "🧑‍🎓", run: () => onNavigate("learners") },
      { id: "n-plans", label: "Learning Paths — plan a semester or year", icon: "🗺️", run: () => onNavigate("plans") },
      { id: "n-notes", label: "Workspace — notes & pages", icon: "🗒️", run: () => onNavigate("notes") },
      { id: "n-records", label: "Progress & achievements", icon: "📈", run: () => onNavigate("records") },
      { id: "n-exp", label: "Experience — themes & colors", icon: "🎨", run: () => onNavigate("experience") },
      { id: "n-settings", label: "Settings", icon: "⚙️", run: () => onNavigate("settings") },
      { id: "a-theme", label: "Toggle light / dark mode", icon: "🌗", run: onToggleTheme },
    ];
    const courseCmds: PaletteCommand[] = (courses || []).slice(0, 8).map((c) => ({
      id: `c-${c.id}`,
      label: c.title,
      hint: c.status === "draft" ? "draft" : "published",
      icon: c.lens ? "🧵" : "📘",
      run: () => onNavigate(`course/${c.id}`),
    }));
    return [...nav, ...courseCmds];
  }, [courses, onNavigate, onToggleTheme]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(needle));
  }, [q, commands]);

  if (!open) return null;

  function choose(cmd: PaletteCommand | undefined) {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }

  return (
    <div
      className="overlay palette"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="modal palettebox" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="input paletteinput"
          placeholder="Type a command… (courses, studio, theme)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") choose(filtered[sel]);
          }}
          aria-label="Command search"
        />
        <div className="paletteList" role="listbox">
          {filtered.length === 0 && <div className="muted small" style={{ padding: 14 }}>Nothing matches “{q}”.</div>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`palitem${i === sel ? " on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(c)}
            >
              <span aria-hidden="true">{c.icon}</span>
              <span className="grow" style={{ textAlign: "left" }}>{c.label}</span>
              {c.hint && <span className="chip">{c.hint}</span>}
            </button>
          ))}
        </div>
        <div className="hint" style={{ padding: "8px 12px" }}>↑↓ move · ↵ open · esc close</div>
      </div>
    </div>
  );
}
