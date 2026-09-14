// SPDX-License-Identifier: AGPL-3.0-or-later
// PadLegend: tiny button legend in the HUD when a pad is connected.
export default function PadLegend() {
  return (
    <div className="padlegend" role="note" aria-label="Controller legend">
      <span className="padlegend-pill"><b>A</b> select</span>
      <span className="padlegend-pill"><b>B</b> back</span>
      <span className="padlegend-pill"><b>X</b> read</span>
      <span className="padlegend-pill"><b>Start</b> map</span>
      <span className="padlegend-pill"><b>D-pad</b> move</span>
    </div>
  );
}
