# Test the sitemap and the course head tags

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/lib/seo.test.js` (new), `server/lib/seo.js` (read only),
`server/lib/share.test.js` (move the SEO cases out)

## What

`server/lib/seo.js` builds the head tags for a shared course, the sitemap and
`llms.txt`. It has no test file of its own: a few of its cases live inside
`server/lib/share.test.js`, which is about the course package. Move those cases
into a file named after the module and extend them.

## Steps

1. Find the SEO cases in `server/lib/share.test.js` (search for `seo:`).
2. Move them into `server/lib/seo.test.js`, keeping the wording of each test
   name if it still describes what happens.
3. Add what is missing:
   - the sitemap with many published courses, and with none at all
   - a course title that contains markup stays escaped in the head
   - `llms.txt` names the origin it was asked on
   - `robotsTxt` keeps the app private and lets shared courses be crawled
4. Leave `share.test.js` covering only the package and the export.

## Done when

- [ ] `npm test` is green, and the total number of tests has not gone down.
- [ ] `seo.js` exports are all exercised: `esc`, `origin`, `publishedMeta`,
      `courseHead`, `injectHead`, `robotsTxt`, `sitemapXml`, `llmsTxt`.
- [ ] No database is needed. Where the code reads one, stub it.
- [ ] `npm run check` passes.

## Hints

- `publishedMeta` and `sitemapXml` read the database. A tiny fake that returns
  fixed rows is enough and keeps the test offline.
