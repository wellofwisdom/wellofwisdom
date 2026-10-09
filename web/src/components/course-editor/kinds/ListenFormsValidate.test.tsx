// SPDX-License-Identifier: AGPL-3.0-or-later
// Proves the listening form output survives a course export: fill both
// builder forms, wrap what they built in a course package, and run the real
// scripts/validate-course.js on it. Lives outside tsc (like the French course
// test) because it needs node builtins the web tsconfig does not type.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ListenChoiceForm from "./ListenChoiceForm";
import ListenRepeatForm from "./ListenRepeatForm";

function lastBuilt(onBuilt: { mock: { calls: unknown[][] } }): { content: Record<string, any> | null; problem: string | null } {
  const call = onBuilt.mock.calls[onBuilt.mock.calls.length - 1];
  return { content: call[0] as Record<string, any> | null, problem: call[1] as string | null };
}

describe("hand-built listening items pass validate-course.js", () => {
  it("exports a course built from both forms and the validator passes it", () => {
    const choiceOnBuilt = vi.fn();
    const choiceView = render(<ListenChoiceForm content={{}} onBuilt={choiceOnBuilt} onPreview={vi.fn()} />);
    const choice = within(choiceView.container);
    fireEvent.change(choice.getByLabelText("Prompt"), { target: { value: "Qu'entends-tu ?" } });
    fireEvent.change(choice.getByLabelText(/Audio text/), { target: { value: "Je veux du pain." } });
    fireEvent.change(choice.getByLabelText(/Choices \(one per line/), { target: { value: "Je veux du pain.\nJe veux du the.\nJe veux dormir." } });
    fireEvent.change(choice.getByLabelText("Correct answer"), { target: { value: "0" } });
    fireEvent.change(choice.getByLabelText("Explanation"), { target: { value: "pain means bread." } });
    const choiceOut = lastBuilt(choiceOnBuilt).content;
    expect(choiceOut).toBeTruthy();

    const repeatOnBuilt = vi.fn();
    const repeatView = render(<ListenRepeatForm content={{}} onBuilt={repeatOnBuilt} onPreview={vi.fn()} />);
    const repeat = within(repeatView.container);
    fireEvent.change(repeat.getByLabelText("Prompt"), { target: { value: "Listen and repeat:" } });
    fireEvent.change(repeat.getByLabelText(/Expected phrase/), { target: { value: "Le livre est rouge." } });
    fireEvent.change(repeat.getByLabelText(/uploaded file id/), { target: { value: "12" } });
    fireEvent.change(repeat.getByLabelText(/Audio text/), { target: { value: "Le livre est rouge." } });
    fireEvent.change(repeat.getByLabelText(/Accepted alternatives/), { target: { value: "le livre est rouge" } });
    const repeatOut = lastBuilt(repeatOnBuilt).content;
    expect(repeatOut).toBeTruthy();

    const pkg = {
      format: "wellofwisdom-course",
      version: 1,
      title: "French listening, hand-built by the forms",
      topic: "French A1 listening practice",
      description: "Two exercises built entirely with the builder listening forms.",
      license: "CC-BY-4.0",
      units: [
        {
          title: "Ecoutez bien",
          lessons: [
            {
              title: "Words and sentences",
              summary: "Choose what you hear, then repeat it.",
              items: [
                { type: "exercise", content: choiceOut },
                { type: "exercise", content: repeatOut },
              ],
            },
          ],
        },
      ],
    };

    const scriptCandidates = [
      path.resolve(process.cwd(), "scripts/validate-course.js"),
      path.resolve(process.cwd(), "..", "scripts/validate-course.js"),
    ];
    const script = scriptCandidates.find((p) => fs.existsSync(p));
    expect(script).toBeTruthy();

    const tmp = path.join(os.tmpdir(), `listen-forms-${Date.now()}.wow-course.json`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(pkg, null, 2));
      const out = execFileSync(process.execPath, [script as string, tmp], { encoding: "utf8" });
      expect(out).toContain("ok");
      expect(out).toContain("1 of 1 passed");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});
