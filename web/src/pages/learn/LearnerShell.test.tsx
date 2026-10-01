// SPDX-License-Identifier: AGPL-3.0-or-later
// LearnerShell controller mode: auto-on on pad connect, explicit-off guard
// for the session, versioned localStorage persistence, HUD pad-state dot.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("../../api", () => ({
  api: vi.fn(() => new Promise(() => {})),
  niceError: (e: unknown) => String(e),
  getPreviewLearner: () => null,
  setPreviewLearner: vi.fn(),
  ApiError: class ApiError extends Error {
    code = "mock";
    status = 500;
  },
}));

const navSpies = { focusNext: vi.fn(), focusFirst: vi.fn(), speakFocused: vi.fn() };
vi.mock("../../lib/spatialNav", () => ({
  focusNext: (...a: unknown[]) => navSpies.focusNext(...a),
  focusFirst: (...a: unknown[]) => navSpies.focusFirst(...a),
  speakFocused: (...a: unknown[]) => navSpies.speakFocused(...a),
}));
const sfSpies = { triggerHint: vi.fn(), triggerNarrator: vi.fn() };
vi.mock("../../components/SpatialFocus", () => ({
  triggerHint: (...a: unknown[]) => sfSpies.triggerHint(...a),
  triggerNarrator: (...a: unknown[]) => sfSpies.triggerNarrator(...a),
}));

import LearnerShell from "./LearnerShell";

const noop = () => {};
const me = { id: 10, role: "learner" as const, name: "Maya", familyId: 1, familyName: "Test", joinCode: "ABC", prefs: {}, gradeLevel: 5, interests: [] };

function renderShell() {
  return render(
    <LearnerShell me={me} coverUrl={null} onNavigate={noop} onLogout={noop}>
      <div data-testid="stage" />
    </LearnerShell>
  );
}

function controllerBtn(): HTMLElement {
  return screen.getByRole("button", { name: /Controller mode (on|off)/ });
}

// jsdom has no Gamepad API; the hook listens on window, so a hand-built
// event reaches the same listener a real browser would fire.
function connectPad() {
  const ev = new Event("gamepadconnected") as GamepadEvent;
  Object.defineProperty(ev, "gamepad", { value: { id: "Test Pad", buttons: [], axes: [] } });
  act(() => {
    window.dispatchEvent(ev);
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("controller auto-on and persistence", () => {
  it("auto-turns on when a pad connects and persists the choice", () => {
    renderShell();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("false");
    connectPad();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("wow-controller-mode.v1")).toBe("on");
  });

  it("an explicit off this session survives pad connects", () => {
    localStorage.setItem("wow-controller-mode.v1", "on");
    renderShell();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(controllerBtn());
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("false");
    connectPad();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("wow-controller-mode.v1")).toBe("off");
  });

  it("the preference survives a remount", () => {
    localStorage.setItem("wow-controller-mode.v1", "on");
    const { unmount } = renderShell();
    unmount();
    renderShell();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("true");
  });

  it("migrates the pre-versioning toggle key", () => {
    localStorage.setItem("wow-controller-mode", "on");
    renderShell();
    expect(controllerBtn().getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("wow-controller-mode.v1")).toBe("on");
  });

  it("HUD shows pad state only while a pad is connected", () => {
    const { container } = renderShell();
    expect(container.querySelector(".hud-pad-dot")).toBeNull();
    connectPad();
    expect(container.querySelector(".hud-pad-dot")).not.toBeNull();
  });

  it("pad legend appears with the mode on and hides when the learner turns it off", () => {
    const { container } = renderShell();
    connectPad();
    expect(container.querySelector(".padlegend")).not.toBeNull();
    fireEvent.click(controllerBtn());
    expect(container.querySelector(".padlegend")).toBeNull();
  });
});

describe("the shell yields face buttons to an embedded answer pad", () => {
  // The hook polls navigator.getGamepads() each frame; a stub plus a manual
  // rAF queue drive the same poll a browser runs. buttons[i].pressed is the
  // edge the hook reacts to. jsdom does not tick rAF on its own.
  let rafQueue: FrameRequestCallback[] = [];
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false }));
  const pad = { id: "Test Pad", connected: true, buttons, axes: [] as unknown[] };

  function tick() {
    const q = rafQueue;
    rafQueue = [];
    q.forEach((cb) => cb(performance.now()));
  }

  async function pressFace(index: number) {
    buttons[index].pressed = true;
    await act(async () => { tick(); await Promise.resolve(); });
    buttons[index].pressed = false;
    await act(async () => { tick(); await Promise.resolve(); });
  }

  beforeEach(() => {
    rafQueue = [];
    buttons.forEach((b) => { b.pressed = false; });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window.navigator, "getGamepads", { value: () => [pad], configurable: true });
    window.history.pushState({}, "", "/learner");
  });

  it("B navigates back when no answer pad is listening", async () => {
    const back = vi.spyOn(window.history, "back");
    renderShell();
    connectPad();
    await pressFace(1);
    expect(back).toHaveBeenCalled();
    back.mockRestore();
  });

  it("B is swallowed while an answer pad listens, but the d-pad still moves focus", async () => {
    const back = vi.spyOn(window.history, "back");
    const marker = document.createElement("div");
    marker.setAttribute("data-gamepad-active", "true");
    document.body.appendChild(marker);
    renderShell();
    connectPad();
    await pressFace(1);
    expect(back).not.toHaveBeenCalled();
    await pressFace(13);
    expect(navSpies.focusNext).toHaveBeenCalledWith("down");
    back.mockRestore();
    marker.remove();
  });

  it("Y is swallowed while an answer pad listens and works again after it unmounts", async () => {
    renderShell();
    connectPad();
    const marker = document.createElement("div");
    marker.setAttribute("data-gamepad-active", "true");
    document.body.appendChild(marker);
    await pressFace(3);
    expect(sfSpies.triggerHint).not.toHaveBeenCalled();
    marker.remove();
    await pressFace(3);
    expect(sfSpies.triggerHint).toHaveBeenCalled();
  });
});
