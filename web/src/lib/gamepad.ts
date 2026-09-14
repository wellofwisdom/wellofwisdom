// SPDX-License-Identifier: AGPL-3.0-or-later
// useGamepad: polls navigator.getGamepads() each animation frame,
// emits button and axis events with dead zone and repeat, tracks connect.
import { useEffect, useRef, useState, useCallback } from "react";

export const DEAD_ZONE = 0.35;
export const REPEAT_DELAY = 360;
export const REPEAT_RATE = 140;

export type ButtonHandler = (index: number, gp: Gamepad) => void;
export type AxisHandler = (index: number, value: number, gp: Gamepad) => void;

interface Options {
  deadZone?: number;
  repeatDelay?: number;
  repeatRate?: number;
  onButtonDown?: ButtonHandler;
  onButtonUp?: ButtonHandler;
  onAxis?: AxisHandler;
  onConnect?: (gp: Gamepad) => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p) return p;
  }
  return null;
}

export function useGamepad(opts: Options = {}) {
  const {
    deadZone = DEAD_ZONE,
    repeatDelay = REPEAT_DELAY,
    repeatRate = REPEAT_RATE,
    onButtonDown,
    onButtonUp,
    onAxis,
    onConnect,
    onDisconnect,
    enabled = true,
  } = opts;

  const [connected, setConnected] = useState<boolean>(() => Boolean(firstPad()));
  const [padId, setPadId] = useState<string | null>(() => firstPad()?.id ?? null);

  const onButtonDownRef = useRef(onButtonDown);
  const onButtonUpRef = useRef(onButtonUp);
  const onAxisRef = useRef(onAxis);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  useEffect(() => { onButtonDownRef.current = onButtonDown; }, [onButtonDown]);
  useEffect(() => { onButtonUpRef.current = onButtonUp; }, [onButtonUp]);
  useEffect(() => { onAxisRef.current = onAxis; }, [onAxis]);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);

  const prevButtons = useRef<boolean[]>([]);
  const holdStart = useRef<number[]>([]);
  const nextRepeat = useRef<number[]>([]);
  const prevAxes = useRef<number[]>([]);
  const axisNextRepeat = useRef<number[]>([]);
  const wasConnected = useRef(connected);
  const raf = useRef<number | null>(null);

  const poll = useCallback(() => {
    const gp = firstPad();
    const nowConnected = Boolean(gp);
    if (nowConnected !== wasConnected.current) {
      wasConnected.current = nowConnected;
      setConnected(nowConnected);
      if (gp) {
        setPadId(gp.id);
        onConnectRef.current?.(gp);
      } else {
        setPadId(null);
        onDisconnectRef.current?.();
        prevButtons.current = [];
        prevAxes.current = [];
      }
    }
    if (gp && enabled) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      for (let i = 0; i < gp.buttons.length; i++) {
        const pressed = Boolean(gp.buttons[i]?.pressed);
        const was = Boolean(prevButtons.current[i]);
        if (pressed && !was) {
          onButtonDownRef.current?.(i, gp);
          holdStart.current[i] = now;
          nextRepeat.current[i] = now + repeatDelay;
        } else if (pressed && was) {
          const nr = nextRepeat.current[i] ?? now + repeatDelay;
          if (now >= nr) {
            onButtonDownRef.current?.(i, gp);
            nextRepeat.current[i] = now + repeatRate;
          }
        } else if (!pressed && was) {
          onButtonUpRef.current?.(i, gp);
          nextRepeat.current[i] = 0;
        }
        prevButtons.current[i] = pressed;
      }
      for (let i = 0; i < gp.axes.length; i++) {
        let v = gp.axes[i] ?? 0;
        if (Math.abs(v) < deadZone) v = 0;
        const prev = prevAxes.current[i] ?? 0;
        const isActive = v !== 0;
        const wasActive = prev !== 0;
        if (isActive && !wasActive) {
          onAxisRef.current?.(i, v, gp);
          axisNextRepeat.current[i] = now + repeatDelay;
        } else if (isActive && wasActive) {
          const crossSign = Math.sign(v) !== Math.sign(prev);
          if (crossSign) {
            onAxisRef.current?.(i, v, gp);
            axisNextRepeat.current[i] = now + repeatDelay;
          } else if (now >= (axisNextRepeat.current[i] ?? 0)) {
            onAxisRef.current?.(i, v, gp);
            axisNextRepeat.current[i] = now + repeatRate;
          }
        }
        prevAxes.current[i] = v;
      }
    }
    raf.current = requestAnimationFrame(poll);
  }, [deadZone, repeatDelay, repeatRate, enabled]);

  useEffect(() => {
    const onConnectedEv = (e: GamepadEvent) => {
      setConnected(true);
      setPadId(e.gamepad.id);
      onConnectRef.current?.(e.gamepad);
    };
    const onDisconnectedEv = () => {
      const still = Boolean(firstPad());
      if (!still) {
        setConnected(false);
        setPadId(null);
        onDisconnectRef.current?.();
      }
    };
    window.addEventListener("gamepadconnected", onConnectedEv as EventListener);
    window.addEventListener("gamepaddisconnected", onDisconnectedEv as EventListener);
    raf.current = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("gamepadconnected", onConnectedEv as EventListener);
      window.removeEventListener("gamepaddisconnected", onDisconnectedEv as EventListener);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [poll]);

  return { connected, padId };
}

export function triggerRumble(kind: "complete" | "hit" | "tick" = "tick") {
  try {
    const gp = firstPad() as unknown as Record<string, unknown> | null;
    if (!gp) return;
    const actuator = (gp as { vibrationActuator?: { playEffect?: (t: string, o: unknown) => Promise<unknown> } }).vibrationActuator;
    if (!actuator?.playEffect) return;
    const presets: Record<string, { duration: number; weakMagnitude: number; strongMagnitude: number }> = {
      complete: { duration: 220, weakMagnitude: 0.45, strongMagnitude: 0.75 },
      hit: { duration: 120, weakMagnitude: 0.25, strongMagnitude: 0.9 },
      tick: { duration: 40, weakMagnitude: 0.12, strongMagnitude: 0.12 },
    };
    const p = presets[kind] || presets.tick;
    actuator.playEffect("dual-rumble", p).catch(() => {});
  } catch {
    /* ignore */
  }
}
