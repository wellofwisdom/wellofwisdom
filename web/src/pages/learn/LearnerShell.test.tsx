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
