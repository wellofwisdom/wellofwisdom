// SPDX-License-Identifier: AGPL-3.0-or-later
// ControllerLegend: button legend shown when a pad is connected. Default pills
// are the shell-wide mapping; callers can pass mode pills, e.g. the answer pad
// shows which face button picks which choice while an exercise listens.
export interface LegendPill {
  key: string;
  label: string;
}

const BASE_PILLS: LegendPill[] = [
  { key: "A", label: "select" },
  { key: "B", label: "back" },
  { key: "X", label: "read" },
  { key: "Start", label: "map" },
  { key: "D-pad", label: "move" },
];

export default function ControllerLegend({ pills = BASE_PILLS }: { pills?: LegendPill[] }) {
  return (
    <div className="padlegend" role="note" aria-label="Controller legend">
      {pills.map((p) => (
        <span key={`${p.key} ${p.label}`} className="padlegend-pill">
          <b>{p.key}</b> {p.label}
        </span>
      ))}
    </div>
  );
}
