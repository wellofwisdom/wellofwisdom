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

import TranslateItem from "./TranslateItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("TranslateItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "translate", explanation: "bien" } });
  });

  const base = { id: 931, type: "exercise" as const, position: 0 };

  it("renders prompt", () => {
    const item = { ...base, content: { kind: "translate", prompt: "Translate to Spanish: My name is Ana." } } as unknown as never;
    const { container } = render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="931:0" qIdx={0} />));
    expect(container.textContent).toContain("Translate to Spanish: My name is Ana.");
  });

  it("fallback when prompt missing but text present", () => {
    const item = { ...base, content: { kind: "translate", text: "Fallback translate prompt" } } as unknown as never;
    const { container } = render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="931:0" qIdx={0} />));
    expect(container.textContent).toContain("Fallback translate prompt");
  });

  it("empty fallback when no prompt or text", () => {
    const item = { ...base, content: { kind: "translate" } } as unknown as never;
    const { container } = render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="931:0" qIdx={0} />));
    expect(container.textContent).toContain("translate.empty");
  });

  it("textarea has data-nav and aria, posts string, check disabled until filled", async () => {
    const item = { ...base, content: { kind: "translate", prompt: "Translate: Hello" } } as unknown as never;
    render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="932:0" qIdx={0} />));
    const textarea = screen.getByLabelText("translate.inputLabel") as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("data-nav");
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
    const check = screen.getByRole("button", { name: "exercise.check" }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "Hola" } });
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(typeof body.answer).toBe("string");
    expect(body.answer).toBe("Hola");
  });

  it("clear button clears textarea and has data-nav", () => {
    const item = { ...base, content: { kind: "translate", prompt: "Translate: Hello" } } as unknown as never;
    render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="933:0" qIdx={0} />));
    const textarea = screen.getByLabelText("translate.inputLabel") as HTMLTextAreaElement;
    const clear = screen.getByRole("button", { name: "translate.clear" });
    expect(clear).toHaveAttribute("data-nav");
    fireEvent.change(textarea, { target: { value: "Hola" } });
    expect(textarea.value).toBe("Hola");
    fireEvent.click(clear);
    expect((screen.getByLabelText("translate.inputLabel") as HTMLTextAreaElement).value).toBe("");
  });

  it("every button has data-nav", () => {
    const item = { ...base, content: { kind: "translate", prompt: "Translate: Hello" } } as unknown as never;
    const { container } = render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="933:0" qIdx={0} />));
    const btns = Array.from(container.querySelectorAll("button"));
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) expect(b).toHaveAttribute("data-nav");
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "translate", prompt: "Translate: Hello" } } as unknown as never;
    const { container } = render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="934:0" qIdx={0} />));
    expect(container.textContent).not.toContain("bien");
  });

  it("shows Sent for review when needsReview true", async () => {
    mockApi.mockResolvedValue({ correct: false, needsReview: true, reveal: { kind: "translate", explanation: "needs a human" } });
    const item = { ...base, content: { kind: "translate", prompt: "Translate: Hello" } } as unknown as never;
    render(tWrap(<TranslateItem item={item} solved={{}} onSolved={vi.fn()} qKey="935:0" qIdx={0} />));
    const textarea = screen.getByLabelText("translate.inputLabel") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "exercise.check" }));
    await vi.waitFor(() => expect(screen.getByText("translate.sentForReview")).toBeTruthy());
    expect(screen.getByText("needs a human")).toBeTruthy();
  });
});
