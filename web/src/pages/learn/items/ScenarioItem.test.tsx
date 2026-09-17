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

import ScenarioItem from "./ScenarioItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string, vars?: Record<string, string | number>) => {
    const v = vars ? ` ${Object.values(vars).join(" ")}` : "";
    return `${k}${v}`;
  }}}>{ui}</I18nContext.Provider>
);

const nodes = {
  s: { text: "You stand at the river.", choices: [{ text: "Build a raft", next: "raft" }, { text: "Swim across", next: "swim" }] },
  raft: { text: "You float across safely.", choices: [] },
  swim: { text: "The current is too strong.", choices: [] },
};

describe("ScenarioItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "scenario", explanation: "well played" } });
  });

  const base = { id: 821, type: "exercise" as const, position: 0 };

  it("posts the path of node ids, one choice at a time", async () => {
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes } } as unknown as never;
    render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="821:0" qIdx={0} />));
    expect(screen.getByText("You stand at the river.")).toBeTruthy();

    const choice = screen.getByRole("button", { name: "Build a raft" });
    expect(choice).toHaveAttribute("data-nav");
    fireEvent.click(choice);

    expect(screen.getByText("You float across safely.")).toBeTruthy();
    const check = screen.getByRole("button", { name: /exercise\.check/ });
    fireEvent.click(check);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: string[] } }).body;
    expect(Array.isArray(body.answer)).toBe(true);
    expect(body.answer.every((v) => typeof v === "string")).toBe(true);
    expect(body.answer).toEqual(["s", "raft"]);
  });

  it("walks a longer path one choice at a time", async () => {
    const deep = {
      s: { text: "Night falls.", choices: [{ text: "Light a fire", next: "fire" }] },
      fire: { text: "Wolves keep their distance.", choices: [{ text: "Sleep till dawn", next: "dawn" }] },
      dawn: { text: "You walk home.", choices: [] },
    };
    const item = { ...base, content: { kind: "scenario", prompt: "Survive the night", start: "s", nodes: deep } } as unknown as never;
    render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="822:0" qIdx={0} />));
    fireEvent.click(screen.getByRole("button", { name: "Light a fire" }));
    fireEvent.click(screen.getByRole("button", { name: "Sleep till dawn" }));
    expect(screen.getByText("You walk home.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: string[] } }).body;
    expect(body.answer).toEqual(["s", "fire", "dawn"]);
  });

  it("shows try again after a wrong ending and restarts the story", async () => {
    mockApi.mockResolvedValue({ correct: false, reveal: { kind: "scenario", explanation: "the raft was safer" } });
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes } } as unknown as never;
    render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="823:0" qIdx={0} />));
    fireEvent.click(screen.getByRole("button", { name: "Swim across" }));
    fireEvent.click(screen.getByRole("button", { name: /exercise\.check/ }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: string[] } }).body;
    expect(body.answer).toEqual(["s", "swim"]);
    const again = await screen.findByRole("button", { name: /exercise\.tryAgain/ });
    fireEvent.click(again);
    expect(screen.getByText("You stand at the river.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Build a raft" })).toBeTruthy();
  });

  it("start over resets to the first node", () => {
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes } } as unknown as never;
    render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="824:0" qIdx={0} />));
    fireEvent.click(screen.getByRole("button", { name: "Build a raft" }));
    expect(screen.queryByRole("button", { name: "Build a raft" })).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: /scenario\.startOver/ }));
    expect(screen.getByRole("button", { name: "Build a raft" })).toBeTruthy();
  });

  it("no check button while the story still has choices", () => {
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes } } as unknown as never;
    render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="825:0" qIdx={0} />));
    expect(screen.queryByRole("button", { name: /exercise\.check/ })).toBeFalsy();
  });

  it("degrades to prompt text when nodes are broken", () => {
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes: {} } } as unknown as never;
    const { container } = render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="826:0" qIdx={0} />));
    expect(container.textContent).toContain("Cross the river");
    expect(container.querySelector("button")).toBeFalsy();
  });

  it("degrades to a message when all data is missing", () => {
    const item = { ...base, content: { kind: "scenario" } } as unknown as never;
    const { container } = render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="827:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "scenario", prompt: "Cross the river", start: "s", nodes } } as unknown as never;
    const { container } = render(tWrap(<ScenarioItem item={item} solved={{}} onSolved={vi.fn()} qKey="828:0" qIdx={0} />));
    expect(container.textContent).not.toContain("well played");
  });
});
