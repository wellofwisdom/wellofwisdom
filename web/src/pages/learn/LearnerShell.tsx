// SPDX-License-Identifier: AGPL-3.0-or-later
// LearnerShell: the full-screen game frame that wraps every learner route.
// Same routes, different frame. 100dvh, HUD pinned, cover bleed when present.
// Degrades cleanly when no XP or art is available. No new API beyond /api/learn/hud.
// Now with controller mode: gamepad and keyboard arrows share the spatial manager,
// candidates are [data-nav], PadLegend appears when a pad connects.
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { Me } from "../../types";
import { useT } from "../../i18n";
import { useGamepad } from "../../lib/gamepad";
import { focusNext, focusFirst, speakFocused } from "../../lib/spatialNav";
import { triggerHint, triggerNarrator } from "../../components/SpatialFocus";
import LearnerHUD from "../../components/LearnerHUD";
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
  const { t } = useT();

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
    if (index === 3) {
      triggerHint();
      return;
    }
    if (index === 7) {
      triggerNarrator();
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
    const tmr = setTimeout(() => {
      if (!document.activeElement || !document.activeElement.hasAttribute("data-nav")) {
        focusFirst();
      }
    }, 120);
    return () => clearTimeout(tmr);
  }, [controllerMode]);

  return (
    <div className={`learnershell${controllerMode ? " controller-mode" : ""}`} data-cover={coverUrl ? "true" : "false"}>
      {coverUrl && (
        <div className="learnershell-bg" aria-hidden="true" style={{ backgroundImage: `url(${coverUrl})` }} />
      )}
      <LearnerHUD me={me} hud={hud} soundOn={soundOn} mapOpen={mapOpen} controllerMode={controllerMode} onToggleController={() => setControllerMode((v) => !v)} onToggleSound={() => setSoundOn((v) => !v)} onToggleMap={() => setMapOpen((v) => !v)} onNavigate={onNavigate} onLogout={onLogout} />

      {connected && <PadLegend />}
      {mapOpen && (
        <div className="hud-mapdrop" role="dialog" aria-label={t("shell.map")}>
          <div className="hud-mapdrop-head">
            <strong>{t("shell.whereToNext")}</strong>
            <button className="btn ghost small-btn" type="button" data-nav data-say={t("shell.mapClose")} onClick={() => setMapOpen(false)}>{t("shell.close")}</button>
          </div>
          <div className="hud-mapdrop-grid">
            <button type="button" className="hud-mapcard" data-nav data-say={t("shell.goHome")} onClick={() => { setMapOpen(false); onNavigate(""); }}>
              <span aria-hidden="true">🏠</span> {t("shell.goHome")}
            </button>
            <button type="button" className="hud-mapcard" data-nav data-say={t("shell.practice")} onClick={() => { setMapOpen(false); onNavigate("practice"); }}>
              <span aria-hidden="true">🔁</span> {t("shell.practice")}
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>{t("shell.mapComingSoon")}</p>
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
