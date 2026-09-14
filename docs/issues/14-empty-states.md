# Give the empty pages a next step, not just a blank

Labels: `good first issue`, `UI`
Size: small, one evening
Files: `web/src/pages/Progress.tsx`, `web/src/pages/Library.tsx`,
`web/src/pages/Work.tsx`, `web/src/pages/Portfolio.tsx`

## What

Several pages say nothing when there is nothing to show. A new family lands on a
blank area with no hint about what to do first, which is the moment a trial ends.
Each empty state should say what this page will hold and offer one action.

## Steps

1. Visit each page with a family that has no learners and no work, and note what
   shows today.
2. For each, write a short empty state: one sentence naming what will appear
   here, and one button that starts it. Examples: "No learners yet. Add your
   first learner and their courses will show up here." with an Add learner
   button. "Nothing handed in. Work appears here when a learner submits a
   project."
3. Keep it to one sentence and one button. No illustration, no paragraphs.
4. Keep the wording honest: do not promise a feature that does not exist.

## Done when

- [ ] Each of the four pages has a real empty state.
- [ ] The button goes to the page that does the thing.
- [ ] The copy is one sentence, in the same voice as the rest of the app.
- [ ] `npm --prefix web run build` and `npm run check` pass.

## Hints

- `web/src/pages/Work.tsx` already has a good line of copy on the draft panel.
  Match that tone rather than inventing a new one.
- Check the empty state at the smallest supported window width.
