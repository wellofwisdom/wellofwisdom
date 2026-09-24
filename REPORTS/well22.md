# Well 22 - well22/client-kinds

## Scope
Owns only HotspotItem.tsx, PlotItem.tsx, ScenarioItem.tsx and their tests.
Branch fresh from dac4dd2: `well22/client-kinds`. No migration.

## What changed
- Wired the optional `onWrong?: (feedback: string, name?: string) => void` prop
  on all three items so Well 3's LessonPlayer engagement patch (progress,
  combo, companion on wrong, warm-up, mastery) can surface wrong-answer
  feedback via the companion bubble. Same shape as the other kinds:
  on wrong answer take `reveal.feedback` first (first value when it is a
  map) then `reveal.explanation`, trim to 500 chars, ignore blanks. This
  was previously only a stub (`onWrong: _onWrong` never called).
- Widened `AttemptResponse.reveal` to carry `feedback?: Record<string,string> | null`
  so the shape matches the server's reveal for these kinds.
- Small accessible and keyboard pass (no prose wall):
  - Hotspot: region buttons now select on Space/Enter in addition to click,
    while keeping ArrowLeft/Right/Up/Down plus Home/End roving focus.
  - Plot: grid accepts Space as an alias for Enter to place a point;
    Home/End jump the cursor to xmin/xmax on the current row.
  - Scenario: choice buttons inside the group now rove with ArrowUp/Down
    and jump to first/last with Home/End.

## Five gates
- `npm run check` - 150 server files OK, no em dashes
- `npm test` (node --test) - 757 pass; with pglite stubbed harness, 772 pass, 0 fail
- `npm --prefix web run build` (tsc --noEmit + vite build) - pass
- `npm --prefix web run lint` - 0 errors, 2 warnings (pre-existing AoVault/ProjectItem deps)
- `npm --prefix web test` (vitest run) - 186 pass, 21 suites

## Keeping main building
LessonPlayer already imports and wires HotspotItem/PlotItem/ScenarioItem
with `onWrong={onWrongWithFeedback}` on `well22/client-kinds` and on
`origin/main`; this change only makes those props live, so a combined
tree with Well 3's engagement still builds.

## Notes
- No migration. Keep the change small; tests co-owned with the scope
  remain the boundary for future tweaks.
