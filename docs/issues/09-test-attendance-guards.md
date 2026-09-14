# Test the attendance guards

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/routes/attendance.test.js` (new)

## What

Attendance records what a family files with an authority, so the guards on it
matter more than most. There is no test file for the route. Add one in the style
the repo already uses for routes that need no database: read the route source and
assert the rule is there.

## Steps

1. Read the neighbouring route tests for the house style:
   `server/routes/waitlist.test.js` and `server/routes/community.test.js` both
   check the source rather than booting the app. Copy that approach.
2. Read `server/routes/attendance.js` and write a test for each rule:
   - the router is behind `auth.parentOnly`
   - every write route also asks for `record_attendance`
   - the requirement route asks for `set_compliance`
   - the day routes validate the date rather than trusting it
   - every query is scoped to the family, and a scoped assistant is checked
3. Assert on the real source text, with a message that says what rule broke.

## Done when

- [ ] `npm test` is green.
- [ ] Each test fails if you delete the guard it covers. Prove it by deleting
      one line locally, watching the test fail, and putting it back.
- [ ] The test file needs no database and no network.
- [ ] `npm run check` passes.

## Hints

- These source-reading tests are a backstop, not a substitute for an integration
  test. Say so in a comment at the top so nobody mistakes the coverage.
