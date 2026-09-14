# Test that progress is scoped to the family and to an assistant's learners

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/routes/progress.test.js` (new), `server/routes/progress.js` (read only)

## What

`GET /api/progress` lists every learner in a family with their numbers. A tutor
account must see only the learners assigned to them, and nobody must ever see
another family's rows. There is no test file for the route.

## Steps

1. Read `server/routes/progress.js`. Note the two places scope is applied: the
   family id in the query, and `perm.visibleLearnerIds` for an assistant.
2. Write the test in the style the repo uses for routes that need no database:
   read the source and assert the rule is present, as
   `server/routes/waitlist.test.js` and `server/routes/community.test.js` do.
3. Cover:
   - the router is behind `auth.parentOnly`
   - the learners query filters on the family
   - an assistant's visible list is applied
   - the misconceptions route checks the learner is one the caller may see
4. Add a test for `perm.visibleLearnerIds` itself if the existing
   `server/lib/perm.test.js` does not already cover the case you care about.

## Done when

- [ ] `npm test` is green.
- [ ] Deleting the scoping line locally makes a test fail. Prove it, then put
      the line back.
- [ ] No database and no network are needed.
- [ ] `npm run check` passes.
