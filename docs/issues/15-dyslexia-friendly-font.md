# Make the reading font actually available

Labels: `good first issue`, `UI`, `accessibility`
Size: small, one evening
Files: `web/src/styles.css`, `web/public/fonts/` (new)

## What

The reading comfort setting (`web/src/styles.css`, around line 1478) sets
`--reading-font` to `"OpenDyslexic", "Comic Sans MS", "Trebuchet MS", Verdana`.
OpenDyslexic is named first but the font is not shipped, so it only works for a
reader who happens to have it installed. Everyone else silently falls through,
which makes the setting look broken.

## Steps

1. Pick the fix and say which you chose in the pull request:
   - ship a dyslexia-friendly face as a self-hosted webfont under
     `web/public/fonts/`, with an `@font-face` rule, or
   - if the licence does not allow shipping it, rename the setting and the CSS
     variable so it says what the reader will actually get, and document the
     install step in the same comment.
2. Check the licence of whatever font you ship. It has to allow redistribution
   in an AGPL project, and the licence text goes in `docs/` or next to the font.
3. Make sure the font loads only when the setting is on, so a reader who never
   turns it on downloads nothing.
4. Test at the largest text size with a long article.

## Done when

- [ ] Turning the setting on changes the text on a machine that has no special
      fonts installed.
- [ ] The font file is under 200 kB, or it is `woff2` compressed.
- [ ] No layout breakage: the lesson body, the worksheets and the print view all
      still fit.
- [ ] `npm --prefix web run build` and `npm run check` pass.

## Hints

- A dyslexia-friendly face is wider than the default. Check the print view
  separately, because that is where a wider face pushes a page over.
- Do not load the font for the whole app. A `@font-face` with
  `font-display: swap` plus a rule scoped to the reading setting keeps the
  logged-out landing page light.
