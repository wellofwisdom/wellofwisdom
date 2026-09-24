# Well 8 report — standards and language tagging (CEFR)

Date: 2026-09-24
Branch: well8/standards-language (fresh from dac4dd2 / origin/main)

## Branch and folder

- Folder: C:\Users\kevin\ZCodeProject\wellofwisdom-well8 (ends in well8, correct well)
- Branch: well8/standards-language (fresh from origin/main at dac4dd2)
- First run: git fetch origin, npm install, npm --prefix web install done (root up to date, web up to date)

## Scope

Owns only: server/migrations/052*, server/lib/standards.js, server/lib/standards.test.js, web/src/components/StandardsTags.tsx

No other files touched. Migration number is 052 which belongs to Well 8. 051 belongs to Well 14 and was not touched.

## What this push does

Tag language courses with CEFR and target_language so portfolio and reports can group by them, and add A1 descriptors.

- server/migrations/052_standards_language.sql — claims 052 for courses and lessons. Adds target_language and cefr (plus cefr_level alias) to courses, and target_language and cefr to lessons. Pure add column, idempotent with if not exists, no data loss on downgrade.
- server/lib/standards.js — language course CEFR and target_language tagging for portfolio and reports grouping:
  - CEFR levels A1 to C2 with full descriptors (A1 has the required familiar everyday phrasing).
  - normalizeCefr: case insensitive, trims, caps to valid levels A1..C2.
  - normalizeLanguage: BCP 47 style (2 to 3 letters, optional region like es, fr, en-US), lowercased.
  - frameworkOf and labelFor: CEFR codes route through CEFR (bare levels and CEFR prefix both work), labelFor carries the descriptor.
  - normalizeCode: handles CEFR bare level and CEFR-prefixed codes.
  - groupByLanguage and groupByCefr: sort in CEFR order (A1 before A2 before B1 ...), with unlevelled last.
- server/lib/standards.test.js — coverage for normalizeCefr, normalizeLanguage, descriptors, labelFor, groupByLanguage, groupByCefr, frameworkOf, normalizeCode.
- web/src/components/StandardsTags.tsx — mirror helpers so the course editor and portfolio view share one model: same CEFR order and descriptors, same frameworkOf/labelFor/normalizeCefr, plus groupByLanguage and groupByCefr that understand target_language/targetLanguage/language and cefr/cefr_level/cefrLevel.

## How it was tested

Five gates before push, all green:

- npm run check (scripts/check.js plus node --test): 765 tests passed, 0 failed.
- npm test (node --test): 780 tests passed across 18 suites, 0 failed.
- npm --prefix web run lint: 0 errors, 2 warnings (pre-existing AiVault useEffect and ProjectItem exhaustive-deps, not ours).
- npm --prefix web test (vitest): 186 tests passed across 21 files.
- npm --prefix web run build: built clean in about 7.6s (tsc --noEmit plus Vite build).

## Docs read

- docs/OPERATIONS.md (deploy verify ritual, scratch DB, backups).

Did not open HANDOFF.md, any .env, wow-secrets.txt, wow-deploy-env.txt, .git-credentials, the .zcode folder, or anything in C:\Treman\.

## Files changed this push

- server/migrations/052_standards_language.sql (new, claims 052)
- server/lib/standards.js (CEFR and language helpers)
- server/lib/standards.test.js (tests for CEFR and language)
- web/src/components/StandardsTags.tsx (mirror helpers for editor and portfolio)
- REPORTS/well8.md (new, this report)
