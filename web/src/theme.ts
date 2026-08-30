// SPDX-License-Identifier: AGPL-3.0-or-later
// Theme manager: light/dark/system, background washes, accent colors,
// custom background image, reading size. Persisted per device; server-side
// sync comes later.
export type Mode = "light" | "dark" | "system";
export type TextScale = "compact" | "normal" | "large";

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
  { id: "emerald", name: "Emerald", swatch: "linear-gradient(135deg,#0f9b8e,#79e0c3)" },
  { id: "midnight", name: "Midnight", swatch: "linear-gradient(135deg,#1f2a68,#4f5bd5)" },
  { id: "peach", name: "Peach", swatch: "linear-gradient(135deg,#ffb199,#ff0844)" },
  { id: "meadow", name: "Meadow", swatch: "linear-gradient(135deg,#d4fc79,#96e6a1)" },
  { id: "slate", name: "Slate", swatch: "linear-gradient(135deg,#8e9eab,#eef2f3)" },
  { id: "rose", name: "Rose", swatch: "linear-gradient(135deg,#fbc2eb,#a6c1ee)" },
];

export interface Accent {
  id: string;
  name: string;
  base: string;
  dark: string; // accent for dark mode
  soft: string; // soft bg light
  softDark: string;
  contrast: string;
  contrastDark: string;
}

export const ACCENTS: Accent[] = [
  { id: "teal", name: "Hazel teal", base: "#0f7d5c", dark: "#2dd4a7", soft: "#e0f2ec", softDark: "#12362e", contrast: "#ffffff", contrastDark: "#07130f" },
  { id: "blue", name: "Deep water", base: "#0969da", dark: "#58a6ff", soft: "#dbeafe", softDark: "#12253d", contrast: "#ffffff", contrastDark: "#0a1220" },
  { id: "violet", name: "Twilight", base: "#7c3aed", dark: "#a78bfa", soft: "#ede9fe", softDark: "#241b3d", contrast: "#ffffff", contrastDark: "#120c22" },
  { id: "rose", name: "Rowan rose", base: "#be185d", dark: "#f472b6", soft: "#fce7f3", softDark: "#3b0f26", contrast: "#ffffff", contrastDark: "#1f0813" },
  { id: "amber", name: "Ochre", base: "#b45309", dark: "#fbbf24", soft: "#fef3c7", softDark: "#38240a", contrast: "#ffffff", contrastDark: "#1e1204" },
  { id: "green", name: "Moss", base: "#15803d", dark: "#4ade80", soft: "#dcfce7", softDark: "#0d2b18", contrast: "#ffffff", contrastDark: "#06170c" },
  { id: "sky", name: "Sky", base: "#0369a1", dark: "#38bdf8", soft: "#e0f2fe", softDark: "#0c2537", contrast: "#ffffff", contrastDark: "#061824" },
  { id: "plum", name: "Plum", base: "#9d174d", dark: "#e879f9", soft: "#fae8ff", softDark: "#33102a", contrast: "#ffffff", contrastDark: "#1b0815" },
];

const MODE_KEY = "wow-theme-mode";
const BG_KEY = "wow-theme-bg";
const ACCENT_KEY = "wow-accent";
const BGIMG_KEY = "wow-bgimg";
const SCALE_KEY = "wow-textscale";

export function getMode(): Mode {
  const m = localStorage.getItem(MODE_KEY);
  return m === "light" || m === "dark" || m === "system" ? m : "system";
}

export function getBg(): string {
  const b = localStorage.getItem(BG_KEY);
  return b && BACKGROUNDS.some((x) => x.id === b) ? b : "plain";
}

export function getAccent(): string {
  const a = localStorage.getItem(ACCENT_KEY);
  return a && ACCENTS.some((x) => x.id === a) ? a : "teal";
}

export function getBgImage(): string {
  return localStorage.getItem(BGIMG_KEY) || "";
}

export function getTextScale(): TextScale {
  const s = localStorage.getItem(SCALE_KEY);
  return s === "compact" || s === "large" ? s : "normal";
}

function apply() {
  const root = document.documentElement;
  const mode = getMode();
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.bg = getBg();

  const a = ACCENTS.find((x) => x.id === getAccent()) || ACCENTS[0];
  root.style.setProperty("--accent", dark ? a.dark : a.base);
  root.style.setProperty("--accent-soft", dark ? a.softDark : a.soft);
  root.style.setProperty("--accent-contrast", dark ? a.contrastDark : a.contrast);
  root.style.setProperty("--focus", dark ? `0 0 0 3px ${a.dark}55` : `0 0 0 3px ${a.base}55`);

  const img = getBgImage();
  root.style.setProperty("--bg-image", img ? `url("${img.replace(/"/g, "")}")` : "none");
  // empty string would still match the [data-bgimg] CSS selector — remove it
  if (img) root.dataset.bgimg = "1";
  else root.removeAttribute("data-bgimg");

  root.dataset.textscale = getTextScale();
}

export function setMode(mode: Mode) { localStorage.setItem(MODE_KEY, mode); apply(); }
export function setBg(id: string) { localStorage.setItem(BG_KEY, id); apply(); }
export function setAccent(id: string) { localStorage.setItem(ACCENT_KEY, id); apply(); }
export function setBgImage(url: string) {
  if (url) localStorage.setItem(BGIMG_KEY, url); else localStorage.removeItem(BGIMG_KEY);
  apply();
}
export function setTextScale(s: TextScale) { localStorage.setItem(SCALE_KEY, s); apply(); }

/** Follow OS dark/light changes while in system mode. Call once at app start. */
export function initTheme() {
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}
