# Well 20: site polish

## What was done

- **Spoken in the product story**: Added `Speak your answer` to the lessons pillar in `server/lib/site.json` (push to talk on any answer with transcript shown before grading, number words to digits and fractions, letter names to choice ids). It was on the roadmap only and not named as a shipped lesson feature.
- **Features page stays green**: Updated the `features` page description to name spoken answers alongside vocabulary, listening, translation, dialogue and graded readers. Title and description lengths still within search limits.
- **Landing Drink bullet**: Added push to talk with transcript to the lesson features listed on the home page.
- **Docs**: Extended `docs/TRANSLATING.md` Language lesson kinds with spoken, and noted it works on any answer kind and falls back to the browser when no speech endpoint is configured.
- **Pricing and SEO already correct**: The `#pricing` anchor lives in `web/src/pages/Landing.tsx` with `scrollMarginTop`, `hashchange` listening and smooth scroll from header, footer and DemoBanner. Public page heads, sitemap, robots and llms are driven from `server/lib/site.json` and already include every language kind and spoken in `llms.txt`. No changes needed there.

## What was not touched

- No registry or `web/src/pages/learn` edits. No migrations.

## Verification

- `npm run check`: 772 tests pass, no em dashes.
- `npm --prefix web run lint`: 0 errors, 2 warnings on unrelated files.
- `npm --prefix web run build`: built.
- `npm --prefix web test`: 186 pass.
- `npm test`: 772 pass.
