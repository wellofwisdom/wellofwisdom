// SPDX-License-Identifier: AGPL-3.0-or-later
// TextAnswerPad: on-screen text keyboard so controller-only play (Steam Deck
// is the eventual bar) survives free-text answers, the gap the number pad
// (PR 106) left open. Same conventions as GamepadAnswerPad: it renders
// nothing until a pad connects, so mouse and keyboard users see no change.
// Focus entering the served input (inputRef) makes the pad offer itself as a
// chip; activating the chip opens the keyboard. Keys are real buttons, so
// D-pad movement is the shell's spatial nav and every key stays clickable by
// mouse and touch. While a key of this pad holds focus the root carries
// data-gamepad-active, so the shell yields the face buttons (PR 111 guard)
// and A presses the focused key, B backs out (closes the pad and returns
// focus to the input). Move focus off the keys and the pad yields: the shell
// acts again, exactly like the choice pad.
import { useCallback, useEffect, useRef, useState } from "react";
import { useGamepad } from "../hooks/useGamepad";
import ControllerLegend, { type LegendPill } from "./ControllerLegend";
import { useT } from "../i18n";

type PadKey = {
  label: string;
  insert?: string;
  action?: "back" | "space" | "done";
  aria?: "backspace" | "space" | "done";
  span?: number;
};

function letters(row: string): PadKey[] {
  return [...row].map((ch) => ({ label: ch, insert: ch }));
}

// Ten columns per row. Letters first (they carry most answers), then digits
// and punctuation; the space bar spans six columns so thumbs and the D-pad
// find it without precision. The visible label of the action keys is a
// symbol or a translated word; their names come from t().
const ROWS: PadKey[][] = [
  letters("qwertyuiop"),
  letters("asdfghjkl'"),
  letters("zxcvbnm,.!"),
  letters("1234567890"),
  [
    { label: "?", insert: "?" },
    { label: "-", insert: "-" },
    { label: "", action: "space", aria: "space", span: 6 },
    { label: "\u232B", action: "back", aria: "backspace" },
    { label: "done", action: "done", aria: "done" },
  ],
];

// Width budget, measured in TextAnswerPad.test.tsx from these same inline
// values: 10 columns of 30px plus 9 gaps of 4px is 336px, which fits a 375px
// phone with 16px padding on each side, and the 460px cap sits well inside a
// 1280px Steam Deck screen.
const COLS = 10;
const COL_MIN = 30;
const COL_MAX = 44;
const GAP = 4;
const PAD_MAX_WIDTH = 460;
const KEY_MIN_HEIGHT = 40;

export default function TextAnswerPad({
  inputRef,
  value,
  onInput,
  onSubmit,
  busy = false,
  maxLength = 2000,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onInput: (next: string) => void;
  onSubmit?: () => void;
  busy?: boolean;
  maxLength?: number;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [focusOnField, setFocusOnField] = useState(false);
  const [focusOnKey, setFocusOnKey] = useState(false);

  // Live focus read: the served input and the pad's own keys are siblings or
  // spread through the document, so focusin/focusout on document drive both
  // flags, exactly like the choice pad tracks its radios.
  const sync = useCallback(() => {
    const el = document.activeElement;
    setFocusOnField(inputRef.current !== null && el === inputRef.current);
    setFocusOnKey(
      Boolean(rootRef.current && el && rootRef.current.contains(el) && (el as HTMLElement).tagName === "BUTTON"),
    );
  }, [inputRef]);

  useEffect(() => {
    sync();
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, [sync]);

  const onButtonDown = useCallback(
    (index: number) => {
      // Only while a key of the open pad holds focus; otherwise the attribute
      // is off and the shell handles every face.
      if (!open || !focusOnKey) return;
      if (index === 0) {
        const el = document.activeElement as HTMLElement | null;
        if (el && el.tagName === "BUTTON") el.click();
        return;
      }
      if (index === 1) {
        setOpen(false);
        inputRef.current?.focus();
      }
    },
    [open, focusOnKey, inputRef],
  );

  const { connected } = useGamepad({ enabled: open, onButtonDown });

  if (!connected) return null;

  function pressKey(k: PadKey) {
    if (k.action === "done") {
      if (!busy && onSubmit && value.trim()) onSubmit();
      setOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (busy || !onInput) return;
    if (k.action === "back") onInput(value.slice(0, -1));
    else if (k.action === "space") onInput(`${value} `.slice(0, maxLength));
    else if (k.insert) onInput(`${value}${k.insert}`.slice(0, maxLength));
  }

  if (!open) {
    // The offer: shown while focus is on the served input, so the pad invites
    // itself the moment a text field is the target. A real button, reachable
    // by mouse, touch and the shell's spatial nav alike.
    if (!focusOnField) return null;
    return (
      <div ref={rootRef} style={{ marginTop: 8 }}>
        <button className="btn ghost" type="button" data-nav onClick={() => setOpen(true)}>
          {t("pad.textPad")}
        </button>
      </div>
    );
  }

  const pills: LegendPill[] = [
    { key: "D-pad", label: t("pad.move") },
    { key: "A", label: t("pad.pressKey") },
    { key: "B", label: t("pad.close") },
  ];
  return (
    <div ref={rootRef} data-gamepad-active={focusOnKey ? "true" : undefined} style={{ marginTop: 8 }}>
      <div
        role="group"
        aria-label={t("pad.textPad")}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, minmax(${COL_MIN}px, ${COL_MAX}px))`,
          gap: GAP,
          maxWidth: PAD_MAX_WIDTH,
        }}
      >
        {ROWS.flat().map((k) => (
          <button
            key={`${k.label}-${k.action ?? "ins"}`}
            type="button"
            data-nav
            className="btn"
            aria-label={k.aria ? t(`pad.${k.aria}`) : k.label}
            disabled={busy}
            style={{
              padding: "8px 0",
              minHeight: KEY_MIN_HEIGHT,
              gridColumn: k.span ? `span ${k.span}` : undefined,
            }}
            onClick={() => pressKey(k)}
          >
            {k.aria === "done" ? t("pad.done") : k.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <ControllerLegend pills={pills} />
      </div>
    </div>
  );
}
