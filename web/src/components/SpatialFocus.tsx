// SPDX-License-Identifier: AGPL-3.0-or-later
// SpatialFocus: controller focus manager plus hint and narrator triggers.
// D-pad or left stick moves focus to the nearest [data-nav] by direction.
// LearnerShell owns the gamepad polling; this module owns the focus
// geometry (via lib/spatialNav) and the Y / RT helpers so the shell stays
// small. No server endpoint, no migration.
import { focusNext, focusFirst, speakFocused } from "../lib/spatialNav";

export { focusNext, focusFirst, speakFocused };

function queryHintButton(): HTMLButtonElement | null {
  const active = document.activeElement as HTMLElement | null;
  const scope = (active?.closest(".litem, .lessoncard, .exercise") as HTMLElement | null) || null;
  const candidates: (HTMLButtonElement | null)[] = [];
  if (scope) {
    candidates.push(scope.querySelector<HTMLButtonElement>(".hintladder button[data-nav]"));
    candidates.push(scope.querySelector<HTMLButtonElement>(".hintladder button"));
    candidates.push(scope.querySelector<HTMLButtonElement>('button[aria-label*="hint" i]'));
  }
  candidates.push(document.querySelector<HTMLButtonElement>(".hintladder button[data-nav]"));
  candidates.push(document.querySelector<HTMLButtonElement>(".hintladder button"));
  candidates.push(document.querySelector<HTMLButtonElement>('button[aria-label*="hint" i]'));
  for (const c of candidates) if (c) return c;
  return null;
}

export function triggerHint(): boolean {
  const btn = queryHintButton();
  if (!btn) return false;
  try {
    btn.click();
    btn.focus();
  } catch {
    /* ignore */
  }
  return true;
}

function queryNarratorButton(): HTMLButtonElement | null {
  const active = document.activeElement as HTMLElement | null;
  const scope = (active?.closest(".litem, .lessoncard, .encmodalin, .world") as HTMLElement | null) || null;
  const candidates: (HTMLButtonElement | null)[] = [];
  if (scope) {
    candidates.push(scope.querySelector<HTMLButtonElement>(".narrator-btn"));
    candidates.push(scope.querySelector<HTMLButtonElement>('button[aria-label*="narration" i]'));
    candidates.push(scope.querySelector<HTMLButtonElement>('button[aria-label*="Listen" i]'));
  }
  candidates.push(document.querySelector<HTMLButtonElement>(".narrator-btn"));
  candidates.push(document.querySelector<HTMLButtonElement>('button[aria-label*="Listen to this scene" i]'));
  candidates.push(document.querySelector<HTMLButtonElement>('button[aria-label*="Listen" i]'));
  for (const c of candidates) if (c) return c;
  return null;
}

export function triggerNarrator(): boolean {
  const btn = queryNarratorButton();
  if (btn) {
    try {
      btn.click();
      return true;
    } catch {
      /* ignore */
    }
  }
  const w = window as unknown as { __wowNarrator?: (t: string) => void };
  if (w.__wowNarrator) {
    try {
      const el = document.activeElement as HTMLElement | null;
      const msg = el?.getAttribute("data-say") || el?.getAttribute("aria-label") || el?.textContent?.trim() || "";
      if (msg) { w.__wowNarrator(msg.slice(0, 600)); return true; }
    } catch {
      /* ignore */
    }
  }
  try {
    speakFocused();
    return true;
  } catch {
    /* ignore */
  }
  return false;
}

export default function SpatialFocus() {
  return null;
}
