// SPDX-License-Identifier: AGPL-3.0-or-later
// WeekliesBoard: this week's tiny goals, no new API. Counts from what
// LearnerApp already knows: lessons done, reviews, streak. A weekly reset
// via an ISO week key in localStorage, so Monday feels fresh without a
// server job. Never a gate on learning, just a nudge.
import { useState } from "react";

const STORAGE_KEY = "wow-weeklies-done";

function weekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function loadDone(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveDone(map: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

interface Props {
  reviewsDue: number | null;
  lessonsDone: number;
  lessonsTotal: number;
  streakActive: boolean;
}

export default function WeekliesBoard({ reviewsDue, lessonsDone, lessonsTotal, streakActive }: Props) {
  const wk = weekKey();
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const stored = loadDone();
    if (reviewsDue === 0) {
      const key = `review-${wk}`;
      if (!stored[key]) {
        const next = { ...stored, [key]: true };
        saveDone(next);
        return next;
      }
    }
    return stored;
  });

  const toggle = (key: string) => {
    const next = { ...done, [key]: !done[key] };
    setDone(next);
    saveDone(next);
  };

  const progressPct = lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;
  const items: { id: string; label: string; hint: string; icon: string; done: boolean }[] = [
    {
      id: `review-${wk}`,
      label: "Weekly review",
      hint: reviewsDue != null && reviewsDue > 0 ? `${reviewsDue} due` : "All caught up",
      icon: "🔁",
      done: reviewsDue === 0 ? true : Boolean(done[`review-${wk}`]),
    },
    {
      id: `streak3-${wk}`,
      label: "Three days this week",
      hint: streakActive ? "On a roll" : "Three sessions to earn it",
      icon: "🔥",
      done: Boolean(done[`streak3-${wk}`]),
    },
    {
      id: `progress-${wk}`,
      label: "Make progress",
      hint: lessonsTotal ? `${lessonsDone}/${lessonsTotal} lessons · ${progressPct}%` : "Keep going",
      icon: "🏆",
      done: Boolean(done[`progress-${wk}`]) || progressPct >= 100,
    },
  ];

  const allDone = items.every((it) => it.done);

  return (
    <div className="weeklies" role="region" aria-label="Weekly quests">
      <h2 className="weeklies-title">This week{allDone ? " ✓" : ""}</h2>
      <div className="weeklies-grid">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            data-nav
            data-say={`${it.label} ${it.hint}`}
            className={`weekly${it.done ? " done" : ""}`}
            onClick={() => toggle(it.id)}
            aria-pressed={it.done}
          >
            <span className="weekly-icon" aria-hidden="true">{it.icon}</span>
            <span className="weekly-body">
              <span className="weekly-label">{it.label}</span>
              <span className="weekly-hint">{it.hint}</span>
            </span>
            <span className="weekly-check" aria-hidden="true">{it.done ? "✓" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
