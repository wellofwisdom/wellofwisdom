// SPDX-License-Identifier: AGPL-3.0-or-later
// DailiesBoard: tiny daily checks on learner home. Reuses the same data
// LearnerApp already has: reviewsDue, upcoming, streak, and a simple
// local done mark. No new API, no streak that shames, just nudges.
import { useState } from "react";
import { useT } from "../../i18n";

const STORAGE_KEY = "wow-dailies-done";

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
  upcomingCount: number;
  streakActive: boolean;
}

export default function DailiesBoard({ reviewsDue, upcomingCount, streakActive }: Props) {
  const { t } = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const stored = loadDone();
    if (reviewsDue === 0) {
      const key = `practice-${today}`;
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

  const items: { id: string; label: string; hint: string; icon: string; done: boolean }[] = [
    {
      id: `practice-${today}`,
      label: t("dailies.practice"),
      hint: reviewsDue != null && reviewsDue > 0 ? t("dailies.practiceDue", { count: String(reviewsDue) }) : t("dailies.allCaughtUp"),
      icon: "🔁",
      done: reviewsDue === 0 ? true : Boolean(done[`practice-${today}`]),
    },
    {
      id: `streak-${today}`,
      label: t("dailies.keepStreak"),
      hint: streakActive ? t("dailies.streakLit") : t("dailies.streakDoOne"),
      icon: "🔥",
      done: Boolean(done[`streak-${today}`]),
    },
    {
      id: `plan-${today}`,
      label: t("dailies.checkComingUp"),
      hint: t("dailies.comingCount", { count: String(upcomingCount) }),
      icon: "🗓️",
      done: Boolean(done[`plan-${today}`]),
    },
  ];

  return (
    <div className="dailies" role="region" aria-label="Daily quests">
      <h2 className="dailies-title">{t("dailies.title")}</h2>
      <div className="dailies-grid">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            data-nav
            data-say={`${it.label} ${it.hint}`}
            className={`daily${it.done ? " done" : ""}`}
            onClick={() => toggle(it.id)}
            aria-pressed={it.done}
          >
            <span className="daily-icon" aria-hidden="true">{it.icon}</span>
            <span className="daily-body">
              <span className="daily-label">{it.label}</span>
              <span className="daily-hint">{it.hint}</span>
            </span>
            <span className="daily-check" aria-hidden="true">{it.done ? "✓" : ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
