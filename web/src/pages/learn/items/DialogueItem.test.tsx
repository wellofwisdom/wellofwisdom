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

import DialogueItem from "./DialogueItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("DialogueItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "dialogue", explanation: "great" } });
  });

  const base = { id: 941, type: "exercise" as const, position: 0 };

  it("renders prompt, scene bubble, and goals as hints", () => {
    const item = {
      ...base,
      content: { kind: "dialogue", prompt: "Greet your neighbour", scene: "You meet Sofia at the door. She says: Hola!", turns: 2, goals: ["greet back", "give your name"] },
    } as unknown as never;
    const { container } = render(tWrap(<DialogueItem item={item} solved={{}} onSolved={vi.fn()} qKey="941:0" qIdx={0} />));
    expect(container.textContent).toContain("Greet your neighbour");
    expect(container.textContent).toContain("You meet Sofia at the door");
    expect(container.textContent).toContain("greet back");
    expect(container.textContent).toContain("give your name");
  });

  it("renders turn inputs 1..turns and Add turn grows them", () => {
    const item = { ...base, content: { kind: "dialogue", prompt: "Chat", scene: "Hello scene", turns: 2 } } as unknown as never;
    const { container } = render(tWrap(<DialogueItem item={item} solved={{}} onSolved={vi.fn()} qKey="942:0" qIdx={0} />));
    expect(container.querySelectorAll("input").length).toBe(2);
    expect(container.querySelectorAll("input")[0].getAttribute("aria-label")).toBe("dialogue.turnLabel");
    expect(container.querySelectorAll("input")[1].getAttribute("aria-label")).toBe("dialogue.turnLabel");
    const add = screen.getByRole("button", { name: "dialogue.addTurn" });
    expect(add).toHaveAttribute("data-nav");
    fireEvent.click(add);
    expect(container.querySelectorAll("input").length).toBe(3);
  });

  it("posts {turns: string[]} and check is data-nav", async () => {
    const item = { ...base, content: { kind: "dialogue", prompt: "Chat", scene: "Scene text", turns: 2 } } as unknown as never;
    const { container } = render(tWrap(<DialogueItem item={item} solved={{}} onSolved={vi.fn()} qKey="943:0" qIdx={0} />));
    const inputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    for (const inp of inputs) expect(inp).toHaveAttribute("data-nav");
    fireEvent.change(inputs[0], { target: { value: "Hola, me llamo Ana." } });
    fireEvent.change(inputs[1], { target: { value: "Vivo con mi familia." } });
    const check = screen.getByRole("button", { name: "exercise.check" }) as unknown as HTMLButtonElement;
    expect(check).toHaveAttribute("data-nav");
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(body.answer).toBeTruthy();
    expect(typeof body.answer).toBe("object");
    const turns = (body.answer as { turns: unknown }).turns;
    expect(Array.isArray(turns)).toBe(true);
    expect((turns as string[]).length).toBe(2);
    expect((turns as string[])[0]).toBe("Hola, me llamo Ana.");
  });

  it("check disabled until required turns filled, empty fallback and data-nav on all buttons", () => {
    const item = { ...base, content: { kind: "dialogue", prompt: "Chat", scene: "Scene", turns: 2 } } as unknown as never;
    const { container } = render(tWrap(<DialogueItem item={item} solved={{}} onSolved={vi.fn()} qKey="944:0" qIdx={0} />));
    const check = screen.getByRole("button", { name: "exercise.check" }) as unknown as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    const inputs = container.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "hola" } });
    expect(check.disabled).toBe(true);
    fireEvent.change(inputs[1], { target: { value: "vivo aqui" } });
    expect(check.disabled).toBe(false);
    const btns = Array.from(container.querySelectorAll("button"));
    for (const b of btns) expect(b).toHaveAttribute("data-nav");
  });

  it("fallback when prompt missing but text present, empty when neither", () => {
    const withText = { ...base, content: { kind: "dialogue", text: "Fallback dialogue", scene: "" } } as unknown as never;
    const { container, rerender } = render(tWrap(<DialogueItem item={withText} solved={{}} onSolved={vi.fn()} qKey="945:0" qIdx={0} />));
    // prompt fallback via text still needs scene to parse, but fallback path covers prompt display
    expect(container.textContent).toContain("Fallback dialogue");
    const empty = { ...base, content: { kind: "dialogue" } } as unknown as never;
    rerender(tWrap(<DialogueItem item={empty} solved={{}} onSolved={vi.fn()} qKey="945:0" qIdx={0} />));
    expect(container.textContent).toContain("dialogue.empty");
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "dialogue", prompt: "Chat", scene: "Scene", turns: 2 } } as unknown as never;
    const { container } = render(tWrap(<DialogueItem item={item} solved={{}} onSolved={vi.fn()} qKey="946:0" qIdx={0} />));
    expect(container.textContent).not.toContain("great");
  });
});
