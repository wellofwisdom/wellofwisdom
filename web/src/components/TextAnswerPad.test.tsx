// SPDX-License-Identifier: AGPL-3.0-or-later
// TextAnswerPad tests: the offer when focus enters the served input, keyboard
// entry, A pressing the focused key under the shell guard, B backing out, the
// yield when focus leaves the keys, the ExerciseItem text path, and the width
// budget. jsdom has no Gamepad API and no layout engine, so a fake pad backs
// navigator.getGamepads, rAF runs on timers, and the readable-at-both-sizes
// rule is measured from the grid's own inline values instead of eyeballed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRef, useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TextAnswerPad from "./TextAnswerPad";
import ExerciseItem from "../pages/learn/items/ExerciseItem";
import { I18nContext } from "../i18n";
import { useGamepad } from "../hooks/useGamepad";

vi.mock("../api", () => ({
  api: vi.fn(() => Promise.resolve({ correct: true, reveal: { kind: "text", explanation: null, hint: null, answer: null, feedback: null } })),
  niceError: (e: unknown) => String(e),
}));

vi.mock("../components/PushToTalk", () => ({ PushToTalk: () => null }));
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

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

// The pad serves a textarea through a ref, the way ExerciseItem, TranslateItem
// and TutorChat mount it. The second button stands in for any other data-nav
// control on the page.
function Harness({ onSubmit, busy }: { onSubmit?: () => void; busy?: boolean }) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [v, setV] = useState("");
  return (
    <>
      <textarea ref={inputRef} data-nav aria-label="answer" value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" data-nav aria-label="elsewhere" onClick={() => {}}>
        elsewhere
      </button>
      <TextAnswerPad inputRef={inputRef} value={v} onInput={setV} onSubmit={onSubmit} busy={busy} />
      <output data-testid="val">{v}</output>
    </>
  );
}

// Stand-in for the merged LearnerShell guard (PR 111): while any
// data-gamepad-active root is present the shell ignores face buttons;
// otherwise A clicks the focused data-nav element.
function ShellStandIn({ children }: { children: React.ReactNode }) {
  const onButtonDown = (index: number) => {
    if (index <= 3 && document.querySelector("[data-gamepad-active]")) return;
    if (index === 0) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.hasAttribute("data-nav")) el.click();
    }
  };
  useGamepad({ enabled: true, onButtonDown });
  return <>{children}</>;
}

async function openPad(): Promise<void> {
  focusEl(screen.getByLabelText("answer"));
  fireEvent.click(screen.getByRole("button", { name: "pad.textPad" }));
  await act(async () => {});
}

const TEXT_ITEM = {
  id: 11,
  type: "exercise" as const,
  position: 0,
  content: { kind: "text", prompt: "Describe your day", answer: "A model answer" },
};

beforeEach(() => {
  stubRaf();
  for (let i = 0; i < padButtons.length; i++) padButtons[i] = { pressed: false, value: 0 };
});

describe("TextAnswerPad", () => {
  it("renders nothing with no pad connected, and no offer without field focus", () => {
    setPad(false);
    render(tWrap(<Harness />));
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();
    expect(screen.queryByRole("button", { name: "pad.textPad" })).toBeNull();

    setPad(true);
    render(tWrap(<Harness />));
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();
    expect(screen.queryByRole("button", { name: "pad.textPad" })).toBeNull();
  });

  it("offers itself when focus enters the served input, chip opens the keyboard", async () => {
    setPad(true);
    render(tWrap(<Harness />));
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();

    focusEl(screen.getByLabelText("answer"));
    const chip = screen.getByRole("button", { name: "pad.textPad" });
    expect(chip).toBeTruthy();

    // Leaving the field withdraws the offer.
    focusEl(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("button", { name: "pad.textPad" })).toBeNull();

    await openPad();
    expect(screen.getByRole("group", { name: "pad.textPad" })).toBeTruthy();
  });

  it("keys type letters, digits, punctuation, space; backspace deletes; done submits and closes", async () => {
    setPad(true);
    const onSubmit = vi.fn();
    render(tWrap(<Harness onSubmit={onSubmit} />));
    await openPad();

    for (const key of ["h", "i", "5", "."]) fireEvent.click(screen.getByRole("button", { name: key }));
    expect(screen.getByTestId("val").textContent).toBe("hi5.");

    fireEvent.click(screen.getByRole("button", { name: "pad.space" }));
    expect(screen.getByTestId("val").textContent).toBe("hi5. ");

    fireEvent.click(screen.getByRole("button", { name: "pad.backspace" }));
    expect(screen.getByTestId("val").textContent).toBe("hi5.");

    fireEvent.click(screen.getByRole("button", { name: "pad.done" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();
    // Done hands focus back to the served input, where the offer waits.
    expect(document.activeElement).toBe(screen.getByLabelText("answer"));
  });

  it("done with an empty answer closes without submitting", async () => {
    setPad(true);
    const onSubmit = vi.fn();
    render(tWrap(<Harness onSubmit={onSubmit} />));
    await openPad();
    fireEvent.click(screen.getByRole("button", { name: "pad.done" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();
  });

  it("A presses the focused key while a key holds focus and the shell stays yielded", async () => {
    setPad(true);
    render(tWrap(<ShellStandIn><Harness /></ShellStandIn>));
    await openPad();

    focusEl(screen.getByRole("button", { name: "q" }));
    expect(document.querySelector("[data-gamepad-active]")).not.toBeNull();
    await press(0); // A: the pad presses the focused key exactly once
    expect(screen.getByTestId("val").textContent).toBe("q");
  });

  it("B backs out while a key is focused: pad closes, focus returns to the input", async () => {
    setPad(true);
    render(tWrap(<ShellStandIn><Harness /></ShellStandIn>));
    await openPad();

    focusEl(screen.getByRole("button", { name: "q" }));
    await press(1); // B
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("answer"));
    expect(document.querySelector("[data-gamepad-active]")).toBeNull();
  });

  it("yields when focus leaves the keys: A works elsewhere, B does not close the pad", async () => {
    setPad(true);
    render(tWrap(<ShellStandIn><Harness /></ShellStandIn>));
    await openPad();

    focusEl(screen.getByRole("button", { name: "q" }));
    focusEl(screen.getByRole("button", { name: "elsewhere" }));
    expect(document.querySelector("[data-gamepad-active]")).toBeNull();

    await press(0); // A belongs to the shell now: it activates the focused control
    expect(screen.getByTestId("val").textContent).toBe("");
    await press(1); // B belongs to the shell: the pad stays open
    expect(screen.getByRole("group", { name: "pad.textPad" })).toBeTruthy();
  });

  it("busy pad disables the keys and done cannot submit", async () => {
    setPad(true);
    const onSubmit = vi.fn();
    render(tWrap(<Harness onSubmit={onSubmit} busy />));
    await openPad();
    const q = screen.getByRole("button", { name: "q" }) as HTMLButtonElement;
    expect(q.disabled).toBe(true);
    fireEvent.click(q);
    fireEvent.click(screen.getByRole("button", { name: "pad.done" }));
    expect(screen.getByTestId("val").textContent).toBe("");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ExerciseItem text kind: focus offers the pad, the pad fills the textarea", async () => {
    setPad(true);
    const onSolved = vi.fn();
    render(tWrap(<ExerciseItem item={TEXT_ITEM} solved={{}} onSolved={onSolved} qKey="11:0" qIdx={0} question={null} />));
    const field = screen.getByLabelText("exercise.writePlaceholder") as HTMLTextAreaElement;
    expect(screen.queryByRole("group", { name: "pad.textPad" })).toBeNull();

    focusEl(field);
    fireEvent.click(screen.getByRole("button", { name: "pad.textPad" }));
    fireEvent.click(screen.getByRole("button", { name: "n" }));
    fireEvent.click(screen.getByRole("button", { name: "o" }));
    expect(field.value).toBe("no");
    // The model answer button unlocks once the pad typed something.
    const show = screen.getByRole("button", { name: "exercise.showModelAnswer" }) as HTMLButtonElement;
    expect(show.disabled).toBe(false);
  });

  it("width budget: readable at 1280x800 (Steam Deck) and at 375px phone width", async () => {
    setPad(true);
    render(tWrap(<Harness />));
    await openPad();
    const group = screen.getByRole("group", { name: "pad.textPad" }) as HTMLElement;

    // Measure the grid from its own inline values (jsdom has no layout):
    // columns, min and max key width, gap.
    const m = /repeat\((\d+),\s*minmax\((\d+)px,\s*(\d+)px\)\)/.exec(group.style.gridTemplateColumns);
    expect(m).not.toBeNull();
    const cols = Number(m![1]);
    const minCol = Number(m![2]);
    const maxCol = Number(m![3]);
    const gap = parseFloat(group.style.gap);
    const cap = parseFloat(group.style.maxWidth);
    const minRow = cols * minCol + (cols - 1) * gap;
    const maxRow = cols * maxCol + (cols - 1) * gap;

    // A 375px phone with 16px stage padding per side leaves 343px: the grid's
    // narrowest rendering must fit it.
    expect(minRow, "min width fits a 375px phone minus 16px padding per side").toBeLessThanOrEqual(375 - 32);
    // A 1280px Steam Deck fits the widest rendering, and the cap keeps the
    // pad modest on the big screen.
    expect(maxRow, "max width fits a 1280x800 Steam Deck").toBeLessThanOrEqual(1280);
    expect(cap, "cap stays inside a 1280x800 Steam Deck minus margins").toBeLessThanOrEqual(1280 - 64);

    // Keys stay real touch targets at either width.
    for (const b of Array.from(group.querySelectorAll("button"))) {
      expect(parseFloat((b as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(36);
    }
  });
});
