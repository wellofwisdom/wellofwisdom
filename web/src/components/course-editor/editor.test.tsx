// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InlineRename from "./InlineRename";
import VersionHistory from "./VersionHistory";

describe("InlineRename", () => {
  it("renders the title and switches to an input on click", async () => {
    const onSave = vi.fn();
    render(<InlineRename value="Hello" label="unit 1" onSave={onSave} />);
    const btn = screen.getByLabelText(/rename unit 1/i);
    expect(btn.textContent).toBe("Hello");
    fireEvent.click(btn);
    const input = screen.getByLabelText(/new title for unit 1/i) as HTMLInputElement;
    expect(input.value).toBe("Hello");
    fireEvent.change(input, { target: { value: "World" } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith("World");
  });

  it("cancels on Escape without saving", () => {
    const onSave = vi.fn();
    render(<InlineRename value="Hello" label="lesson 1.1" onSave={onSave} />);
    fireEvent.click(screen.getByLabelText(/rename lesson/i));
    const input = screen.getByLabelText(/new title for lesson/i);
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("VersionHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ versions: [{ id: 1, createdAt: new Date().toISOString(), createdBy: 1 }] }) } as Response)));
  });
  it("renders versions after load", async () => {
    render(<VersionHistory courseId={123} onRestored={() => {}} />);
    expect(await screen.findByText(/Restore/)).toBeTruthy();
  });
});
