# Print a lesson plan, not just the worksheet

Labels: `good first issue`, `UI`, `server`
Size: medium, a weekend
Files: `web/src/pages/PrintLessonPlan.tsx` (new), `web/src/App.tsx`,
`web/src/pages/learn/LessonPlayer.tsx`, `server/routes/learn.js`

## What

A lesson prints as a worksheet for the learner. A teacher or a co-op guide also
wants the plan for themselves: what this lesson is for, what it needs, and how
long it should take. Add a printable lesson plan beside the existing worksheet
print.

## Steps

1. Read `web/src/pages/PrintLesson.tsx` and the two print routes in
   `web/src/App.tsx` (search for `print/lesson/`). Copy that pattern exactly,
   including how the role decides which API is called.
2. Add a route for a lesson plan, for example `print/lesson-plan/:id`.
3. On the plan, print: the lesson title and course, the lesson summary, the
   items in order with their type, and a line for materials and one for timing.
   Where the AI has not written a plan, leave a ruled line rather than inventing
   content.
4. Add one print button in the lesson header that opens it. It sits beside the
   existing worksheet print.

## Done when

- [ ] The page prints on one or two sheets with no browser chrome and no
      navigation.
- [ ] Every field printed comes from the data or is an empty ruled line.
- [ ] A lesson with no summary does not print an empty heading.
- [ ] `npm --prefix web run build` and `npm run check` pass.

## Hints

- `web/src/pages/learn/LessonPlayer.tsx` is being changed on the speech input
  branch. Say so on the issue and rebase before you start.
- Lesson materials are not stored today, so the ruled line is the honest answer.
  Do not add a database column for this.
