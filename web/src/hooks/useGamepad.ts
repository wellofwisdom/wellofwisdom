// SPDX-License-Identifier: AGPL-3.0-or-later
// useGamepad: polls navigator.getGamepads() in requestAnimationFrame.
// Returns connected state, buttons, axes and vibrationActuator.
// Auto on: when a pad connects, set wow-controller-mode to on.
// On disconnect, keep the setting but expose connected false so the
// legend can hide while the preference stays.
import { useCallback, useEffect, useRef, useState } from "react";

const CONTROLLER_KEY = "wow-controller-mode";

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

function setControllerOn(): void {
  try {
    localStorage.setItem(CONTROLLER_KEY, "on");
  } catch {
    /* ignore */
  }
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
  const [buttons, setButtons] = useState<GamepadButton[]>(() => firstPad()?.buttons.slice() ?? []);
  const [axes, setAxes] = useState<number[]>(() => firstPad()?.axes.slice() ?? []);
  const [gamepad, setGamepad] = useState<Gamepad | null>(() => firstPad());

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
  const nextRepeat = useRef<number[]>([]);
  const prevAxes = useRef<number[]>([]);
  const axisNextRepeat = useRef<number[]>([]);
  const wasConnected = useRef(connected);
  const raf = useRef<number | null>(null);

  const vibrationActuator = (gamepad as unknown as { vibrationActuator?: GamepadHapticActuator | null } | null)?.vibrationActuator ?? null;

  const poll = useCallback(() => {
    const gp = firstPad();
    const nowConnected = Boolean(gp);

    if (nowConnected !== wasConnected.current) {
      wasConnected.current = nowConnected;
      setConnected(nowConnected);
      if (gp) {
        setPadId(gp.id);
        setControllerOn();
        onConnectRef.current?.(gp);
      } else {
        setPadId(null);
        onDisconnectRef.current?.();
        prevButtons.current = [];
        prevAxes.current = [];
        setButtons([]);
        setAxes([]);
        setGamepad(null);
      }
    }

    if (gp) {
      setGamepad(gp);
      setButtons(gp.buttons.slice());
      setAxes(gp.axes.slice());
    }

    if (gp && enabled) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      for (let i = 0; i < gp.buttons.length; i++) {
        const pressed = Boolean(gp.buttons[i]?.pressed);
        const was = Boolean(prevButtons.current[i]);
        if (pressed && !was) {
          onButtonDownRef.current?.(i, gp);
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
  }, [deadZone, enabled, repeatDelay, repeatRate]);

  useEffect(() => {
    const onConnectedEv = (e: GamepadEvent) => {
      setConnected(true);
      setPadId(e.gamepad.id);
      setGamepad(e.gamepad);
      wasConnected.current = true;
      setControllerOn();
      onConnectRef.current?.(e.gamepad);
    };
    const onDisconnectedEv = () => {
      const still = Boolean(firstPad());
      if (!still) {
        setConnected(false);
        setPadId(null);
        setGamepad(null);
        wasConnected.current = false;
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

  return { connected, padId, buttons, axes, gamepad, vibrationActuator };
}
