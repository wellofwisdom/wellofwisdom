// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared validation + helper mirrors of server/lib/items/kinds/common caps.

export const MAX_CHOICES = 5;
export const MAX_HINTS = 3;
export const MAX_HINT_LEN = 500;

export function toChoices(text: string): { id: string; text: string }[] {
  return String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CHOICES)
    .map((text, i) => ({ id: `c${i + 1}`, text }));
}

export function joinChoices(choices: { id?: string; text: string }[] | undefined): string {
  return (choices ?? []).map((c) => c.text).join("\n");
}

export function validateHints(hints: string[]): string | null {
  const filtered = hints.map((s) => s.trim()).filter(Boolean);
  if (filtered.length > MAX_HINTS) return "too_many_hints";
  for (const h of filtered) if (h.length > MAX_HINT_LEN) return "hint_too_long";
  return null;
}
