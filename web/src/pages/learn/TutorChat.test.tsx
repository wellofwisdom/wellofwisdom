// SPDX-License-Identifier: AGPL-3.0-or-later
// Tutor voice mode: the mute toggle persists per device, a spoken exchange
// carries voice params on the message it sends and keeps the sanctioned rate,
// and the text path (voice muted) sends none. The narrator itself is browser
// speech, which jsdom does not have, so speakWithLang no-ops here by its own
// guard; what these tests pin is the contract around it.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nContext } from "../../i18n";

const mockApi = vi.fn();
vi.mock("../../api", () => ({
  api: (...a: unknown[]) => (mockApi as unknown as (...args: unknown[]) => unknown)(...a),
  niceError: (e: unknown) => String(e),
}));

import TutorChat from "./TutorChat";

const tWrap = (ui: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: "en", t: (k: string) => k }}>{ui}</I18nContext.Provider>
);

const REPLY = "**Bold** step and a *soft* hint.";

function route(url: string, opts?: { method?: string; body?: { text?: string; voice?: { rate: number; lang: string } } }) {
  if (url === "/api/stt/status") return Promise.resolve({ configured: false });
  if (url === "/api/tutor/threads") return Promise.resolve({ threadId: 7 });
  if (url === "/api/tutor/threads/7") return Promise.resolve({ messages: [] });
  if (url === "/api/tutor/threads/7/messages") {
    return Promise.resolve({ reply: REPLY, refused: false, ...(opts?.body?.voice ? { voice: { rate: 0.75, lang: "en" } } : {}) });
  }
  return Promise.reject(new Error(`unexpected api call: ${url}`));
}

function sentBodies(): { text?: string; voice?: { rate: number; lang: string } }[] {
  return mockApi.mock.calls
    .filter(([u, o]) => String(u).endsWith("/messages") && (o as { body?: unknown })?.body)
    .map(([, o]) => (o as { body: { text?: string; voice?: { rate: number; lang: string } } }).body);
}

async function sendVia(box: HTMLElement, ask: HTMLElement, message: string) {
  fireEvent.change(box, { target: { value: message } });
  fireEvent.click(ask);
  await waitFor(() => expect(mockApi.mock.calls.some(([u]) => String(u).endsWith("/messages"))).toBe(true));
}

describe("TutorChat voice mode", () => {
  beforeAll(() => {
    // jsdom has no layout, so the auto-scroll at the end of the log is a no-op.
    Element.prototype.scrollIntoView = () => {};
  });

  beforeEach(() => {
    mockApi.mockReset();
    mockApi.mockImplementation((url: string, opts?: { method?: string; body?: { text?: string; voice?: { rate: number; lang: string } } }) => route(url, opts));
    localStorage.clear();
  });

  it("voice on: the send carries voice params and the reply renders", async () => {
    localStorage.setItem("wow-tutor-voice", "on");
    render(tWrap(<TutorChat lessonId={1} itemId={2} onClose={() => {}} />));
    const box = await screen.findByPlaceholderText("tutor.placeholder");
    const ask = screen.getByRole("button", { name: "tutor.ask" });
    await sendVia(box, ask, "I am stuck on step two");
    const body = sentBodies()[0];
    expect(body.text).toBe("I am stuck on step two");
    expect(body.voice).toEqual({ rate: 1, lang: "en" });
    await waitFor(() => expect(document.querySelector(".tutormsg.tutor")?.textContent).toContain("Bold step and a soft hint."));
  });

  it("the toggle persists to localStorage and the muted path sends no voice params", async () => {
    render(tWrap(<TutorChat lessonId={1} itemId={2} onClose={() => {}} />));
    const toggle = await screen.findByRole("button", { name: "Mute the tutor's voice" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("wow-tutor-voice")).toBe("off");

    const box = await screen.findByPlaceholderText("tutor.placeholder");
    const ask = screen.getByRole("button", { name: "tutor.ask" });
    await sendVia(box, ask, "still stuck");
    const body = sentBodies()[0];
    expect(body.text).toBe("still stuck");
    expect(body.voice).toBeUndefined();
  });

  it("a muted choice is remembered on the next open", async () => {
    localStorage.setItem("wow-tutor-voice", "off");
    render(tWrap(<TutorChat lessonId={1} itemId={2} onClose={() => {}} />));
    const toggle = await screen.findByRole("button", { name: "Unmute the tutor's voice" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(localStorage.getItem("wow-tutor-voice")).toBe("on");
  });
});
