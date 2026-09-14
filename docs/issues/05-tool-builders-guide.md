# Write a guide for people building tools on the public API

Labels: `good first issue`, `docs`
Size: small, one evening
Files: `docs/TOOL-BUILDERS.md` (new), one link in `docs/API.md`

## What

The public surface already exists for machines: the published course list, the
plain-text course view, `llms.txt` and a sitemap. None of it is written up for
someone who wants to build on it. Write that page.

## Steps

1. Read `server/routes/public.js`, `server/lib/seo.js` and the "Routes outside
   `/api`" part of `docs/API.md`.
2. Write a short walkthrough with real commands a reader can paste, in this
   order:
   - list published courses (`GET /api/public/courses`)
   - fetch one course as JSON, and note that answer keys are stripped
   - fetch the same course as plain text (`GET /c/<slug>.txt`)
   - download the portable package (`GET /api/public/courses/<slug>/export`)
3. State the rate limit plainly (120 requests per minute per IP) and the cache
   headers, so a crawler behaves.
4. Say what a tool may not do: everything under `/api` beyond `/api/public`
   needs a session, and there is no API key scheme.
5. Link the page from `docs/API.md`.

## Done when

- [ ] Every command in the page was run against a real instance and the output
      pasted in. Do not write a command you have not run.
- [ ] The page names the two ways a course is exposed (JSON and text) and why
      text matters for research tools.
- [ ] No secrets, and no example that implies a key is needed.
- [ ] `npm run check` passes.

## Hints

- `npx serve` plus `npm run dev` is enough to have something to test against.
  The demo family gives you published courses to point at.
