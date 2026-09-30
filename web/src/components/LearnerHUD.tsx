// SPDX-License-Identifier: AGPL-3.0-or-later
// LearnerHUD: the persistent HUD bar inside LearnerShell.
// Kept as a separate file so the shell can own controller plumbing
// while the HUD owns layout. No server endpoint.
import Logo from "./Logo";
import type { Me } from "../types";
import { useT } from "../i18n";

interface Hud {
  xp: number;
  streak: { current: number; best: number; activeToday: boolean };
  packCount: number;
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
        <circle cx="18" cy="18" r={r} stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 18 18)" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <span className="hud-xp-num" aria-hidden="true">{label}</span>
    </span>
  );
}

export default function LearnerHUD({
  me,
  hud,
  soundOn,
  mapOpen,
  controllerMode,
  onToggleController,
  onToggleSound,
  onToggleMap,
  onNavigate,
  onLogout,
}: {
  me: Me;
  hud: Hud | null;
  soundOn: boolean;
  mapOpen: boolean;
  controllerMode: boolean;
  onToggleController: () => void;
  onToggleSound: () => void;
  onToggleMap: () => void;
  onNavigate: (route: string) => void;
  onLogout: () => void;
}) {
  const { t } = useT();
  const firstName = me.name.split(" ")[0];
  const streak = hud?.streak ?? null;
  const xp = hud?.xp ?? 0;
  const packCount = hud?.packCount ?? 0;
  return (
    <header className="learnerhud" role="banner" aria-label="Your progress">
      <div className="hud-left">
        <button className="hud-home" type="button" data-nav data-say={t("shell.home")} onClick={() => onNavigate("")} aria-label={t("shell.home")}> 
          <Logo size={28} />
          <span className="hud-home-name">{firstName}</span>
        </button>
        <span className="hud-family chip" title={me.familyName}>{me.familyName}</span>
      </div>
      <div className="hud-center" aria-hidden="true"><span className="hud-dot" /></div>
      <div className="hud-right">
        <XPRing xp={xp} />
        {streak && streak.best > 0 && (
          <span className={`hud-stat${streak.activeToday ? " hot" : ""}`} title={t("shell.streakTitle", { current: String(streak.current), best: String(streak.best) })}>
            <span aria-hidden="true">{streak.current >= 3 ? "🔥" : "✨"}</span>
            <span className="hud-stat-num">{streak.current}</span>
          </span>
        )}
        <span className="hud-stat hud-pack" title={t("shell.packTitle", { count: String(packCount) })}>
          <span aria-hidden="true">🎒</span>
          <span className="hud-stat-num">{packCount}</span>
        </span>
        <button className="hud-iconbtn" type="button" data-nav data-say={controllerMode ? t("shell.controllerOn") : t("shell.controllerOff")} aria-label={controllerMode ? t("shell.controllerOn") : t("shell.controllerOff")} aria-pressed={controllerMode} onClick={onToggleController} title={controllerMode ? t("shell.controllerOn") : t("shell.controllerOff")}>
          <span aria-hidden="true">🎮</span>
        </button>
        <button className="hud-iconbtn" type="button" data-nav data-say={soundOn ? t("shell.mute") : t("shell.soundOn")} aria-label={soundOn ? t("shell.mute") : t("shell.soundOn")} aria-pressed={soundOn} onClick={onToggleSound} title={soundOn ? t("shell.mute") : t("shell.soundOn")}>
          <span aria-hidden="true">{soundOn ? "🔊" : "🔇"}</span>
        </button>
        <button className="hud-iconbtn hud-mapbtn" type="button" data-nav data-say={mapOpen ? t("shell.mapClose") : t("shell.mapOpen")} aria-label={mapOpen ? t("shell.mapClose") : t("shell.mapOpen")} aria-expanded={mapOpen} onClick={onToggleMap} title={t("shell.map")}>
          <span aria-hidden="true">🗺️</span>
          <span className="hud-maplabel">{t("shell.map")}</span>
        </button>
        <button className="hud-iconbtn" type="button" data-nav data-say={t("shell.signOut")} onClick={onLogout} aria-label={t("shell.signOut")} title={t("shell.signOut")}>
          <span aria-hidden="true">⎋</span>
        </button>
      </div>
    </header>
  );
}
