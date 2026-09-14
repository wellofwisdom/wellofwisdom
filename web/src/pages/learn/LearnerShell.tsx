// SPDX-License-Identifier: AGPL-3.0-or-later
// LearnerShell: the full-screen game frame that wraps every learner route.
// Same routes, different frame. 100dvh, HUD pinned, cover bleed when present.
// Degrades cleanly when no XP or art is available. No new API beyond /api/learn/hud.
import { useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { api } from "../../api";
import type { Me } from "../../types";

interface Hud {
  xp: number;
  streak: { current: number; best: number; activeToday: boolean };
  packCount: number;
}

const SOUND_KEY = "wow-learner-sound";

function getSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function XPRing({ xp }: { xp: number }) {
  const max = 500;
  const pct = Math.max(0, Math.min(1, xp / max));
  const r = 16;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  const label = xp >= 1000 ? `${(Math.floor(xp / 100) / 10).toFixed(1)}k` : String(xp);
  return (
    <span className="hud-xp" title={`${xp} XP`} aria-label={`${xp} XP`}>
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} stroke="var(--border)" strokeWidth="3" fill="none" opacity={0.95} />
        <circle
          cx="18" cy="18" r={r}
          stroke="var(--accent)" strokeWidth="3" fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 18 18)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="hud-xp-num" aria-hidden="true">{label}</span>
    </span>
  );
}

export default function LearnerShell({
  me,
  coverUrl,
  onNavigate,
  onLogout,
  children,
}: {
  me: Me;
  coverUrl?: string | null;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [hud, setHud] = useState<Hud | null>(null);
  const [soundOn, setSoundOn] = useState<boolean>(() => getSoundPref());
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api<Hud>("/api/learn/hud")
      .then((d) => { if (live) setHud(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  const firstName = me.name.split(" ")[0];
  const streak = hud?.streak ?? null;
  const xp = hud?.xp ?? 0;
  const packCount = hud?.packCount ?? 0;

  return (
    <div className="learnershell" data-cover={coverUrl ? "true" : "false"}>
      {coverUrl && (
        <div className="learnershell-bg" aria-hidden="true" style={{ backgroundImage: `url(${coverUrl})` }} />
      )}
      <header className="learnerhud" role="banner" aria-label="Your progress">
        <div className="hud-left">
          <button className="hud-home" type="button" onClick={() => onNavigate("")} aria-label="Home">
            <Logo size={28} />
            <span className="hud-home-name">{firstName}</span>
          </button>
          <span className="hud-family chip" title={me.familyName}>{me.familyName}</span>
        </div>
        <div className="hud-center" aria-hidden="true">
          <span className="hud-dot" />
        </div>
        <div className="hud-right">
          <XPRing xp={xp} />
          {streak && streak.best > 0 && (
            <span className={`hud-stat${streak.activeToday ? " hot" : ""}`} title={`${streak.current} day streak, best ${streak.best}`}>
              <span aria-hidden="true">{streak.current >= 3 ? "🔥" : "✨"}</span>
              <span className="hud-stat-num">{streak.current}</span>
            </span>
          )}
          <span className="hud-stat hud-pack" title={`${packCount} items in your pack`}>
            <span aria-hidden="true">🎒</span>
            <span className="hud-stat-num">{packCount}</span>
          </span>
          <button
            className="hud-iconbtn"
            type="button"
            aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
            aria-pressed={soundOn}
            onClick={() => setSoundOn((v) => !v)}
            title={soundOn ? "Mute" : "Sound on"}
          >
            <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span>
          </button>
          <button
            className="hud-iconbtn hud-mapbtn"
            type="button"
            aria-label={mapOpen ? "Close map" : "Open map"}
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((v) => !v)}
            title="Map"
          >
            <span aria-hidden="true">🗺️</span>
            <span className="hud-maplabel">Map</span>
          </button>
          <button className="hud-iconbtn" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <span aria-hidden="true">⎋</span>
          </button>
        </div>
      </header>

      {mapOpen && (
        <div className="hud-mapdrop" role="dialog" aria-label="Map">
          <div className="hud-mapdrop-head">
            <strong>Where to next</strong>
            <button className="btn ghost small-btn" type="button" onClick={() => setMapOpen(false)}>Close</button>
          </div>
          <div className="hud-mapdrop-grid">
            <button type="button" className="hud-mapcard" onClick={() => { setMapOpen(false); onNavigate(""); }}>
              <span aria-hidden="true">🏠</span> Home
            </button>
            <button type="button" className="hud-mapcard" onClick={() => { setMapOpen(false); onNavigate("practice"); }}>
              <span aria-hidden="true">🔁</span> Practice
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>The full map with your path and quests lands in the next slice. This is the pin it hangs from.</p>
        </div>
      )}

      <div className="learnerstage">
        <main id="main" className="learnerstage-main">
          {children}
        </main>
      </div>
    </div>
  );
}
