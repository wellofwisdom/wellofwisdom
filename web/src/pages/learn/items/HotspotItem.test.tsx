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

import HotspotItem from "./HotspotItem";

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

describe("HotspotItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "hotspot", explanation: "yes" } });
  });

  const base = { id: 801, type: "exercise" as const, position: 0 };
  const regions = [
    { id: "r1", shape: "rect", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
    { id: "r2", shape: "poly", points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 20, y: 40 }] },
  ];

  it("posts {x, y} in percent from a click", async () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Where is the spring?", regions } } as unknown as never;
    render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="801:0" qIdx={0} />));
    const stage = document.querySelector("[data-hotspot-stage]") as HTMLElement;
    expect(stage).toBeTruthy();
    stubRect("[data-hotspot-stage]", 0, 0, 200, 100);
    fireEvent.click(stage, { clientX: 100, clientY: 25 });
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: { x: number; y: number } } }).body;
    expect(typeof body.answer.x).toBe("number");
    expect(typeof body.answer.y).toBe("number");
    expect(body.answer.x).toBe(50);
    expect(body.answer.y).toBe(25);
  });

  it("posts the region id when a region button is picked", async () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Tap the cave", regions } } as unknown as never;
    render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="802:0" qIdx={0} />));
    const btns = document.querySelectorAll("[data-hotspot-idx]");
    expect(btns.length).toBe(2);
    fireEvent.click(btns[1]);
    expect(btns[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(body.answer).toBe("r2");
    expect(typeof body.answer).toBe("string");
  });

  it("region buttons have data-nav, aria and arrow key navigation", () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Tap the cave", regions } } as unknown as never;
    render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="803:0" qIdx={0} />));
    const btns = document.querySelectorAll("[data-hotspot-idx]");
    for (const b of Array.from(btns)) {
      expect(b).toHaveAttribute("data-nav");
      expect(b.getAttribute("aria-label")).toBeTruthy();
    }
    (btns[0] as HTMLElement).focus();
    expect(document.activeElement).toBe(btns[0]);
    fireEvent.keyDown(btns[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(btns[1]);
    fireEvent.keyDown(btns[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(btns[0]);
  });

  it("always renders alt text on the image", () => {
    const withAlt = { ...base, content: { kind: "hotspot", prompt: "Find the dock", alt: "A map of the bay", uploadId: 7, regions } } as unknown as never;
    const { rerender } = render(tWrap(<HotspotItem item={withAlt} solved={{}} onSolved={vi.fn()} qKey="804:0" qIdx={0} />));
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("alt")).toBe("A map of the bay");
    expect(img.getAttribute("src")).toBe("/media/7");

    const noAlt = { ...base, content: { kind: "hotspot", prompt: "Find the dock", uploadId: 7, regions } } as unknown as never;
    rerender(tWrap(<HotspotItem item={noAlt} solved={{}} onSolved={vi.fn()} qKey="804:0" qIdx={0} />));
    const img2 = document.querySelector("img") as HTMLImageElement;
    expect(img2).toBeTruthy();
    expect((img2.getAttribute("alt") || "").length).toBeGreaterThan(0);
  });

  it("check is disabled until something is picked", () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Tap the cave", regions } } as unknown as never;
    render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="805:0" qIdx={0} />));
    const check = screen.getByRole("button", { name: /exercise\.check/ }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.click(document.querySelectorAll("[data-hotspot-idx]")[0]);
    expect(check.disabled).toBe(false);
  });

  it("degrades to prompt text when regions are missing", () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Where is the spring?" } } as unknown as never;
    const { container } = render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="806:0" qIdx={0} />));
    expect(container.textContent).toContain("Where is the spring?");
    expect(container.querySelector("[data-hotspot-stage]")).toBeFalsy();
  });

  it("degrades to a message when all data is missing", () => {
    const item = { ...base, content: { kind: "hotspot" } } as unknown as never;
    const { container } = render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="807:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "hotspot", prompt: "Tap the cave", regions } } as unknown as never;
    const { container } = render(tWrap(<HotspotItem item={item} solved={{}} onSolved={vi.fn()} qKey="808:0" qIdx={0} />));
    expect(container.textContent).not.toContain("yes");
  });
});
