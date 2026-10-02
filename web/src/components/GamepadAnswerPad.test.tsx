// SPDX-License-Identifier: AGPL-3.0-or-later
// GamepadAnswerPad tests: face-button choice mapping, focus-based fall-through
// to the shell, numeric keypad, and the ExerciseItem path keeping rumble on
// correct alive. jsdom has no Gamepad API, so a fake pad backs
// navigator.getGamepads and rAF runs on timers. Focus is moved with real
// .focus() calls (not fireEvent) so jsdom fires focusin and the pad's
// focus tracking sees it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCallback, useState } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import GamepadAnswerPad from "./GamepadAnswerPad";
import ExerciseItem from "../pages/learn/items/ExerciseItem";
import { I18nContext } from "../i18n";
import { triggerRumble } from "../lib/gamepad";
import { useGamepad } from "../hooks/useGamepad";
import { api } from "../api";

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

function focusEl(el: Element | null): void {
  act(() => {
    (el as HTMLElement | null)?.focus();
  });
}

function blurEl(el: Element | null): void {
  act(() => {
    (el as HTMLElement | null)?.blur();
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

// Mirrors the exercise DOM the pad depends on: choice radios and the pad share
// one radiogroup, like ExerciseItem renders them.
function McqHarness({ onPick, busy }: { onPick: (id: string) => void; busy?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Choices">
      {CHOICES.map((c) => (
        <button key={c.id} type="button" role="radio" aria-label={c.text} data-nav onClick={() => onPick(c.id)}>
          {c.text}
        </button>
      ))}
      <GamepadAnswerPad kind="mcq" choices={CHOICES} onPick={onPick} busy={busy} />
    </div>
  );
}

function NumericHarness({ onSubmit }: { onSubmit: () => void }) {
  const [v, setV] = useState("");
  return (
    <>
      <GamepadAnswerPad kind="numeric" value={v} onInput={setV} onSubmit={onSubmit} />
      <output data-testid="val">{v}</output>
    </>
  );
}

// Stand-in for the merged LearnerShell guard (PR 111): while any
// data-gamepad-active root is present the shell ignores face buttons;
// otherwise A clicks the focused data-nav element.
function ShellStandIn({ children }: { children: React.ReactNode }) {
  const onButtonDown = useCallback((index: number) => {
    if (index <= 3 && document.querySelector("[data-gamepad-active]")) return;
    if (index === 0) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.hasAttribute("data-nav")) el.click();
    }
  }, []);
  useGamepad({ enabled: true, onButtonDown });
  return <>{children}</>;
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

  it("face buttons A B X Y pick choices 1 to 4 while a choice is focused, and the legend says so", async () => {
    setPad(true);
    const onPick = vi.fn();
    render(<McqHarness onPick={onPick} />);
    const legend = screen.getByRole("note");
    expect(legend.textContent).toContain("1. Paris");
    expect(legend.textContent).toContain("4. Nice");
    expect(screen.getByText(/while a choice is focused/)).toBeTruthy();

    focusEl(screen.getAllByRole("radio")[0]);
    expect(document.querySelector("[data-gamepad-active]")).not.toBeNull();
    await press(0); // A
    await press(3); // Y
    await press(1); // B
    await press(2); // X
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(["c1", "c4", "c2", "c3"]);
  });

  it("yields the face buttons when focus is outside the choices", async () => {
    setPad(true);
    const onPick = vi.fn();
    render(<McqHarness onPick={onPick} />);
    focusEl(screen.getAllByRole("radio")[0]);
    blurEl(screen.getAllByRole("radio")[0]);
    expect(document.querySelector("[data-gamepad-active]")).toBeNull();
    await press(0); // A would pick choice 1 if the pad still owned it
    expect(onPick).not.toHaveBeenCalled();
  });

  it("ignores face buttons while busy", async () => {
    setPad(true);
    const onPick = vi.fn();
    render(<McqHarness onPick={onPick} busy />);
    focusEl(screen.getAllByRole("radio")[0]);
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
  it("A picks the focused choice and check still rumbles on correct", async () => {
    setPad(true);
    const onSolved = vi.fn();
    render(tWrap(<ExerciseItem item={MCQ_ITEM} solved={{}} onSolved={onSolved} qKey="10:0" qIdx={0} question={null} />));
    focusEl(screen.getAllByRole("radio")[0]);
    await press(0); // A picks the focused choice
    await waitFor(() => {
      const radios = screen.getAllByRole("radio");
      expect(radios[0]).toHaveAttribute("aria-checked", "true");
    });
    fireEvent.click(screen.getByRole("button", { name: "exercise.check" }));
    await waitFor(() => expect(onSolved).toHaveBeenCalled());
    await waitFor(() => expect(triggerRumble).toHaveBeenCalledWith("hit"));
  });

  it("falls through to Check when focus is outside the choices: Check activates, no pick happens", async () => {
    setPad(true);
    const onSolved = vi.fn();
    render(
      tWrap(
        <ShellStandIn>
          <ExerciseItem item={MCQ_ITEM} solved={{}} onSolved={onSolved} qKey="10:0" qIdx={0} question={null} />
        </ShellStandIn>,
      ),
    );
    // Pick Lyon (choice 2, mapped to B) so Check is enabled and any stray
    // pick by A would be visible as a flip back to Paris.
    focusEl(screen.getAllByRole("radio")[0]);
    await press(1);
    await waitFor(() => expect(screen.getAllByRole("radio")[1]).toHaveAttribute("aria-checked", "true"));
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "false");
    // Move focus to the Check button: the pad must drop data-gamepad-active.
    focusEl(screen.getByRole("button", { name: "exercise.check" }));
    expect(document.querySelector("[data-gamepad-active]")).toBeNull();
    // A now belongs to the shell: it activates Check and must not pick.
    await press(0);
    await waitFor(() => expect(onSolved).toHaveBeenCalledWith("10:0", true));
    // The submit went out with Lyon still picked: no stray choice-1 pick.
    const lastAttempt = vi.mocked(api).mock.calls.at(-1) as unknown as [string, { body: { answer: string } }];
    expect(lastAttempt[1].body.answer).toBe("c2");
  });
});
