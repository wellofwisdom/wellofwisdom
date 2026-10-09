// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ListenChoiceForm from "./ListenChoiceForm";

function lastBuilt(onBuilt: { mock: { calls: unknown[][] } }): { content: Record<string, any> | null; problem: string | null } {
  const call = onBuilt.mock.calls[onBuilt.mock.calls.length - 1];
  return { content: call[0] as Record<string, any> | null, problem: call[1] as string | null };
}

// The hint rows wrap the input and its Remove button in one Field, so the
// label is not tied to a single control. Walk to the input by hand.
function hintInput(label: string): HTMLInputElement {
  const field = screen.getByText(label).closest(".field");
  return (field?.querySelector("input") ?? null) as HTMLInputElement;
}

describe("ListenChoiceForm", () => {
  it("renders empty and reports the first missing piece", () => {
    const onBuilt = vi.fn();
    const onPreview = vi.fn();
    render(<ListenChoiceForm content={{}} onBuilt={onBuilt} onPreview={onPreview} />);
    expect(screen.getByText("prompt_required")).toBeTruthy();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("fills, builds and saves the registry shape", () => {
    const onBuilt = vi.fn();
    const onPreview = vi.fn();
    render(<ListenChoiceForm content={{}} onBuilt={onBuilt} onPreview={onPreview} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "What did you hear?" } });
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Je veux du pain." } });
    fireEvent.change(screen.getByLabelText(/Choices \(one per line/), { target: { value: "Je veux du pain.\nJe veux du the.\nJe veux dormir." } });
    fireEvent.change(screen.getByLabelText("Correct answer"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "pain means bread." } });
    fireEvent.click(screen.getByText("+ Hint"));
    fireEvent.change(hintInput("Hint 1"), { target: { value: "Listen for the food word." } });
    const { content, problem } = lastBuilt(onBuilt);
    expect(problem).toBe(null);
    expect(content).toEqual({
      prompt: "What did you hear?",
      kind: "listen_choice",
      choices: [
        { id: "c1", text: "Je veux du pain." },
        { id: "c2", text: "Je veux du the." },
        { id: "c3", text: "Je veux dormir." },
      ],
      answer: "c2",
      audioText: "Je veux du pain.",
      explanation: "pain means bread.",
      hints: ["Listen for the food word."],
    });
    expect(onPreview).toHaveBeenCalled();
    expect(onPreview.mock.calls[onPreview.mock.calls.length - 1][0].content.kind).toBe("listen_choice");
  });

  it("walks through the missing pieces: audio, choices, answer", () => {
    const onBuilt = vi.fn();
    render(<ListenChoiceForm content={{}} onBuilt={onBuilt} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Pick what you heard." } });
    expect(lastBuilt(onBuilt).problem).toBe("audio_required");
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Bonjour." } });
    expect(lastBuilt(onBuilt).problem).toBe("choices_required");
    fireEvent.change(screen.getByLabelText(/Choices \(one per line/), { target: { value: "Bonjour.\nSalut." } });
    expect(lastBuilt(onBuilt).problem).toBe("answer_required");
    fireEvent.change(screen.getByLabelText("Correct answer"), { target: { value: "0" } });
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText(/Choices \(one per line/), { target: { value: "a\nb\nc\nd\ne\nf\ng" } });
    expect(lastBuilt(onBuilt).problem).toBe("too_many_choices");
  });

  it("turns an upload id into a /media url, and refuses a bad link or a double source", () => {
    const onBuilt = vi.fn();
    render(<ListenChoiceForm content={{}} onBuilt={onBuilt} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Pick." } });
    fireEvent.change(screen.getByLabelText(/Audio text/), { target: { value: "Salut." } });
    fireEvent.change(screen.getByLabelText(/Choices \(one per line/), { target: { value: "Salut.\nBonjour." } });
    fireEvent.change(screen.getByLabelText("Correct answer"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "abc" } });
    expect(lastBuilt(onBuilt).problem).toBe("uploadId_invalid");
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "12" } });
    expect(lastBuilt(onBuilt).content?.audioUrl).toBe("/media/12");
    fireEvent.change(screen.getByLabelText(/or media link/), { target: { value: "/media/13" } });
    expect(lastBuilt(onBuilt).problem).toBe("audio_conflict");
    fireEvent.change(screen.getByLabelText(/uploaded file id/), { target: { value: "" } });
    expect(lastBuilt(onBuilt).content?.audioUrl).toBe("/media/13");
    fireEvent.change(screen.getByLabelText(/or media link/), { target: { value: "https://example.com/a.mp3" } });
    expect(lastBuilt(onBuilt).problem).toBe("audioUrl_invalid");
  });

  it("reloads saved content and edits it", () => {
    const onBuilt = vi.fn();
    const saved = {
      prompt: "What did you hear?",
      kind: "listen_choice",
      audioText: "Je veux du pain.",
      choices: [
        { id: "c1", text: "Je veux du pain." },
        { id: "c2", text: "Je veux du the." },
      ],
      answer: "c2",
    };
    const { container } = render(<ListenChoiceForm content={saved} onBuilt={onBuilt} onPreview={vi.fn()} />);
    expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe("What did you hear?");
    expect((screen.getByLabelText(/Audio text/) as HTMLInputElement).value).toBe("Je veux du pain.");
    expect((screen.getByLabelText(/Choices \(one per line/) as HTMLTextAreaElement).value).toBe("Je veux du pain.\nJe veux du the.");
    expect((screen.getByLabelText("Correct answer") as HTMLSelectElement).value).toBe("1");
    expect(lastBuilt(onBuilt).problem).toBe(null);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Ecoute et choisis." } });
    const { content } = lastBuilt(onBuilt);
    expect(content?.prompt).toBe("Ecoute et choisis.");
    expect(content?.answer).toBe("c2");
    expect(container.textContent).toContain("Live preview");
  });

  it("keeps hints capped at three like the server", () => {
    const onBuilt = vi.fn();
    render(<ListenChoiceForm content={{ hints: ["a", "b", "c"] }} onBuilt={onBuilt} onPreview={vi.fn()} />);
    expect(screen.queryByText("+ Hint")).toBe(null);
    expect(lastBuilt(onBuilt).problem).toBe("prompt_required");
  });
});
