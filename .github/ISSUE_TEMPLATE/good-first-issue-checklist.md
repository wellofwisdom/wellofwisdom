---
name: Good first issues already filed
about: Do not use this to file a new good first issue without reading the list below
title: ""
labels: ""
assignees: ""
---

This file is not an issue template. It is a hidden checklist for maintainers to track the dozen `good first issue` tickets that make a repo feel alive at launch.

File real issues with the `good first issue` label for each row below. One row per issue, one PR per issue.

- [ ] Studio proof tile records a real 8 second GIF of Course Studio generating and replaces the static mock card copy.
- [ ] Learner app shows a gentle empty state when a course has zero public lessons, with a link back to the gallery.
- [ ] Copy source links button adds a toast checkmark for 2 seconds after copy so the press feels real.
- [ ] Demo banner secondary action links to `#pricing` instead of only Save, so window shoppers find self-host without scrolling.
- [ ] OG `og.svg` gets a PNG twin at 1200 by 630 for crawlers that do not rasterise SVG in the unfurl.
- [ ] `llms.txt` gains one more line pointing to `docs/ROADMAP.md` for agents that want the product story, not only the courses.
- [ ] `server/lib/google.js` adds one more unit test for a token with an array `aud` and an `azp` that matches.
- [ ] `web/src/components/DemoBanner.tsx` restores Google upgrade via `POST /api/demo/upgrade` with a real credential instead of the placeholder.
- [ ] `README.md` Quick start adds the `ghcr.io/wellofwisdom/wellofwisdom:latest` pull line once publish lands, guarded on `v0.1.0` existing.
- [ ] `CONTRIBUTING.md` adds the `npm run check && npm test && npm --prefix web run build` ritual before push, mirroring the PR template.
- [ ] A new `docs/examples` course: a second science lens course a small farm or river ecology co-op would actually run.
- [ ] A11y: auth tabpanel gets `aria-labelledby` plus focus moves to the first input when switching tabs.

When all twelve are filed and labelled, flip `docs/ROADMAP.md` Launch readiness from `[ ]` to `[x]` for good first issues.

