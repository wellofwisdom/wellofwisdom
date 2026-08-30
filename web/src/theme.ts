// SPDX-License-Identifier: AGPL-3.0-or-later
// Theme manager: light/dark/system + background washes. Persisted in
// localStorage per device; server-side prefs sync comes later.
export type Mode = "light" | "dark" | "system";

export interface Background {
  id: string;
  name: string;
  swatch: string;
}

export const BACKGROUNDS: Background[] = [
  { id: "plain", name: "Plain", swatch: "linear-gradient(135deg,#e8ecef,#cfd8df)" },
  { id: "aurora", name: "Aurora", swatch: "linear-gradient(135deg,#2dd4a7,#58a6ff)" },
  { id: "sunset", name: "Sunset", swatch: "linear-gradient(135deg,#ffa657,#ff6384)" },
  { id: "forest", name: "Forest", swatch: "linear-gradient(135deg,#3fb950,#b8e62e)" },
  { id: "ocean", name: "Ocean", swatch: "linear-gradient(135deg,#58a6ff,#a5d6ff)" },
  { id: "lavender", name: "Lavender", swatch: "linear-gradient(135deg,#bc8cff,#e6d6ff)" },
];

const MODE_KEY = "wow-theme-mode";
const BG_KEY = "wow-theme-bg";

export function getMode(): Mode {
  const m = localStorage.getItem(MODE_KEY);
  return m === "light" || m === "dark" || m === "system" ? m : "system";
}

export function getBg(): string {
  const b = localStorage.getItem(BG_KEY);
  return b && BACKGROUNDS.some((x) => x.id === b) ? b : "plain";
}

function apply() {
  const mode = getMode();
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.bg = getBg();
}

export function setMode(mode: Mode) {
  localStorage.setItem(MODE_KEY, mode);
  apply();
}

export function setBg(id: string) {
  localStorage.setItem(BG_KEY, id);
  apply();
}

/** Follow OS dark/light changes while in system mode. Call once at app start. */
export function initTheme() {
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}
