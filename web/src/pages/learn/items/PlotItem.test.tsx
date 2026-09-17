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

import PlotItem from "./PlotItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string, vars?: Record<string, string | number>) => {
    const v = vars ? ` ${Object.values(vars).join(" ")}` : "";
    return `${k}${v}`;
  }}}>{ui}</I18nContext.Provider>
);

function stubRect(selector: string, left: number, top: number, width: number, height: number) {
  const el = document.querySelector(selector) as HTMLElement;
  el.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect);
}

describe("PlotItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "plot", explanation: "spot on" } });
  });

  const base = { id: 811, type: "exercise" as const, position: 0 };
  const grid = { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 };

  it("posts [{x,y}] points placed with arrow keys and enter", async () => {
    const item = { ...base, content: { kind: "plot", prompt: "Plot (1, 1)", grid } } as unknown as never;
    render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="811:0" qIdx={0} />));
    const el = document.querySelector("[data-plot-grid]") as HTMLElement;
    expect(el).toBeTruthy();
    expect(el).toHaveAttribute("data-nav");
    el.focus();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    fireEvent.keyDown(el, { key: "ArrowUp" });
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: { x: number; y: number }[] } }).body;
    expect(Array.isArray(body.answer)).toBe(true);
    expect(body.answer.length).toBe(2);
    expect(body.answer[0]).toEqual({ x: 1, y: 1 });
    expect(body.answer[1]).toEqual({ x: 0, y: 1 });
    expect(typeof body.answer[0].x).toBe("number");
    expect(typeof body.answer[0].y).toBe("number");
  });

  it("click moves the cursor snapped to the step", async () => {
    const item = { ...base, content: { kind: "plot", prompt: "Click then place", grid } } as unknown as never;
    render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="812:0" qIdx={0} />));
    stubRect("[data-plot-grid]", 0, 0, 320, 240);
    const el = document.querySelector("[data-plot-grid]") as HTMLElement;
    fireEvent.click(el, { clientX: 240, clientY: 60 });
    fireEvent.click(screen.getByRole("button", { name: /plot\.place/ }));
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: { x: number; y: number }[] } }).body;
    expect(body.answer).toEqual([{ x: 5, y: 5 }]);
  });

  it("place and undo buttons carry data-nav and work", () => {
    const item = { ...base, content: { kind: "plot", prompt: "Place two", grid } } as unknown as never;
    render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="813:0" qIdx={0} />));
    const place = screen.getByRole("button", { name: /^plot\.place/ }) as HTMLButtonElement;
    const undo = screen.getByRole("button", { name: /^plot\.undo/ }) as HTMLButtonElement;
    expect(place).toHaveAttribute("data-nav");
    expect(undo).toHaveAttribute("data-nav");
    fireEvent.click(place);
    fireEvent.click(place);
    fireEvent.click(undo);
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown[] } }).body;
    expect(body.answer.length).toBe(1);
  });

  it("caps points at 10", () => {
    const item = { ...base, content: { kind: "plot", prompt: "Many points", grid } } as unknown as never;
    render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="814:0" qIdx={0} />));
    const place = screen.getByRole("button", { name: /^plot\.place/ }) as HTMLButtonElement;
    for (let i = 0; i < 12; i++) fireEvent.click(place);
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown[] } }).body;
    expect(body.answer.length).toBe(10);
    expect(place.disabled).toBe(true);
  });

  it("check is disabled with no points and grid has aria", () => {
    const item = { ...base, content: { kind: "plot", prompt: "Nothing yet", grid } } as unknown as never;
    render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="815:0" qIdx={0} />));
    const check = screen.getByRole("button", { name: /exercise\.check/ }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    const el = document.querySelector("[data-plot-grid]") as HTMLElement;
    expect(el.getAttribute("aria-label")).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it("degrades when prompt is missing", () => {
    const item = { ...base, content: { kind: "plot", grid } } as unknown as never;
    const { container } = render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="816:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
    expect(container.querySelector("[data-plot-grid]")).toBeFalsy();
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "plot", prompt: "Plot it", grid } } as unknown as never;
    const { container } = render(tWrap(<PlotItem item={item} solved={{}} onSolved={vi.fn()} qKey="817:0" qIdx={0} />));
    expect(container.textContent).not.toContain("spot on");
  });
});
