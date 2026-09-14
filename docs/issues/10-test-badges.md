# Test that badges are earned once, and that the criteria are honest

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/lib/badges.test.js` (new), `server/lib/badges.js` (read only)

## What

`server/lib/badges.js` decides what a learner has earned. It exports `BADGES`,
`badgeById`, `computeStreak`, `checkAndAward` and `forLearner`. Nothing tests it,
and a bug here is visible to a child: a badge that arrives twice, or one that
never arrives after the work was done.

## Steps

1. Read `server/lib/badges.js` and list every badge with its rule.
2. Write tests for the parts that are pure functions:
   - `computeStreak` with a run of days, a gap, and a single day
   - `badgeById` for a known id and an unknown one
   - a badge is awarded once and never twice for the same learner
   - a badge that depends on a count is not awarded one short of it
3. Where a test needs the database, stub it with fixed rows. Keep `badges.js`
   unchanged.

## Done when

- [ ] `npm test` is green.
- [ ] Every exported function is exercised at least once.
- [ ] The boundary is tested: exactly at the threshold, and one below it.
- [ ] `npm run check` passes.

## Hints

- A badge list is the kind of thing that grows. Assert on the shape and the
  rule, not on a hard-coded count, so adding a badge does not break the test.
