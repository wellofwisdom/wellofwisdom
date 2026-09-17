// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nContext } from "../../../i18n";
import FigureItem from "./FigureItem";
import StepsItem from "./StepsItem";
import PredictItem from "./PredictItem";
import FlashcardsItem from "./FlashcardsItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string, vars?: Record<string, string | number>) => {
    const v = vars ? ` ${Object.values(vars).join(" ")}` : "";
    return `${k}${v}`;
  }}}>{ui}</I18nContext.Provider>
);

const mockApi = vi.fn();
vi.mock("../../../api", () => ({
  api: (...args: unknown[]) => (mockApi as unknown as (...a: unknown[]) => unknown)(...args),
  niceError: (e: unknown) => String(e),
}));

describe("FigureItem", () => {
  const base: { id: number; type: string; position: number } = { id: 1, type: "figure", position: 0 };

  it("renders image with alt and caption", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: { uploadId: 42, alt: "A water cycle diagram", caption: "Figure 1: the cycle" } } as unknown as never;
    const { container } = render(tWrap(<FigureItem item={item} />));
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("alt")).toBe("A water cycle diagram");
    expect(container.textContent).toContain("A water cycle diagram");
    expect(container.textContent).toContain("Figure 1: the cycle");
  });

  it("always renders alt text even without image", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: { alt: "Alt only" } } as unknown as never;
    const { container } = render(tWrap(<FigureItem item={item} />));
    expect(container.querySelector("img")).toBeFalsy();
    expect(container.textContent).toContain("Alt only");
  });

  it("degrades when data is missing: never renders nothing", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: {} } as unknown as never;
    const { container } = render(tWrap(<FigureItem item={item} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("degrades with empty content object", () => {
    const item = { id: 1, type: "figure", position: 0, content: null } as unknown as never;
    const { container } = render(tWrap(<FigureItem item={item} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });
});

describe("StepsItem", () => {
  const base: { id: number; type: string; position: number } = { id: 2, type: "steps", position: 0 };
  const fixture = {
    ...(base as unknown as Record<string, unknown>),
    content: {
      title: "Worked example",
      problem: "Solve 2x + 3 = 7",
      steps: [{ text: "Subtract 3: 2x = 4" }, { text: "Divide by 2: x = 2" }, { text: "Check: 2*2+3=7" }],
    },
  } as unknown as never;

  it("renders title and problem, hides steps before reveal", () => {
    const { container } = render(tWrap(<StepsItem item={fixture} />));
    expect(container.textContent).toContain("Worked example");
    expect(container.textContent).toContain("Solve 2x + 3 = 7");
    expect(container.textContent).not.toContain("Subtract 3");
    expect(container.textContent).not.toContain("Divide by 2");
  });

  it("reveals one step at a time behind its own Show control", () => {
    const { container } = render(tWrap(<StepsItem item={fixture} />));
    const btns = () => screen.queryAllByRole("button");
    expect(btns()).toHaveLength(1);
    expect(btns()[0].textContent).toContain("steps.showStep");
    fireEvent.click(btns()[0]);
    expect(container.textContent).toContain("Subtract 3");
    expect(container.textContent).not.toContain("Divide by 2");
    expect(screen.queryAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("Divide by 2");
    fireEvent.click(screen.getByRole("button"));
    expect(container.textContent).toContain("Check: 2*2+3=7");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("has keyboard path and data-nav on Show controls", () => {
    render(tWrap(<StepsItem item={fixture} />));
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("data-nav");
    btn.focus();
    expect(document.activeElement).toBe(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    expect(screen.getByText(/Subtract 3/)).toBeTruthy();
  });

  it("degrades when steps missing", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: { title: "Only title" } } as unknown as never;
    const { container } = render(tWrap(<StepsItem item={item} />));
    expect(container.textContent).toContain("Only title");
  });
});

describe("PredictItem", () => {
  const base: { id: number; type: string; position: number } = { id: 3, type: "predict", position: 0 };
  const fixture = {
    ...(base as unknown as Record<string, unknown>),
    content: {
      prompt: "What will happen if we mix them?",
      choices: [{ id: "a", text: "It fizzes" }, { id: "b", text: "Nothing" }],
      reveal: "It fizzes because of the acid.",
    },
  } as unknown as never;

  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: null, reveal: { explanation: "It fizzes because of the acid." } });
  });

  it("renders prompt and choices", () => {
    render(tWrap(<PredictItem item={fixture} />));
    expect(screen.getByText(/What will happen/)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("posts the chosen id on commit", async () => {
    render(tWrap(<PredictItem item={fixture} />));
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: string } }).body;
    expect(body.answer).toBe("a");
  });

  it("hides reveal before commit and shows it after", async () => {
    const { container } = render(tWrap(<PredictItem item={fixture} />));
    expect(container.textContent).not.toContain("It fizzes because");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.textContent).toContain("It fizzes because"));
  });

  it("never shows verdict styling or score", async () => {
    const { container } = render(tWrap(<PredictItem item={fixture} />));
    fireEvent.click(screen.getAllByRole("radio")[1]);
    await vi.waitFor(() => expect(container.textContent).toContain("It fizzes because"));
    expect(container.innerHTML).not.toMatch(/correct|notQuite|score|good|bad/i);
    expect(container.querySelector(".feedback")).toBeFalsy();
  });

  it("has keyboard path and data-nav", () => {
    render(tWrap(<PredictItem item={fixture} />));
    const radios = screen.getAllByRole("radio");
    for (const r of radios) expect(r).toHaveAttribute("data-nav");
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[1]);
  });

  it("degrades when data is missing", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: {} } as unknown as never;
    const { container } = render(tWrap(<PredictItem item={item} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });
});

describe("FlashcardsItem", () => {
  const base: { id: number; type: string; position: number } = { id: 4, type: "flashcards", position: 0 };
  const fixture = {
    ...(base as unknown as Record<string, unknown>),
    content: {
      cards: [
        { front: "Front 1", back: "Back 1" },
        { front: "Front 2", back: "Back 2" },
        { front: "Front 3", back: "Back 3" },
      ],
    },
  } as unknown as never;

  it("renders first card front and progress", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    expect(container.textContent).toContain("Front 1");
    expect(container.textContent).toContain("flashcards.progress");
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("3");
  });

  it("hides back before flip", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    expect(container.textContent).not.toContain("Back 1");
  });

  it("flips on click and shows back", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(container.textContent).toContain("Back 1");
    expect(container.textContent).not.toContain("Front 1");
  });

  it("flips on space or enter", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    expect(container.textContent).toContain("Back 1");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(container.textContent).toContain("Front 1");
  });

  it("arrows move between cards and update progress", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    const next = screen.getByRole("button", { name: /flashcards\.next/ });
    const prev = screen.getByRole("button", { name: /flashcards\.prev/ });
    expect(next).toHaveAttribute("data-nav");
    expect(prev).toHaveAttribute("data-nav");
    fireEvent.click(next);
    expect(container.textContent).toContain("Front 2");
    expect(container.textContent).toContain("2");
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(container.textContent).toContain("Front 3");
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    expect(container.textContent).toContain("Front 2");
  });

  it("does not post before grading (flip only)", () => {
    mockApi.mockClear();
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.click(card!);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("flip then Got it posts correct for that card and advances queue", async () => {
    mockApi.mockClear();
    mockApi.mockResolvedValue({});
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    fireEvent.click(container.querySelector('[role="button"]') as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: /flashcards\.gotIt/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect((mockApi.mock.calls[0][1] as { body: Record<string, unknown> }).body.answer).toBe("correct");
    expect((mockApi.mock.calls[0][1] as { body: Record<string, unknown> }).body.questionIndex).toBe(0);
    expect(container.textContent).toContain("Front 2");
  });

  it("grading keeps keyboard and data-nav", async () => {
    mockApi.mockResolvedValue({});
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    fireEvent.click(container.querySelector('[role="button"]') as HTMLElement);
    const gotIt = screen.getByRole("button", { name: /flashcards\.gotIt/ });
    const again = screen.getByRole("button", { name: /flashcards\.again/ });
    expect(gotIt).toHaveAttribute("data-nav");
    expect(again).toHaveAttribute("data-nav");
    again.focus();
    fireEvent.keyDown(again, { key: "Enter" });
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
  });

  it("degrades when cards missing", () => {
    const item = { ...(base as unknown as Record<string, unknown>), content: {} } as unknown as never;
    const { container } = render(tWrap(<FlashcardsItem item={item} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("card has data-nav and aria story", () => {
    const { container } = render(tWrap(<FlashcardsItem item={fixture} />));
    const card = container.querySelector('[role="button"]') as HTMLElement;
    expect(card).toHaveAttribute("data-nav");
    expect(card.getAttribute("aria-label")).toBeTruthy();
  });
});
