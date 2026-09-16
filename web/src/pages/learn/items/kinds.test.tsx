// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nContext } from "../../../i18n";
import { getHintList } from "./HintLadder";
import HintLadder from "./HintLadder";
import MultiItem from "./MultiItem";
import ExerciseItem from "./ExerciseItem";

vi.mock("../../../api", () => ({
  api: vi.fn(() => Promise.resolve({ correct: true, reveal: { kind: "mcq", explanation: "Well done", feedback: null } })),
  niceError: (e: unknown) => String(e),
}));

vi.mock("../../../components/PushToTalk", () => ({
  PushToTalk: () => null,
}));

vi.mock("../../../lib/gamepad", () => ({
  triggerRumble: () => {},
}));

vi.mock("../TutorChat", () => ({
  default: () => null,
}));

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("hint ladder", () => {
  it("reads single hint as one-item ladder", () => {
    expect(getHintList({ hint: "one" })).toEqual(["one"]);
    expect(getHintList({ hint: "  one  " })).toEqual(["one"]);
  });

  it("reads hints array up to 3", () => {
    expect(getHintList({ hints: ["a", "b", "c", "d"] })).toEqual(["a", "b", "c"]);
    expect(getHintList({ hints: ["a", "", "c"] })).toEqual(["a", "c"]);
  });

  it("prefers hints over hint", () => {
    expect(getHintList({ hints: ["ladder"], hint: "single" })).toEqual(["ladder"]);
  });

  it("empty content gives no hints", () => {
    expect(getHintList({})).toEqual([]);
    expect(getHintList({ hint: "" })).toEqual([]);
    expect(getHintList({ hints: [] })).toEqual([]);
  });

  it("reveals one at a time and never the answer", () => {
    const { container } = render(tWrap(<HintLadder content={{ hints: ["first", "second", "third"] }} />));
    expect(container.textContent).not.toContain("first");
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("second");
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("second");
    expect(container.textContent).not.toContain("third");
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("third");
  });

  it("single hint needs one click", () => {
    const { container } = render(tWrap(<HintLadder content={{ hint: "only" }} />));
    expect(container.textContent).not.toContain("only");
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("only");
  });

  it("no hints renders nothing", () => {
    const { container } = render(tWrap(<HintLadder content={{}} />));
    expect(container.textContent?.trim()).toBe("");
  });
});

describe("choice feedback", () => {
  it("mcq choice carries feedback field", () => {
    const item = {
      id: 1,
      type: "exercise" as const,
      position: 0,
      content: {
        kind: "mcq",
        prompt: "Pick one",
        choices: [
          { id: "c1", text: "A", feedback: "Wrong because X" },
          { id: "c2", text: "B" },
        ],
      },
    };
    expect((item.content.choices[0] as { feedback: string }).feedback).toBe("Wrong because X");
  });

  it("multi kind posts string[] of ids", async () => {
    const api = await import("../../../api");
    const mock = api.api as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();
    mock.mockResolvedValue({ correct: false, reveal: { kind: "multi", explanation: "Try again", feedback: { c1: "You missed this" } } });
    const item = {
      id: 42,
      type: "exercise" as const,
      position: 0,
      content: {
        kind: "multi",
        prompt: "Pick all squares",
        choices: [
          { id: "c1", text: "square" },
          { id: "c2", text: "circle" },
          { id: "c3", text: "square 2" },
        ],
      },
    };
    const onSolved = vi.fn();
    render(tWrap(<MultiItem item={item} solved={{}} onSolved={onSolved} qKey="42:0" qIdx={0} />));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(boxes[0]);
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(boxes[2]);
    const btn = screen.getByRole("button", { name: /exercise\.check/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await vi.waitFor(() => expect(mock).toHaveBeenCalled());
    const body = (mock.mock.calls[0][1] as { body: { answer: string[] } }).body;
    expect(Array.isArray(body.answer)).toBe(true);
    expect(body.answer).toEqual(expect.arrayContaining(["c1", "c3"]));
  });

  it("multi has keyboard path and data-nav", () => {
    const item = {
      id: 43,
      type: "exercise" as const,
      position: 0,
      content: {
        kind: "multi",
        prompt: "Pick all that apply",
        choices: [
          { id: "c1", text: "A" },
          { id: "c2", text: "B" },
        ],
      },
    };
    render(tWrap(<MultiItem item={item} solved={{}} onSolved={vi.fn()} qKey="43:0" qIdx={0} />));
    const boxes = screen.getAllByRole("checkbox");
    for (const b of boxes) {
      expect(b).toHaveAttribute("data-nav");
    }
    boxes[0].focus();
    fireEvent.keyDown(boxes[0], { key: " " });
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(boxes[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(boxes[1]);
  });

  it("mcq choices have data-nav and radiogroup", () => {
    const item = {
      id: 10,
      type: "exercise" as const,
      position: 0,
      content: {
        kind: "mcq",
        prompt: "Q",
        choices: [
          { id: "c1", text: "A" },
          { id: "c2", text: "B" },
        ],
      },
    };
    render(tWrap(<ExerciseItem item={item} solved={{}} onSolved={vi.fn()} qKey="10:0" qIdx={0} question={null} />));
    const group = document.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    for (const r of radios) expect(r).toHaveAttribute("data-nav");
  });
});
