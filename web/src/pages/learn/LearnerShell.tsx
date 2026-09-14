// SPDX-License-Identifier: AGPL-3.0-or-later
// LearnerShell: the full-screen game frame that wraps every learner route.
// Same routes, different frame. 100dvh, HUD pinned, cover bleed when present.
// Degrades cleanly when no XP or art is available. No new API beyond /api/learn/hud.
// Now with controller mode: gamepad and keyboard arrows share the spatial manager,
// candidates are [data-nav], PadLegend appears when a pad connects.
import { useCallback, useEffect, useState } from "react";
import Logo from "../../components/Logo";
import { api } from "../../api";
import type { Me } from "../../types";
import { useGamepad } from "../../lib/gamepad";
import { focusNext, focusFirst, speakFocused } from "../../lib/spatialNav";
import PadLegend from "../../components/PadLegend";

interface Hud {
  xp: number;
  streak: { current: number; best: number; activeToday: boolean };
  packCount: number;
}

const SOUND_KEY = "wow-learner-sound";
const CONTROLLER_KEY = "wow-controller-mode";

function getSoundPref(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function getControllerPref(): boolean {
  try {
    return localStorage.getItem(CONTROLLER_KEY) === "on";
  } catch {
    return false;
  }
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const he = el as HTMLElement;
  if (he.isContentEditable) return true;
  if (he.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return true;
  return false;
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
  const [controllerMode, setControllerMode] = useState<boolean>(() => getControllerPref());

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

  useEffect(() => {
    try {
      localStorage.setItem(CONTROLLER_KEY, controllerMode ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [controllerMode]);

  const handleConnect = useCallback(() => {
    setControllerMode(true);
    try {
      localStorage.setItem(CONTROLLER_KEY, "on");
    } catch {
      /* ignore */
    }
    setTimeout(() => focusFirst(), 80);
  }, []);

  const handleButtonDown = useCallback((index: number) => {
    if (index === 0) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.hasAttribute("data-nav")) {
        el.click();
      } else {
        focusFirst();
      }
      return;
    }
    if (index === 1) {
      if (mapOpen) {
        setMapOpen(false);
        return;
      }
      if (window.history.length > 1) window.history.back();
      else onNavigate("");
      return;
    }
    if (index === 2) {
      speakFocused();
      return;
    }
    if (index === 9) {
      setMapOpen((v) => !v);
      return;
    }
    if (index === 12) { focusNext("up"); return; }
    if (index === 13) { focusNext("down"); return; }
    if (index === 14) { focusNext("left"); return; }
    if (index === 15) { focusNext("right"); return; }
  }, [mapOpen, onNavigate]);

  const handleAxis = useCallback((index: number, value: number) => {
    if (index === 0) {
      if (value < 0) focusNext("left");
      else if (value > 0) focusNext("right");
    }
    if (index === 1) {
      if (value < 0) focusNext("up");
      else if (value > 0) focusNext("down");
    }
  }, []);

  const { connected } = useGamepad({
    enabled: true,
    onButtonDown: handleButtonDown,
    onAxis: handleAxis,
    onConnect: handleConnect,
  });

  useEffect(() => {
    if (!controllerMode) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      const typing = isTypingTarget(target);
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (typing) return;
        e.preventDefault();
        if (e.key === "ArrowUp") focusNext("up");
        else if (e.key === "ArrowDown") focusNext("down");
        else if (e.key === "ArrowLeft") focusNext("left");
        else if (e.key === "ArrowRight") focusNext("right");
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (typing) return;
        const el = document.activeElement as HTMLElement | null;
        if (el && el.hasAttribute("data-nav")) {
          e.preventDefault();
          el.click();
        }
        return;
      }
      if (e.key === "Escape") {
        if (typing) return;
        if (mapOpen) { e.preventDefault(); setMapOpen(false); }
        else if (window.history.length > 1) window.history.back();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controllerMode, mapOpen]);

  useEffect(() => {
    if (!controllerMode) return;
    const t = setTimeout(() => {
      if (!document.activeElement || !document.activeElement.hasAttribute("data-nav")) {
        focusFirst();
      }
    }, 120);
    return () => clearTimeout(t);
  }, [controllerMode]);

  const firstName = me.name.split(" ")[0];
  const streak = hud?.streak ?? null;
  const xp = hud?.xp ?? 0;
  const packCount = hud?.packCount ?? 0;

  return (
    <div className={`learnershell${controllerMode ? " controller-mode" : ""}`} data-cover={coverUrl ? "true" : "false"}>
      {coverUrl && (
        <div className="learnershell-bg" aria-hidden="true" style={{ backgroundImage: `url(${coverUrl})` }} />
      )}
      <header className="learnerhud" role="banner" aria-label="Your progress">
        <div className="hud-left">
          <button className="hud-home" type="button" data-nav data-say="Home" onClick={() => onNavigate("")} aria-label="Home">
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
            data-nav
            data-say={controllerMode ? "Controller mode on" : "Controller mode off"}
            aria-label={controllerMode ? "Controller mode on" : "Controller mode off"}
            aria-pressed={controllerMode}
            onClick={() => setControllerMode((v) => !v)}
            title={controllerMode ? "Controller mode on" : "Controller mode off"}
          >
            <span aria-hidden="true">🎮</span>
          </button>
          <button
            className="hud-iconbtn"
            type="button"
            data-nav
            data-say={soundOn ? "Mute sounds" : "Unmute sounds"}
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
            data-nav
            data-say={mapOpen ? "Close map" : "Open map"}
            aria-label={mapOpen ? "Close map" : "Open map"}
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((v) => !v)}
            title="Map"
          >
            <span aria-hidden="true">🗺️</span>
            <span className="hud-maplabel">Map</span>
          </button>
          <button className="hud-iconbtn" type="button" data-nav data-say="Sign out" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <span aria-hidden="true">⎋</span>
          </button>
        </div>
      </header>

      {connected && <PadLegend />}
      {mapOpen && (
        <div className="hud-mapdrop" role="dialog" aria-label="Map">
          <div className="hud-mapdrop-head">
            <strong>Where to next</strong>
            <button className="btn ghost small-btn" type="button" data-nav data-say="Close map" onClick={() => setMapOpen(false)}>Close</button>
          </div>
          <div className="hud-mapdrop-grid">
            <button type="button" className="hud-mapcard" data-nav data-say="Go home" onClick={() => { setMapOpen(false); onNavigate(""); }}>
              <span aria-hidden="true">🏠</span> Home
            </button>
            <button type="button" className="hud-mapcard" data-nav data-say="Practice" onClick={() => { setMapOpen(false); onNavigate("practice"); }}>
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
