---
name: Good first issues already filed
about: Do not use this to file a new good first issue without reading the list below
title: ""
labels: ""
assignees: ""
---

This file is not an issue template. It is a hidden checklist for maintainers to track the dozen `good first issue` tickets that make a repo feel alive at launch.

File real issues with the `good first issue` label for each row below. One row per issue, one PR per issue.

- [ ] Studio proof tile records a real 8 second GIF of Course Studio generating and replaces the static mock card copy. (needs a human screen recording; everything else below is shipped)
- [x] Learner app shows a gentle empty state when a course has zero public lessons, with a link back to the gallery. (shipped `c621f35` / `CourseView.tsx` lessonsTotal === 0)
- [x] Copy source links button adds a toast checkmark for 2 seconds after copy so the press feels real. (shipped `c621f35` / `PublicCourse.tsx` copied state)
- [x] Demo banner secondary action links to `#pricing` instead of only Save, so window shoppers find self-host without scrolling. (shipped `DemoBanner.tsx` See pricing)
- [x] OG `og.svg` gets a PNG twin at 1200 by 630 for crawlers that do not rasterise SVG in the unfurl. (shipped `3346255` / `web/public/og.png` + `web/index.html`)
- [x] `llms.txt` gains one more line pointing to `docs/ROADMAP.md` for agents that want the product story, not only the courses. (shipped `server/lib/seo.js` llmsTxt)
- [x] `server/lib/google.js` adds one more unit test for a token with an array `aud` and an `azp` that matches. (shipped `google.test.js` array aud)
- [x] `web/src/components/DemoBanner.tsx` restores Google upgrade via `POST /api/demo/upgrade` with a real credential instead of the placeholder. (shipped `3346255` / `DemoBanner.tsx` googleCredential)
- [x] `README.md` Quick start adds the `ghcr.io/wellofwisdom/wellofwisdom:latest` pull line once publish lands, guarded on `v0.1.0` existing. (shipped `README.md` line 100)
- [x] `CONTRIBUTING.md` adds the `npm run check && npm test && npm --prefix web run build` ritual before push, mirroring the PR template. (shipped `CONTRIBUTING.md`)
- [x] A new `docs/examples` course: a second science lens course a small farm or river ecology co-op would actually run. (shipped `river-ecology-field-study.wow-course.json`)
- [x] A11y: auth tabpanel gets `aria-labelledby` plus focus moves to the first input when switching tabs. (shipped `Landing.tsx` tabpanel + `PillTabs` tabPanelId)

When all twelve are filed and labelled, flip `docs/ROADMAP.md` Launch readiness from `[ ]` to `[x]` for good first issues. Only the GIF needs a human; the other eleven are built and the checkboxes above are ticked. To close it, record an 8 second capture of the Studio's 4-step flow and swap the `.mheroCard` mock.
