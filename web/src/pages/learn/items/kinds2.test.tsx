// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nContext } from "../../../i18n";

vi.mock("../../../api", () => ({
  api: vi.fn(() => Promise.resolve({ correct: true, reveal: { kind: "order", explanation: null } })),
  niceError: (e: unknown) => String(e),
}));
vi.mock("../../../components/PushToTalk", () => ({ PushToTalk: () => null }));
vi.mock("../../../lib/gamepad", () => ({ triggerRumble: () => {} }));
vi.mock("../TutorChat", () => ({ default: () => null }));

import OrderItem from "./OrderItem";
import MatchItem from "./MatchItem";
import CategorizeItem from "./CategorizeItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("order item", () => {
  const base = {
    id: 100,
    type: "exercise" as const,
    position: 0,
    content: {
      kind: "order",
      prompt: "Put in order",
      items: [
        { id: "a", text: "First" },
        { id: "b", text: "Second" },
        { id: "c", text: "Third" },
      ],
    },
  };

  it("renders items and posts id[]", async () => {
    const api = await import("../../../api");
    const mock = api.api as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();
    mock.mockResolvedValue({ correct: true, reveal: { kind: "order", explanation: "ok" } });
    const onSolved = vi.fn();
    render(tWrap(<OrderItem item={base} solved={{}} onSolved={onSolved} qKey="100:0" qIdx={0} />));
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveAttribute("data-nav");
    const btn = screen.getByRole("button", { name: /exercise\.check/ });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(mock).toHaveBeenCalled());
    const body = (mock.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(Array.isArray(body.answer)).toBe(true);
    expect(body.answer).toEqual(["a", "b", "c"]);
  });

  it("keyboard ArrowDown/Up reorders", () => {
    render(tWrap(<OrderItem item={base} solved={{}} onSolved={vi.fn()} qKey="101:0" qIdx={0} />));
    const rows = screen.getAllByRole("listitem");
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
  });

  it("screen reader list semantics", () => {
    render(tWrap(<OrderItem item={base} solved={{}} onSolved={vi.fn()} qKey="102:0" qIdx={0} />));
    expect(screen.getByRole("list")).toBeTruthy();
  });
});

describe("match item", () => {
  const base = {
    id: 200,
    type: "exercise" as const,
    position: 0,
    content: {
      kind: "match",
      prompt: "Match them",
      left: [
        { id: "l1", text: "Cat" },
        { id: "l2", text: "Dog" },
      ],
      right: [
        { id: "r1", text: "Meow" },
        { id: "r2", text: "Woof" },
      ],
    },
  };

  it("renders selects and posts {leftId: rightId}", async () => {
    const api = await import("../../../api");
    const mock = api.api as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();
    mock.mockResolvedValue({ correct: false, reveal: { kind: "match", explanation: "try" } });
    render(tWrap(<MatchItem item={base} solved={{}} onSolved={vi.fn()} qKey="200:0" qIdx={0} />));
    const selects = document.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    for (const s of Array.from(selects)) expect(s).toHaveAttribute("data-nav");
    fireEvent.change(selects[0], { target: { value: "r1" } });
    fireEvent.change(selects[1], { target: { value: "r2" } });
    const btn = screen.getByRole("button", { name: /exercise\.check/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await vi.waitFor(() => expect(mock).toHaveBeenCalled());
    const body = (mock.mock.calls[0][1] as { body: { answer: Record<string, string> } }).body;
    expect(body.answer).toEqual({ l1: "r1", l2: "r2" });
    expect(typeof body.answer.l1).toBe("string");
  });

  it("has screen reader labels", () => {
    render(tWrap(<MatchItem item={base} solved={{}} onSolved={vi.fn()} qKey="201:0" qIdx={0} />));
    expect(document.querySelectorAll("label.sr-only")).toHaveLength(2);
  });
});

describe("categorize item", () => {
  const base = {
    id: 300,
    type: "exercise" as const,
    position: 0,
    content: {
      kind: "categorize",
      prompt: "Sort them",
      buckets: [
        { id: "b1", label: "Mammals" },
        { id: "b2", label: "Birds" },
      ],
      cards: [
        { id: "c1", text: "Cat" },
        { id: "c2", text: "Sparrow" },
      ],
    },
  };

  it("renders buckets and posts {cardId: bucketId}", async () => {
    const api = await import("../../../api");
    const mock = api.api as unknown as ReturnType<typeof vi.fn>;
    mock.mockClear();
    mock.mockResolvedValue({ correct: true, reveal: { kind: "categorize", explanation: null } });
    render(tWrap(<CategorizeItem item={base} solved={{}} onSolved={vi.fn()} qKey="300:0" qIdx={0} />));
    const selects = document.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    for (const s of Array.from(selects)) expect(s).toHaveAttribute("data-nav");
    fireEvent.change(selects[0], { target: { value: "b1" } });
    fireEvent.change(selects[1], { target: { value: "b2" } });
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalled());
    const body = (mock.mock.calls[0][1] as { body: { answer: Record<string, string> } }).body;
    expect(body.answer).toEqual({ c1: "b1", c2: "b2" });
  });

  it("uses select per card with data-nav", () => {
    render(tWrap(<CategorizeItem item={base} solved={{}} onSolved={vi.fn()} qKey="301:0" qIdx={0} />));
    const selects = document.querySelectorAll("select");
    expect(selects.length).toBe(2);
    expect(document.querySelectorAll("label.sr-only").length).toBe(2);
  });
});
