# Test the job queue

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/lib/jobs.test.js` (new), `server/lib/jobs.js` (read only)

## What

`server/lib/jobs.js` runs every long task in the app: course generation, plan
outlines, media, captions, world art. It has no test file. The things worth
proving are the ones that break silently in production: a job is claimed once,
a failure is recorded rather than swallowed, and the queue does not hand the
same row to two workers.

## Steps

1. Read `server/lib/jobs.js` and note what it exports: `enqueue`, `get`,
   `startJobs`, `stopJobs`.
2. Read an existing test for the house style, for example
   `server/lib/review.test.js`. Plain Node, CommonJS, `node --test`, no new
   dependency.
3. Write tests for the parts that hold still: the row shape a job returns, the
   status vocabulary, and the retry or give-up rule if the file states one.
4. Where a test would need a database, either stub the module with a small fake
   or leave it out and say so in a comment. Do not change `jobs.js` to make it
   testable unless the change is under ten lines.

## Done when

- [ ] `npm test` is green with the new file.
- [ ] The file names what it does not cover, in a comment at the top.
- [ ] No database, no network and no AI key are needed to run it.
- [ ] `npm run check` passes.

## Hints

- `node --test server/lib/jobs.test.js` runs one file while you work.
- If the queue turns out to be untestable without a database, that is a finding
  worth writing down on this issue rather than forcing a test that proves little.
