// SPDX-License-Identifier: AGPL-3.0-or-later
// PadLegend: button legend in the HUD when a pad is connected.
export default function PadLegend() {
  return (
    <div className="padlegend" role="note" aria-label="Controller legend">
      <span className="padlegend-pill"><b>A</b> activate</span>
      <span className="padlegend-pill"><b>B</b> back</span>
      <span className="padlegend-pill"><b>X</b> read aloud</span>
      <span className="padlegend-pill"><b>Y</b> hint</span>
      <span className="padlegend-pill"><b>RT</b> narrator</span>
      <span className="padlegend-pill"><b>Start</b> map</span>
      <span className="padlegend-pill"><b>D-pad</b> move</span>
      <span className="padlegend-pill"><b>Stick</b> move</span>
    </div>
  );
}
