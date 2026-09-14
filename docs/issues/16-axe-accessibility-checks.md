# Run an accessibility check on every page in the test suite

Labels: `good first issue`, `tests`, `accessibility`
Size: medium, a weekend
Files: `web/src/**/*.test.tsx`, `web/package.json`

## What

The stylesheet guarantees contrast (there is a test for that), and the app has
been through one manual audit. What is missing is an automated check that every
page still has one main heading, labelled controls and no duplicate ids. Add
`axe-core` to the page render tests so a regression is caught in CI.

## Steps

1. Check whether `web/src/**/*.test.tsx` exists yet. If the frontend test setup
   is not merged, wait for it or add a single test file for one page first, and
   say on this issue what you did.
2. Add `vitest-axe` or `axe-core` as a dev dependency in `web/package.json`.
   Prefer the smaller option and say why in the pull request.
3. Write one helper that renders a page and runs axe over the result, then call
   it from each page's test.
4. Turn the serious rules into failures. For anything that fires today, either
   fix it (a missing label is usually one line) or list it in the pull request
   with a note about why it is deferred.

## Done when

- [ ] `npm --prefix web test` runs the checks and is green.
- [ ] Every page under `web/src/pages` and `web/src/pages/learn` is covered.
- [ ] Any rule left disabled is named in the test file with a reason.
- [ ] `npm --prefix web run build` and `npm run check` pass.

## Hints

- Start with the pages a learner sees. The world map and the lesson player are
  the ones with custom controls, so they are where a real finding hides.
- Do not assert on colour. `server/lib/contrast.js` owns that, and there is a
  test for it already.
