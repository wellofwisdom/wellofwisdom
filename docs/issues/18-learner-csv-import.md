# Add thirty learners at once from a CSV

Labels: `good first issue`, `UI`, `server`
Size: medium, a weekend
Files: `server/routes/family.js`, `web/src/pages/Learners.tsx`

## What

A classroom teacher or a co-op starts with a list of names. Today each learner is
added one at a time through the form. Add a bulk import: paste or upload a CSV,
see what will be created, and confirm.

## Steps

1. Read `POST /api/family/learners` in `server/routes/family.js`. It already
   validates the username, the PIN and the duplicate name. Reuse those rules
   rather than writing new ones.
2. Add a preview endpoint that parses the CSV and answers with the rows it would
   create and the rows it would refuse, each with the reason. Create nothing in
   this step.
3. Add the import endpoint. Columns: name, username, pin, grade level. Anything
   else is ignored. Refuse the whole file if a row is bad, and say which row.
4. On `web/src/pages/Learners.tsx`, add an Import button that opens a small
   panel, shows the preview table, and has a confirm button. Keep the panel to
   one screen.
5. If a progress CSV export exists by the time you start, keep the column names
   the same so a guide can round-trip a roster. If it does not, note that on the
   issue rather than inventing a format.

## Done when

- [ ] A file of 30 learners imports in one action.
- [ ] A file with one bad row creates nothing and names the row and the reason.
- [ ] A duplicate username is refused before anything is written.
- [ ] The PIN is never echoed back in the response or the preview.
- [ ] `npm test` and `npm run check` pass, and the web build is green.

## Hints

- A pasted spreadsheet is often tab separated, not comma separated. Sniff the
  delimiter and say which one you used.
- Keep the preview honest: it must show exactly what the import will do, using
  the same code path wherever you can.
