# Well 14 report — language voice polish

Date: 2026-09-24
Branch: well14/language-voice (fresh from dac4dd2 / origin/main)

## Branch and folder

- Folder: C:\Users\kevin\ZCodeProject\wellofwisdom-well14 (ends in well14, correct well)
- Branch: well14/language-voice (fresh from dac4dd2, tracks origin/main)
- First run: git fetch origin, npm install, npm --prefix web install done (root up to date, web up to date)

## Scope

Owns only: server/migrations/051*, server/lib/items/kinds/vocab_card.js, listen_choice.js, listen_repeat.js, server/lib/coursecheck.js language part. Spanish-a1 and French-a1 tidy is example-course validation, not code churn.

## What this push does

- Migration 051_language_voice.sql claims 051 (next after Well 8's 052 reservation). No new columns needed: voice kinds reuse the existing exercise review lane, TTS fallback is browser-side from audioText, imagePrompt capping lives in the normalizer. Placeholder select 1 so no other well collides on the number.
- Voice kinds already polished on dac4dd2 and left intact:
  - vocab_card: imagePrompt capped at 500 in normalize and reported as imagePrompt_too_long in problem, alternatives deduped/lowered/capped at 10, audioText kept through strip for browser TTS fallback, strip never leaks gloss/alternatives, grade exact after normalizeAnswer.
  - listen_choice: audioText or audioUrl required, audioUrl validated as local /media/ only, choices capped at 6, answer mapped via id or cN fallback, strip keeps audioText but drops answer, grade checks choice id set.
  - listen_repeat: expected required, audioUrl validated if present, alternatives capped at 10, hints capped at 3, strip keeps audioText/audioUrl but drops expected/alternatives, grade tokenizes with accent folding and scores longest prefix match with alternatives considered.
  - coursecheck: walks with coursegen.normalizeCourse and itemProblem, so voice kinds are validated the same way as every other exercise kind. No extra language branch needed.
- Kie voice wiring already in place: server/lib/media.js canVoice/canImage/canVideo from kieKey, server/lib/jobs.js voice handler queued via media pipeline; audioText is always available client-side for TTS fallback when kie is not configured.

## Example courses

- docs/examples/spanish-a1/course.wow-course.json and docs/examples/french-a1/course.wow-course.json both: checkPackage ok true, 0 errors, 0 warnings, missingAnswers 0. No edits needed to keep them tidy.

## How it was tested

Five gates before push, all green:

- npm run check (scripts/check.js, node --test): 757 tests passed, 0 failed
- npm test (node --test): 772 tests passed, 0 failed
- npm --prefix web run lint: 0 errors, 2 warnings (pre-existing AiVault and ProjectItem exhaustive-deps, not ours)
- npm --prefix web test (vitest): 186 tests passed
- npm --prefix web run build: built in about 8.5s

Also ran focused checks: coursecheck ok true for both packs, normalize caps imagePrompt to 500, strip keeps audioText for TTS and drops keys.

## Docs read

- docs/COURSE-BUILDER-V2.md section 5 (item contracts)
- docs/OPERATIONS.md (deploy verify ritual, scratch DB, pglite)
- docs/LANGUAGE-V1-PREP.md (planned vocab_card / listen_choice / listen_repeat shapes)

Did not open HANDOFF.md, any .env, wow-secrets files, .zcode, or C:\Treman\.

## Files changed this push

- server/migrations/051_language_voice.sql (new, claims 051)
- REPORTS/well14.md (new, this report)

No edits to scoped voice kind files this push: they were already polished on main at dac4dd2 and remain correct.
