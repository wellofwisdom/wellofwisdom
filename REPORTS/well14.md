# Well 14 report — language voice polish

Date: 2026-09-24
Branch: well14/language-v1-french-server

## Branch and folder

- Folder: C:\Users\kevin\ZCodeProject\wellofwisdom-well14 (ends in well14, correct well)
- Branch: well14/language-v1-french-server (already checked out, fresh from origin/main + 4 well14 commits)
- First run: git fetch origin, npm install, npm --prefix web install all done

## Scope

Owns only: server/migrations/051*, server/lib/items/kinds/vocab_card.js, listen_choice.js, listen_repeat.js, server/lib/coursecheck.js language part. French/Spanish tidy is example-course validation, not code churn.

## What this polish does

- Migration 051_language_voice.sql claims 051 (next after Well 8's 052 reservation). No new columns: voice kinds reuse exercise review lane, TTS fallback is browser-side from audioText, imagePrompt capping is in the normalizer. Placeholder select 1 so other wells never collide on the number.
- TranslateForm direction guard and select now include en_to_fr and fr_to_en. The server already accepted them since c624cf7; the editor was still rejecting them. Now creating a French translation item in Studio no longer fails with direction_invalid.
- Voice kinds remain polished as before: vocab_card imagePrompt capped at 500 in normalize and reported as imagePrompt_too_long in problem; alternatives deduped and lowered; audioText kept through strip for browser TTS fallback; listen_choice and listen_repeat both degrade to audioText when no /media/ audioUrl exists; strip never leaks keys (gloss, expected, answer, alternatives).

## What did not need changing

- server/lib/items/kinds/vocab_card.js, listen_choice.js, listen_repeat.js: already handle TTS audioText fallback (strip keeps audioText, player falls back to browser speech), imagePrompt capping at MAX_IMAGE_PROMPT=500, per-card vs per-exercise review split (vocab_card is an exercise kind on review_schedule, flashcards deck is on flashcard_reviews), and KIE voice wiring (audioText is always available client-side; KIE jobs queued only when a media generation is requested, see server/lib/media.js generateSpeech and server/lib/jobs.js voice handler).
- docs/examples/spanish-a1 and french-a1 tidy: both already pass with missingAnswers 0 and coursecheck ok true, no warnings, no errors. No edits needed to keep them tidy.

## How it was tested

Five gates before push, all green:

- npm run check (which runs node --test internally via scripts/check.js): 742 tests passed, 0 failed
- npm test (node --test): 757 tests passed, 0 failed (lang, translate fr, vocab/dialogue, gating, no-leak, coursecheck all included)
- npm --prefix web run lint: 0 errors, 2 warnings (pre-existing AiVault and ProjectItem exhaustive-deps, not ours)
- npm --prefix web test: 175 tests passed
- npm --prefix web run build: built in about 6s

Also ran focused checks: coursegen.missingAnswers is 0 for both example packs, checkPackage ok true, normalize caps imagePrompt to 500, strip preserves audioText for TTS and drops all keys.

## Docs read

- docs/COURSE-BUILDER-V2.md section 5 (item contracts: existing exercise kinds gain hint ladders, figure/steps/predict/flashcards/audio and the gradable kinds)
- docs/OPERATIONS.md (deploy verify ritual, scratch DB gotchas, pglite, instance admin)
- docs/LANGUAGE-V1-PREP.md (spanish-a1 example pack and the planned vocab_card/listen_choice/listen_repeat shapes)

Did not open HANDOFF.md, any .env, wow-secrets files, .zcode, or C:\Treman\.

## Files changed this push

- server/migrations/051_language_voice.sql (new, claims 051)
- web/src/components/course-editor/kinds/TranslateForm.tsx (French directions)

## What is left out

- No new editor forms for vocab_card or listen kinds. Edits still go through JSON or existing generic paths. Dedicated forms can be added once the item shapes are declared stable.
- No change to KIE TTS model selection. Voice selection stays with whatever the media vault resolves.
