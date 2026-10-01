// SPDX-License-Identifier: AGPL-3.0-or-later
// GamepadAnswerPad: controller answer entry for exercises.
// MCQ: the four face buttons pick choices 1 to 4 while the exercise listens,
// one pill per choice on the legend. Numeric: an on-screen number pad with
// digits, / and . ; its enter key submits, gamepad B closes the pad.
// Renders nothing until a pad connects, so mouse and keyboard users see no
// change. The root carries data-gamepad-active while it consumes buttons so a
// future shell update can yield its own face-button handling (the shell keeps
// B back, X read, Y hint live; LearnerShell is Well 3's file). Rumble on a
// correct answer stays in ExerciseItem submit(), which every path here uses.
import { useCallback, useState } from "react";
import { useGamepad } from "../hooks/useGamepad";
import ControllerLegend, { type LegendPill } from "./ControllerLegend";

const FACE = ["A", "B", "X", "Y"] as const;
const MAX_LEN = 32;

type PadKey = { label: string; insert?: string; action?: "clear" | "back" | "enter" };

const KEYPAD: PadKey[] = [
  { label: "7", insert: "7" },
  { label: "8", insert: "8" },
  { label: "9", insert: "9" },
  { label: "/", insert: "/" },
  { label: "4", insert: "4" },
  { label: "5", insert: "5" },
  { label: "6", insert: "6" },
  { label: ".", insert: "." },
  { label: "1", insert: "1" },
  { label: "2", insert: "2" },
  { label: "3", insert: "3" },
  { label: "C", action: "clear" },
  { label: "0", insert: "0" },
  { label: "Del", action: "back" },
  { label: "enter", action: "enter" },
];

function shortChoice(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 20 ? `${clean.slice(0, 20)}...` : clean;
}

export default function GamepadAnswerPad({
  kind,
  choices = [],
  onPick,
  value = "",
  onInput,
  onSubmit,
  busy = false,
}: {
  kind: "mcq" | "numeric";
  choices?: { id: string; text: string }[];
  onPick?: (choiceId: string) => void;
  value?: string;
  onInput?: (next: string) => void;
  onSubmit?: () => void;
  busy?: boolean;
}) {
  const [padOpen, setPadOpen] = useState(true);
  const listening = kind === "mcq" || padOpen;

  const onButtonDown = useCallback(
    (index: number) => {
      if (kind === "mcq") {
        if (busy) return;
        // Standard mapping: 0=A, 1=B, 2=X, 3=Y pick choices 1 to 4.
        const ch = choices[index];
        if (ch) onPick?.(ch.id);
        return;
      }
      if (!padOpen) return;
      if (index === 1) setPadOpen(false); // B closes the pad
    },
    [kind, busy, choices, onPick, padOpen],
  );

  const { connected } = useGamepad({ enabled: listening, onButtonDown });

  if (!connected) return null;

  function pressKey(k: PadKey) {
    if (k.action === "enter") {
      if (!busy && value.trim()) onSubmit?.();
      return;
    }
    if (busy || !onInput) return;
    if (k.action === "clear") onInput("");
    else if (k.action === "back") onInput(value.slice(0, -1));
    else if (k.insert) onInput(`${value}${k.insert}`.slice(0, MAX_LEN));
  }

  if (kind === "mcq") {
    const pills: LegendPill[] = choices.slice(0, 4).map((ch, i) => ({
      key: FACE[i],
      label: `${i + 1}. ${shortChoice(ch.text)}`,
    }));
    if (pills.length === 0) return null;
    return (
      <div data-gamepad-active="true" style={{ marginTop: 6 }}>
        <ControllerLegend pills={pills} />
      </div>
    );
  }

  if (!padOpen) {
    return (
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost" type="button" data-nav onClick={() => setPadOpen(true)}>
          Number pad
        </button>
      </div>
    );
  }

  const pills: LegendPill[] = [
    { key: "D-pad", label: "move" },
    { key: "A", label: "press key" },
    { key: "B", label: "close" },
  ];
  return (
    <div data-gamepad-active="true" style={{ marginTop: 8 }}>
      <div
        role="group"
        aria-label="Number pad"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(48px, 72px))", gap: 6, maxWidth: 320 }}
      >
        {KEYPAD.map((k) => (
          <button
            key={k.label}
            type="button"
            data-nav
            className="btn"
            aria-label={k.label}
            disabled={busy}
            style={{ padding: "6px 0" }}
            onClick={() => pressKey(k)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <ControllerLegend pills={pills} />
      </div>
    </div>
  );
}
