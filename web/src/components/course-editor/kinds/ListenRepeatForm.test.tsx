// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ListenRepeatForm from "./ListenRepeatForm";

function lastBuilt(onBuilt: { mock: { calls: unknown[][] } }): { content: Record<string, any> | null; problem: string | null } {
  const call = onBuilt.mock.calls[onBuilt.mock.calls.length - 1];
  return { content: call[0] as Record<string, any> | null, problem: call[1] as string | null };
}

// The hint rows wrap the input and its Remove button in one Field, so the
// label is not tied to a single control. Walk to the input by hand, scoped
// to one rendered form when two are on the page.
function hintInput(label: string, scope?: HTMLElement): HTMLInputElement {
  const root: ParentNode = scope ?? document.body;
  const hit = Array.from(root.querySelectorAll(".field")).find((f) => f.querySelector("label")?.textContent === label);
  return (hit?.querySelector("input") ?? null) as HTMLInputElement;
}

describe("ListenRepeatForm", () => {
  it("renders empty and reports the first missing piece", () => {
    const onBuilt = vi.fn();
    render(<ListenRepeatForm content={{}} onBuilt={onBuilt} onPreview={vi.fn()} />);
    expect(screen.getByText("prompt_required")).toBeTruthy();
  });

  it("fills, builds and saves the registry shape", () => {
    const onBuilt = vi.fn();
    const onPreview = vi.fn();
    render(<ListenRepeatForm content={{}} onBuilt={onBuilt} onPreview={onPreview} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Listen and repeat:" } });
    fireEvent.change(screen.getByLabelText(/Expected phrase/), { target: { value: "Le livre est rouge." } });
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Le livre est rouge." } });
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: "le livre est rouge\nLe livre est bleu?" } });
    fireEvent.click(screen.getByText("+ Hint"));
    fireEvent.change(hintInput("Hint 1"), { target: { value: "Say each word clearly." } });
    const { content, problem } = lastBuilt(onBuilt);
    expect(problem).toBe(null);
    expect(content).toEqual({
      prompt: "Listen and repeat:",
      kind: "listen_repeat",
      expected: "Le livre est rouge.",
      audioUrl: "/media/12",
      audioText: "Le livre est rouge.",
      alternatives: ["le livre est rouge", "Le livre est bleu?"],
      hints: ["Say each word clearly."],
    });
    expect(onPreview.mock.calls[onPreview.mock.calls.length - 1][0].content.kind).toBe("listen_repeat");
  });

  it("walks through the missing pieces and refuses duplicates and bad links", () => {
    const onBuilt = vi.fn();
    render(<ListenRepeatForm content={{}} onBuilt={onBuilt} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Listen and repeat:" } });
    expect(lastBuilt(onBuilt).problem).toBe("expected_required");
    fireEvent.change(screen.getByLabelText(/Expected phrase/), { target: { value: "Bonjour." } });
    expect(lastBuilt(onBuilt).problem).toBe("audio_required");
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Bonjour." } });
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: "bonjour\nBonjour" } });
    expect(lastBuilt(onBuilt).problem).toBe("alternative_duplicate");
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: "salut." } });
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: "Bonjour." } });
    expect(lastBuilt(onBuilt).problem).toBe("alternative_duplicate");
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: "salut." } });
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/or media link/), { target: { value: "/media/7" } });
    expect(lastBuilt(onBuilt).problem).toBe("audio_conflict");
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "" } });
    const withLink = lastBuilt(onBuilt);
    expect(withLink.problem).toBe(null);
    expect(withLink.content?.audioUrl).toBe("/media/7");
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "" } });
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText(/or media link/), { target: { value: "audio.mp3" } });
    expect(lastBuilt(onBuilt).problem).toBe("audioUrl_invalid");
    fireEvent.change(screen.getByLabelText(/or media link/), { target: { value: "" } });
    expect(lastBuilt(onBuilt).problem).toBe("audio_required");
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Bonjour." } });
    fireEvent.change(screen.getByLabelText(/Accepted alternatives/), { target: { value: Array.from({ length: 11 }, (_, i) => `alt ${i}`).join("\n") } });
    expect(lastBuilt(onBuilt).problem).toBe("too_many_alternatives");
  });

  it("reloads saved content and edits it", () => {
    const onBuilt = vi.fn();
    const saved = {
      prompt: "Listen and repeat:",
      kind: "listen_repeat",
      expected: "Le livre est rouge.",
      audioText: "Le livre est rouge.",
      alternatives: ["le livre est rouge"],
      hints: ["Say each word clearly."],
    };
    render(<ListenRepeatForm content={saved} onBuilt={onBuilt} onPreview={vi.fn()} />);
    expect((screen.getByLabelText(/Expected phrase/) as HTMLInputElement).value).toBe("Le livre est rouge.");
    expect((screen.getByLabelText(/Accepted alternatives/) as HTMLTextAreaElement).value).toBe("le livre est rouge");
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText(/Expected phrase/), { target: { value: "La maison est bleue." } });
    const { content } = lastBuilt(onBuilt);
    expect(content?.expected).toBe("La maison est bleue.");
    expect(content?.kind).toBe("listen_repeat");
  });
});

