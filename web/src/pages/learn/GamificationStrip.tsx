// SPDX-License-Identifier: AGPL-3.0-or-later
// Gamification strip on the learner's home: streak flame + badge shelf.
// Earned badges glow; locked ones show as silhouettes with a teaser.
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../api";

interface Badge {
  id: string;
  label: string;
  icon: string;
  description: string;
  earned_at?: string;
}

interface Gamification {
  streak: { current: number; best: number; activeToday: boolean };
  badges: (Badge & { earned_at: string })[];
  locked: Badge[];
}

export default function GamificationStrip() {
  const { t } = useT();
  const [data, setData] = useState<Gamification | null>(null);

  useEffect(() => {
    api<Gamification>("/api/learn/gamification")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  const { streak, badges, locked } = data;
  const showStreak = streak.best > 0;
  const showBadges = badges.length > 0 || locked.length <= 4; // don't overwhelm new users

  if (!showStreak && !showBadges) return null;

  return (
    <div className="gamstrip">
      {showStreak && (
        <div className={`gamstreak${streak.activeToday ? " hot" : ""}`}>
          <span className="gs-flame" aria-hidden="true">{streak.current >= 7 ? "🔥" : streak.current >= 3 ? "🔥" : "✨"}</span>
          <div>
            <div className="gs-count">{t("gamstrip.streakCount", { count: String(streak.current) })}</div>
            <div className="gs-best">{t("gamstrip.best", { best: String(streak.best) })}</div>
          </div>
        </div>
      )}
      {showBadges && (
        <div className="gambadges">
          {badges.map((b) => (
            <span key={b.id} className="gambadge earned" title={b.description}>
              <span className="gb-icon" aria-hidden="true">{b.icon}</span>
              <span className="gb-label">{b.label}</span>
            </span>
          ))}
          {locked.slice(0, 4).map((b) => (
            <span key={b.id} className="gambadge locked" title={t("gamstrip.notYetEarned", { desc: b.description })}>
              <span className="gb-icon" aria-hidden="true">{b.icon}</span>
              <span className="gb-label">{b.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
