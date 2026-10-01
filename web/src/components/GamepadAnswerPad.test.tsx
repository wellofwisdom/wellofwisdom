// SPDX-License-Identifier: AGPL-3.0-or-later
// GamepadAnswerPad tests: face-button choice mapping, numeric keypad, and the
// ExerciseItem path keeping rumble on correct alive. jsdom has no Gamepad API,
// so a fake pad backs navigator.getGamepads and rAF runs on timers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import GamepadAnswerPad from "./GamepadAnswerPad";
import ExerciseItem from "../pages/learn/items/ExerciseItem";
import { I18nContext } from "../i18n";
import { triggerRumble } from "../lib/gamepad";

vi.mock("../api", () => ({
  api: vi.fn(() => Promise.resolve({ correct: true, reveal: { kind: "mcq", explanation: "Well done", hint: null, answer: null, feedback: null } })),
  niceError: (e: unknown) => String(e),
}));

vi.mock("../components/PushToTalk", () => ({ PushToTalk: () => null }));
vi.mock("../lib/gamepad", () => ({ triggerRumble: vi.fn() }));
vi.mock("../pages/learn/TutorChat", () => ({ default: () => null }));

type FakeButton = { pressed: boolean; value: number };
const padButtons: FakeButton[] = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));

function setPad(present: boolean): void {
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () =>
      present
        ? [{ id: "Test Pad", connected: true, mapping: "standard", timestamp: Date.now(), buttons: padButtons, axes: [0, 0] }]
        : [],
  });
}

function stubRaf(): void {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function press(index: number): Promise<void> {
  await act(async () => {
    padButtons[index] = { pressed: true, value: 1 };
    await sleep(60);
    padButtons[index] = { pressed: false, value: 0 };
    await sleep(60);
  });
}

const CHOICES = [
  { id: "c1", text: "Paris" },
  { id: "c2", text: "Lyon" },
  { id: "c3", text: "Marseille" },
  { id: "c4", text: "Nice" },
];

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

function NumericHarness({ onSubmit }: { onSubmit: () => void }) {
  const [v, setV] = useState("");
  return (
    <>
      <GamepadAnswerPad kind="numeric" value={v} onInput={setV} onSubmit={onSubmit} />
      <output data-testid="val">{v}</output>
    </>
  );
}

const MCQ_ITEM = {
  id: 10,
  type: "exercise" as const,
  position: 0,
  content: { kind: "mcq", prompt: "Capital of France?", choices: CHOICES },
};

beforeEach(() => {
  stubRaf();
  for (let i = 0; i < padButtons.length; i++) padButtons[i] = { pressed: false, value: 0 };
});

describe("GamepadAnswerPad", () => {
  it("renders nothing when no pad is connected", () => {
    setPad(false);
    const { container } = render(<GamepadAnswerPad kind="mcq" choices={CHOICES} onPick={vi.fn()} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("face buttons A B X Y pick choices 1 to 4 and the legend shows them", async () => {
    setPad(true);
    const onPick = vi.fn();
    render(<GamepadAnswerPad kind="mcq" choices={CHOICES} onPick={onPick} />);
    const legend = screen.getByRole("note");
    expect(legend.textContent).toContain("1. Paris");
    expect(legend.textContent).toContain("4. Nice");
    await press(0); // A
    await press(3); // Y
    await press(1); // B
    await press(2); // X
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(["c1", "c4", "c2", "c3"]);
  });

  it("ignores face buttons while busy", async () => {
    setPad(true);
    const onPick = vi.fn();
    render(<GamepadAnswerPad kind="mcq" choices={CHOICES} onPick={onPick} busy />);
    await press(0);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("numeric keypad edits the answer, enter submits, B closes, chip reopens", async () => {
    setPad(true);
    const onSubmit = vi.fn();
    render(<NumericHarness onSubmit={onSubmit} />);
    screen.getByRole("group", { name: "Number pad" });
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "." }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByTestId("val").textContent).toBe("7.3");
    fireEvent.click(screen.getByRole("button", { name: "enter" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await press(1); // B closes
    expect(screen.queryByRole("group", { name: "Number pad" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Number pad" }));
    expect(screen.getByRole("group", { name: "Number pad" })).toBeTruthy();
  });

  it("enter does nothing on an empty answer", () => {
    setPad(true);
    const onSubmit = vi.fn();
    render(<NumericHarness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "enter" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ExerciseItem with a pad connected", () => {
  it("A picks choice 1 and check still rumbles on correct", async () => {
    setPad(true);
    const onSolved = vi.fn();
    render(tWrap(<ExerciseItem item={MCQ_ITEM} solved={{}} onSolved={onSolved} qKey="10:0" qIdx={0} question={null} />));
    await press(0); // A picks the first choice
    await waitFor(() => {
      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toHaveAttribute("aria-checked", "true");
    });
    fireEvent.click(screen.getByRole("button", { name: "exercise.check" }));
    await waitFor(() => expect(onSolved).toHaveBeenCalled());
    await waitFor(() => expect(triggerRumble).toHaveBeenCalledWith("hit"));
  });
});
