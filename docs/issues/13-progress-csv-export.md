# Export the progress table as CSV

Labels: `good first issue`, `UI`, `server`
Size: medium, a weekend
Files: `server/routes/progress.js`, `web/src/pages/Progress.tsx`

## What

A guide can hand an attendance record to an office as a CSV, but the progress
view has no export. Add one, so a parent or a co-op guide can keep a copy of
where each learner stands.

## Steps

1. Read the attendance export first, and copy its shape:
   `server/routes/attendance.js:159` builds the file, sets
   `text/csv; charset=utf-8` and a `Content-Disposition` filename.
2. Add `GET /api/progress/export.csv` to `server/routes/progress.js`. Same
   scoping as the JSON list: the family, and an assistant's own learners only.
3. Columns: learner, grade level, lessons done, attempts, accuracy, active days,
   reviews due, badges. One row per learner, plus a header row.
4. Escape any value that contains a comma or a quote. The attendance CSV helper
   already shows the rule; reuse it if it is exported, otherwise write the two
   lines.
5. Add a button on `web/src/pages/Progress.tsx` next to whatever already
   refreshes or filters, linking to the route. Downloads must not need a second
   request.

## Done when

- [ ] The file opens in a spreadsheet with the right columns and no broken rows.
- [ ] A learner name containing a comma cannot break the file.
- [ ] An assistant's export lists only their learners.
- [ ] `npm test` and `npm run check` pass, and `npm --prefix web run build` is green.

## Hints

- Numbers that are not there yet should be `0`, not blank, so a sum column works.
- Do not put anything in the CSV that the JSON route would not show the caller.
