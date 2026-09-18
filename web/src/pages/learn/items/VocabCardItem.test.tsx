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

import VocabCardItem from "./VocabCardItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("VocabCardItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "vocab_card", explanation: "bien" } });
  });

  const base = { id: 901, type: "exercise" as const, position: 0 };

  it("renders lemma as the prompt and shows example", () => {
    const item = { ...base, content: { kind: "vocab_card", lemma: "hola", gloss: "hello", example: "Hola, me llamo Ana." } } as unknown as never;
    const { container } = render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="901:0" qIdx={0} />));
    expect(container.textContent).toContain("hola");
    expect(container.textContent).toContain("Hola, me llamo Ana.");
  });

  it("falls back to form then text then prompt when lemma missing", () => {
    const withForm = { ...base, content: { kind: "vocab_card", form: "rojo", prompt: "red" } } as unknown as never;
    const { container, rerender } = render(tWrap(<VocabCardItem item={withForm} solved={{}} onSolved={vi.fn()} qKey="901:0" qIdx={0} />));
    expect(container.textContent).toContain("rojo");
    const withText = { ...base, content: { kind: "vocab_card", text: "fallback text" } } as unknown as never;
    rerender(tWrap(<VocabCardItem item={withText} solved={{}} onSolved={vi.fn()} qKey="901:0" qIdx={0} />));
    expect(container.textContent).toContain("fallback text");
  });

  it("shows empty fallback when no lemma form text or prompt", () => {
    const item = { ...base, content: { kind: "vocab_card" } } as unknown as never;
    const { container } = render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="901:0" qIdx={0} />));
    expect(container.textContent!.trim().length).toBeGreaterThan(0);
    expect(container.textContent).toContain("vocab.empty");
  });

  it("input has data-nav and aria, posts typed string, supports Enter", async () => {
    const item = { ...base, content: { kind: "vocab_card", lemma: "hola", gloss: "hello" } } as unknown as never;
    render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="902:0" qIdx={0} />));
    const input = screen.getByLabelText("vocab.inputLabel") as HTMLInputElement;
    expect(input).toHaveAttribute("data-nav");
    fireEvent.change(input, { target: { value: "hello" } });
    // Enter submits
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(typeof body.answer).toBe("string");
    expect(body.answer).toBe("hello");
  });

  it("check disabled until input filled and clear works", () => {
    const item = { ...base, content: { kind: "vocab_card", lemma: "hola" } } as unknown as never;
    render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="903:0" qIdx={0} />));
    const check = screen.getByRole("button", { name: "exercise.check" }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    const input = screen.getByLabelText("vocab.inputLabel") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    expect(check.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "vocab.clear" }));
    expect((screen.getByLabelText("vocab.inputLabel") as HTMLInputElement).value).toBe("");
  });

  it("choices mode: renders radio group, data-nav on each, posts choice id", async () => {
    const item = { ...base, content: { kind: "vocab_card", lemma: "hola", choices: [{ id: "a", text: "hello" }, { id: "b", text: "goodbye" }] } } as unknown as never;
    render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="904:0" qIdx={0} />));
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    for (const r of radios) expect(r).toHaveAttribute("data-nav");
    fireEvent.click(radios[1]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "exercise.check" }));
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body2 = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(body2.answer).toBe("b");
    expect(typeof body2.answer).toBe("string");
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "vocab_card", lemma: "hola", gloss: "hello" } } as unknown as never;
    const { container } = render(tWrap(<VocabCardItem item={item} solved={{}} onSolved={vi.fn()} qKey="905:0" qIdx={0} />));
    expect(container.textContent).not.toContain("bien");
  });
});
