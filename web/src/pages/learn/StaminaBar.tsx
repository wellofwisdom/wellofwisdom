// SPDX-License-Identifier: AGPL-3.0-or-later
// StaminaBar: tiny opt-in stamina for the boss. Drains per attempt, refills
// on correct answers, never blocks learning (a run still resets to practice,
// not punishment). Pure display, fed by the boss fight state.
interface Props {
  value: number;
  max: number;
}

export default function StaminaBar({ value, max }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="staminabar" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label="Stamina">
      <span className="staminabar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
    </div>
  );
}
