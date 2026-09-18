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
vi.mock("../../../components/PushToTalk", () => ({ PushToTalk: () => null }));

import ListenRepeatItem from "./ListenRepeatItem";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

describe("ListenRepeatItem", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockResolvedValue({ correct: true, reveal: { kind: "listen_repeat", explanation: "perfecto" } });
  });

  const base = { id: 921, type: "exercise" as const, position: 0 };

  it("renders prompt and listen button", () => {
    const item = { ...base, content: { kind: "listen_repeat", prompt: "Listen and repeat: El libro es rojo.", audioText: "El libro es rojo." } } as unknown as never;
    const { container } = render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="921:0" qIdx={0} />));
    expect(container.textContent).toContain("Listen and repeat");
    expect(screen.getByRole("button", { name: "listenRepeat.listen" })).toBeTruthy();
  });

  it("renders audio element when audioUrl is /media/...", () => {
    const item = { ...base, content: { kind: "listen_repeat", prompt: "Repeat", audioUrl: "/media/99", audioText: "Hello" } } as unknown as never;
    const { container } = render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="921:0" qIdx={0} />));
    expect(container.querySelector("audio")).toBeTruthy();
    expect(container.querySelector("audio")!.getAttribute("src")).toBe("/media/99");
  });

  it("fallback when prompt missing but text present", () => {
    const item = { ...base, content: { kind: "listen_repeat", text: "Fallback repeat" } } as unknown as never;
    const { container } = render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="921:0" qIdx={0} />));
    expect(container.textContent).toContain("Fallback repeat");
  });

  it("empty fallback when no prompt or text", () => {
    const item = { ...base, content: { kind: "listen_repeat" } } as unknown as never;
    const { container } = render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="921:0" qIdx={0} />));
    expect(container.textContent).toContain("listenRepeat.empty");
  });

  it("input has data-nav and aria, posts transcript string, Enter submits", async () => {
    const item = { ...base, content: { kind: "listen_repeat", prompt: "Repeat: hello", audioText: "hello" } } as unknown as never;
    render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="922:0" qIdx={0} />));
    const input = screen.getByLabelText("listenRepeat.inputLabel") as HTMLInputElement;
    expect(input).toHaveAttribute("data-nav");
    expect(input.getAttribute("aria-label")).toBeTruthy();
    const check = screen.getByRole("button", { name: "exercise.check" }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "el libro es rojo" } });
    expect(check.disabled).toBe(false);
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(mockApi).toHaveBeenCalled());
    const body = (mockApi.mock.calls[0][1] as { body: { answer: unknown } }).body;
    expect(typeof body.answer).toBe("string");
    expect(body.answer).toBe("el libro es rojo");
  });

  it("clear button and listen button have data-nav", () => {
    const item = { ...base, content: { kind: "listen_repeat", prompt: "Repeat hello", audioText: "hello" } } as unknown as never;
    render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="923:0" qIdx={0} />));
    const clear = screen.getByRole("button", { name: "listenRepeat.clear" });
    expect(clear).toHaveAttribute("data-nav");
    const listen = screen.getByRole("button", { name: "listenRepeat.listen" });
    expect(listen).toHaveAttribute("data-nav");
    const input = screen.getByLabelText("listenRepeat.inputLabel") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.click(clear);
    expect((screen.getByLabelText("listenRepeat.inputLabel") as HTMLInputElement).value).toBe("");
  });

  it("hides explanation before submit and shows per-word feedback area after grading", async () => {
    const item = { ...base, content: { kind: "listen_repeat", prompt: "Repeat", audioText: "hello" } } as unknown as never;
    const { container } = render(tWrap(<ListenRepeatItem item={item} solved={{}} onSolved={vi.fn()} qKey="924:0" qIdx={0} />));
    expect(container.textContent).not.toContain("perfecto");
    const input = screen.getByLabelText("listenRepeat.inputLabel") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "exercise.check" }));
    await vi.waitFor(() => expect(screen.getByText("perfecto")).toBeTruthy());
  });
});
