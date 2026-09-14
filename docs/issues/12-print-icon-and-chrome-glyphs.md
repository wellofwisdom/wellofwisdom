# Use a drawn icon instead of emoji for chrome buttons

Labels: `good first issue`, `UI`
Size: small, one evening
Files: `web/src/components/Icons.tsx`, `web/src/pages/learn/LessonPlayer.tsx`,
`web/src/pages/learn/LearnerShell.tsx`

## What

Emoji as UI icons render differently on every OS and are unreadable on some
Linux fonts. `web/src/components/Icons.tsx` already holds proper SVG icons. The
chrome still uses emoji in a few places, and the worst is the print button in
the lesson header.

## Where

- `web/src/pages/learn/LessonPlayer.tsx:99` uses a printer emoji as the print
  button.
- `web/src/pages/learn/LearnerShell.tsx` uses emoji for the sound toggle, the
  map, home and practice buttons (lines 125, 135, 152, 155).

Keep emoji where they are content: the acorn, the streak flame, the backpack and
the celebration on the completion screen are part of the game's voice and should
stay.

## Steps

1. Add the icons you need to `Icons.tsx`, following the existing pattern: a
   `(p: SVGProps<SVGSVGElement>) =>` component with `stroke="currentColor"` and
   no hard-coded colour or size.
2. Replace the chrome emoji with the icon, keeping the button's `aria-label` and
   its `title`.
3. Check the buttons still line up at both learner text sizes.

## Done when

- [ ] No emoji is left on a button that is chrome.
- [ ] Every changed button still has an accessible name.
- [ ] The build passes: `npm --prefix web run build`.
- [ ] `npm run check` passes.

## Hints

- Two branches are open on `LessonPlayer.tsx` and `LearnerShell.tsx` (speech
  input, controller mode). Say so on the issue and rebase before you start.
- A 16 by 16 icon with `stroke-width="1.8"` matches the set already in the file.
