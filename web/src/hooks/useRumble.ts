// SPDX-License-Identifier: AGPL-3.0-or-later
// useRumble: fire and forget rumble via gamepad.vibrationActuator.playEffect.
// Fails soft when no pad is connected or the actuator is absent.
import { useCallback } from "react";

type RumbleKind = "complete" | "hit" | "tick";

const PRESETS: Record<RumbleKind, { duration: number; weakMagnitude: number; strongMagnitude: number }> = {
  complete: { duration: 220, weakMagnitude: 0.45, strongMagnitude: 0.75 },
  hit: { duration: 120, weakMagnitude: 0.25, strongMagnitude: 0.9 },
  tick: { duration: 40, weakMagnitude: 0.12, strongMagnitude: 0.12 },
};

function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p) return p;
    }
  } catch {
    return null;
  }
  return null;
}

export function triggerRumble(kind: RumbleKind = "tick"): void {
  try {
    const gp = firstPad() as unknown as Record<string, unknown> | null;
    if (!gp) return;
    const actuator = (gp as { vibrationActuator?: { playEffect?: (t: string, o: unknown) => Promise<unknown> } }).vibrationActuator;
    if (!actuator?.playEffect) return;
    const preset = PRESETS[kind] ?? PRESETS.tick;
    actuator.playEffect("dual-rumble", preset).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function useRumble() {
  const rumble = useCallback((kind: RumbleKind = "tick") => {
    triggerRumble(kind);
  }, []);
  return rumble;
}

export type { RumbleKind };
