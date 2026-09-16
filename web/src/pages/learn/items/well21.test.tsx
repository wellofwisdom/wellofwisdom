// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nContext } from "../../../i18n";

const mockApi = vi.fn();
vi.mock("../../../api", () => ({
  api: (...a: unknown[]) => (mockApi as unknown as (...args: unknown[]) => unknown)(...a),
  niceError: (e: unknown) => String(e),
}));
vi.mock("../../../lib/gamepad", () => ({ triggerRumble: () => {} }));
vi.mock("../TutorChat", () => ({ default: () => null }));

import ClozeItem from "./ClozeItem";
import NumberlineItem from "./NumberlineItem";
import FractionItem from "./FractionItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string, vars?: Record<string, string | number>) => {
    const v = vars ? ` ${Object.values(vars).join(" ")}` : "";
    return `${k}${v}`;
  }}}>{ui}</I18nContext.Provider>
);

describe("ClozeItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "cloze", explanation: "ok" } });
  });

  const base = { id: 501, type: "exercise" as const, position: 0 };

  it("renders inputs for [[id]] blanks and posts {blankId: string}", async () => {
    const item = { ...base, content: { kind: "cloze", text: "The [[1]] jumped over the [[2]]", blanks: [{ id: "1" }, { id: "2" }] } } as unknown as never;
    render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="501:0" qIdx={0} />));
    const inputs = document.querySelectorAll("input");
    expect(inputs.length).toBe(2);
    for (const el of Array.from(inputs)) expect(el).toHaveAttribute("data-nav");
    fireEvent.change(inputs[0], { target: { value: "cat" } });
    fireEvent.change(inputs[1], { target: { value: "moon" } });
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: Record<string, string> } }).body;
    expect(body.answer).toEqual({ "1": "cat", "2": "moon" });
    expect(typeof body.answer["1"]).toBe("string");
  });

  it("renders select when blank has choices", () => {
    const item = { ...base, content: { kind: "cloze", text: "Color is [[1]]", blanks: [{ id: "1", choices: ["red", "blue"] }] } } as unknown as never;
    render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="502:0" qIdx={0} />));
    const sel = document.querySelector("select") as HTMLSelectElement;
    expect(sel).toBeTruthy();
    expect(sel).toHaveAttribute("data-nav");
    expect(sel.options.length).toBe(3);
  });

  it("has keyboard path and aria", () => {
    const item = { ...base, content: { kind: "cloze", text: "Hi [[1]]", blanks: [{ id: "1" }] } } as unknown as never;
    render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="503:0" qIdx={0} />));
    const inp = document.querySelector("input") as HTMLElement;
    expect(inp.getAttribute("aria-label")).toBeTruthy();
    inp.focus();
    expect(document.activeElement).toBe(inp);
  });

  it("degrades when data missing: never renders nothing", () => {
    const item = { ...base, content: { kind: "cloze" } } as unknown as never;
    const { container } = render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="504:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("degrades with prompt fallback when text missing", () => {
    const item = { ...base, content: { kind: "cloze", prompt: "Fill the blank" } } as unknown as never;
    const { container } = render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="505:0" qIdx={0} />));
    expect(container.textContent).toContain("Fill the blank");
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "cloze", text: "A [[1]]", blanks: [{ id: "1" }] } } as unknown as never;
    const { container } = render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="506:0" qIdx={0} />));
    expect(container.textContent).not.toContain("ok");
  });

  it("check disabled until all blanks filled", () => {
    const item = { ...base, content: { kind: "cloze", text: "A [[1]] and [[2]]", blanks: [{ id: "1" }, { id: "2" }] } } as unknown as never;
    render(tWrap(<ClozeItem item={item} solved={{}} onSolved={vi.fn()} qKey="507:0" qIdx={0} />));
    const btn = screen.getByRole("button", { name: /exercise\.check/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const inputs = document.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "x" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(inputs[1], { target: { value: "y" } });
    expect(btn.disabled).toBe(false);
  });
});

describe("NumberlineItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "numberline", explanation: "nice" } });
  });

  const base = { id: 601, type: "exercise" as const, position: 0 };

  it("renders slider and posts a number", async () => {
    const item = { ...base, content: { kind: "numberline", prompt: "Place 3", min: 0, max: 10, step: 1 } } as unknown as never;
    render(tWrap(<NumberlineItem item={item} solved={{}} onSolved={vi.fn()} qKey="601:0" qIdx={0} />));
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider).toHaveAttribute("data-nav");
    expect(slider.getAttribute("aria-valuemin")).toBe("0");
    fireEvent.change(slider, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(typeof body.answer).toBe("number");
    expect(body.answer).toBe(7);
  });

  it("stepper buttons move and are keyboard operable", () => {
    const item = { ...base, content: { kind: "numberline", prompt: "Pick", min: 0, max: 10, step: 2 } } as unknown as never;
    render(tWrap(<NumberlineItem item={item} solved={{}} onSolved={vi.fn()} qKey="602:0" qIdx={0} />));
    const dec = screen.getByRole("button", { name: /numberline\.decrease/ });
    const inc = screen.getByRole("button", { name: /numberline\.increase/ });
    expect(dec).toHaveAttribute("data-nav");
    expect(inc).toHaveAttribute("data-nav");
    const num = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(num.value).toBe("0");
    fireEvent.click(inc);
    expect(num.value).toBe("2");
    const slider = document.querySelector('input[type="range"]') as HTMLElement;
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(num.value).toBe("4");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(num.value).toBe("2");
  });

  it("has aria on slider", () => {
    const item = { ...base, content: { kind: "numberline", prompt: "Slide", min: 1, max: 5, step: 1 } } as unknown as never;
    render(tWrap(<NumberlineItem item={item} solved={{}} onSolved={vi.fn()} qKey="603:0" qIdx={0} />));
    const slider = document.querySelector('input[type="range"]') as HTMLElement;
    expect(slider.getAttribute("aria-label")).toBeTruthy();
    expect(slider.getAttribute("aria-valuenow")).toBeTruthy();
  });

  it("degrades when data missing", () => {
    const item = { ...base, content: { kind: "numberline" } } as unknown as never;
    const { container } = render(tWrap(<NumberlineItem item={item} solved={{}} onSolved={vi.fn()} qKey="604:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
    expect(container.querySelector('input[type="range"]')).toBeFalsy();
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "numberline", prompt: "Q", min: 0, max: 10, step: 1 } } as unknown as never;
    const { container } = render(tWrap(<NumberlineItem item={item} solved={{}} onSolved={vi.fn()} qKey="605:0" qIdx={0} />));
    expect(container.textContent).not.toContain("nice");
  });
});

describe("FractionItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "fraction", explanation: "great" } });
  });

  const base = { id: 701, type: "exercise" as const, position: 0 };

  it("renders bar model and posts {shaded: number[]}", async () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Shade 2/4", model: "bar", parts: 4 } } as unknown as never;
    render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="701:0" qIdx={0} />));
    const opts = screen.getAllByRole("option");
    expect(opts.length).toBe(4);
    for (const o of opts) expect(o).toHaveAttribute("data-nav");
    fireEvent.click(opts[0]);
    fireEvent.click(opts[2]);
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: { shaded: number[] } } }).body;
    expect(Array.isArray(body.answer.shaded)).toBe(true);
    expect(body.answer.shaded).toEqual(expect.arrayContaining([0, 2]));
  });

  it("circle model renders too", () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Shade 1/3", model: "circle", parts: 3 } } as unknown as never;
    render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="702:0" qIdx={0} />));
    expect(screen.getAllByRole("option").length).toBe(3);
  });

  it("keyboard space toggles and arrows move focus", () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Pick", model: "bar", parts: 4 } } as unknown as never;
    render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="703:0" qIdx={0} />));
    const opts = screen.getAllByRole("option");
    opts[0].focus();
    expect(document.activeElement).toBe(opts[0]);
    fireEvent.keyDown(opts[0], { key: " " });
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(opts[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(opts[1]);
    fireEvent.keyDown(opts[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(opts[0]);
  });

  it("has aria-multiselectable and labels", () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Frac", model: "bar", parts: 3 } } as unknown as never;
    render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="704:0" qIdx={0} />));
    const box = document.querySelector('[aria-multiselectable="true"]');
    expect(box).toBeTruthy();
    for (const o of screen.getAllByRole("option")) expect(o.getAttribute("aria-label")).toBeTruthy();
  });

  it("degrades when data missing", () => {
    const item = { ...base, content: { kind: "fraction" } } as unknown as never;
    const { container } = render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="705:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
    expect(container.querySelector('[role="option"]')).toBeFalsy();
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Shade", model: "bar", parts: 4 } } as unknown as never;
    const { container } = render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="706:0" qIdx={0} />));
    expect(container.textContent).not.toContain("great");
  });

  it("clear empties shaded", () => {
    const item = { ...base, content: { kind: "fraction", prompt: "Shade", model: "bar", parts: 4 } } as unknown as never;
    render(tWrap(<FractionItem item={item} solved={{}} onSolved={vi.fn()} qKey="707:0" qIdx={0} />));
    const opts = screen.getAllByRole("option");
    fireEvent.click(opts[0]);
    expect(opts[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /fraction\.clear/ }));
    expect(opts[0].getAttribute("aria-selected")).toBe("false");
  });
});
