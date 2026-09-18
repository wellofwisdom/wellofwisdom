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

import ListenChoiceItem from "./ListenChoiceItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("ListenChoiceItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "listen_choice", explanation: "ok" } });
  });

  const base = { id: 911, type: "exercise" as const, position: 0 };
  const choices = [
    { id: "c1", text: "El libro es rojo." },
    { id: "c2", text: "La silla es azul." },
    { id: "c3", text: "La mesa es verde." },
  ];

  it("renders prompt and choices", () => {
    const item = { ...base, content: { kind: "listen_choice", prompt: "What did you hear?", audioText: "El libro es rojo.", choices } } as unknown as never;
    const { container } = render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="911:0" qIdx={0} />));
    expect(container.textContent).toContain("What did you hear?");
    expect(screen.getAllByRole("radio").length).toBe(3);
  });

  it("renders audio element when audioUrl is /media/... and Speak button otherwise", () => {
    const withMedia = { ...base, content: { kind: "listen_choice", prompt: "Pick", audioUrl: "/media/123", choices } } as unknown as never;
    const { container, rerender } = render(tWrap(<ListenChoiceItem item={withMedia} solved={{}} onSolved={vi.fn()} qKey="911:0" qIdx={0} />));
    expect(container.querySelector("audio")).toBeTruthy();
    const withTTS = { ...base, content: { kind: "listen_choice", prompt: "Pick", audioText: "El libro es rojo.", choices } } as unknown as never;
    rerender(tWrap(<ListenChoiceItem item={withTTS} solved={{}} onSolved={vi.fn()} qKey="911:0" qIdx={0} />));
    expect(screen.getByRole("button", { name: "listenChoice.listen" })).toBeTruthy();
  });

  it("fallback when prompt missing but text present", () => {
    const item = { ...base, content: { kind: "listen_choice", text: "Fallback prompt", choices } } as unknown as never;
    const { container } = render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="911:0" qIdx={0} />));
    expect(container.textContent).toContain("Fallback prompt");
  });

  it("empty fallback when no prompt/text/choices", () => {
    const item = { ...base, content: { kind: "listen_choice" } } as unknown as never;
    const { container } = render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="911:0" qIdx={0} />));
    expect(container.textContent).toContain("listenChoice.empty");
  });

  it("choices have data-nav, aria, keyboard arrow navigation", () => {
    const item = { ...base, content: { kind: "listen_choice", prompt: "Pick", audioText: "Hello", choices } } as unknown as never;
    render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="912:0" qIdx={0} />));
    const radios = screen.getAllByRole("radio");
    for (const r of radios) {
      expect(r).toHaveAttribute("data-nav");
      expect(r.getAttribute("aria-label")).toBeTruthy();
    }
    (radios[0] as HTMLElement).focus();
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.keyDown(radios[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(radios[0]);
  });

  it("posts picked choice id string and check disabled until picked", async () => {
    const item = { ...base, content: { kind: "listen_choice", prompt: "Pick", audioText: "El libro es rojo.", choices } } as unknown as never;
    render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="913:0" qIdx={0} />));
    const check = screen.getByRole("button", { name: "exercise.check" }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(body.answer).toBe("c1");
    expect(typeof body.answer).toBe("string");
  });

  it("hides explanation before submit", () => {
    const item = { ...base, content: { kind: "listen_choice", prompt: "Pick", audioText: "Hello", choices } } as unknown as never;
    const { container } = render(tWrap(<ListenChoiceItem item={item} solved={{}} onSolved={vi.fn()} qKey="914:0" qIdx={0} />));
    expect(container.textContent).not.toContain("ok");
  });
});
