// SPDX-License-Identifier: AGPL-3.0-or-later
// Spatial focus manager: d-pad or left stick moves focus to the nearest
// [data-nav] candidate in that direction using rectangle geometry.
// Keyboard arrows use the same path so it is testable without hardware.
export type Dir = "up" | "down" | "left" | "right";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function toRect(r: DOMRect): Rect {
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

function isInDir(from: Rect, to: Rect, dir: Dir): boolean {
  if (dir === "up") return to.cy < from.cy - 1;
  if (dir === "down") return to.cy > from.cy + 1;
  if (dir === "left") return to.cx < from.cx - 1;
  return to.cx > from.cx + 1;
}

function score(from: Rect, to: Rect, dir: Dir): number {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  let primary: number;
  let secondary: number;
  if (dir === "up" || dir === "down") {
    primary = Math.abs(dy);
    secondary = Math.abs(dx);
    const overlapX = Math.max(0, Math.min(from.right, to.right) - Math.max(from.left, to.left));
    if (overlapX > 0) secondary *= 0.3;
  } else {
    primary = Math.abs(dx);
    secondary = Math.abs(dy);
    const overlapY = Math.max(0, Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top));
    if (overlapY > 0) secondary *= 0.3;
  }
  const dist = Math.hypot(dx, dy);
  return primary + secondary * 0.6 + dist * 0.15;
}

export function findNearest(
  from: Rect,
  candidates: Rect[],
  dir: Dir
): number | null {
  let bestIdx: number | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!isInDir(from, c, dir)) continue;
    const s = score(from, c, dir);
    if (s < bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function pickFromDom(fromEl: Element | null, dir: Dir, root: ParentNode = document): Element | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>("[data-nav]"));
  if (all.length === 0) return null;
  if (!fromEl || !all.includes(fromEl as HTMLElement)) {
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused.hasAttribute("data-nav")) fromEl = focused;
    else return all[0];
  }
  const from = fromEl as HTMLElement;
  const fromRect = toRect(from.getBoundingClientRect());
  const rects = all.map((el) => toRect(el.getBoundingClientRect()));
  const selfIdx = all.indexOf(from);
  const candidates = rects.filter((_, i) => i !== selfIdx);
  const mapped = candidates.map((r, i) => {
    const orig = i >= selfIdx ? i + 1 : i;
    return { r, orig };
  });
  const fromForScore = fromRect;
  const candsOnly = mapped.map((m) => m.r);
  const hit = findNearest(fromForScore, candsOnly, dir);
  if (hit === null) return null;
  return all[mapped[hit].orig];
}

export function focusNext(dir: Dir, root: ParentNode = document): boolean {
  const active = document.activeElement as Element | null;
  const next = pickFromDom(active, dir, root);
  if (!next) return false;
  (next as HTMLElement).focus();
  try {
    (next as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  } catch {
    /* ignore */
  }
  return true;
}

export function focusFirst(root: ParentNode = document): boolean {
  const first = root.querySelector<HTMLElement>("[data-nav]");
  if (!first) return false;
  first.focus();
  return true;
}

export function speakFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return;
  const msg = el.getAttribute("data-say") || el.getAttribute("aria-label") || el.textContent?.trim() || "";
  if (!msg) return;
  const existing = (window as unknown as { __wowNarrator?: (t: string) => void }).__wowNarrator;
  if (existing) {
    try { existing(msg); return; } catch { /* fall through */ }
  }
  if (typeof speechSynthesis === "undefined") return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg.slice(0, 600));
    u.rate = 1;
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
