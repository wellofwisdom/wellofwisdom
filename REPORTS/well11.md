# Well 11 report: speech STT and spoken kind (well11/speech-stt)

## Branch
`well11/speech-stt` from `dac4dd2`

## Scope
Owns only `server/routes/stt.js`, `server/lib/speech.js`, `server/lib/items/kinds/spoken.js`, `web/src/pages/learn/items/SpokenItem.tsx` plus ListenRepeatItem STT wiring. No migration.

## What was there at start
`server/routes/stt.js`, `server/lib/speech.js`, `server/lib/providers/stt-openai.js`, `web/src/components/PushToTalk.tsx` already existed on `origin/main` (the shared STT layer landed elsewhere and was merged to main before this well). They were not part of this branch diff. This well added only the missing pieces on top of that layer.

## What shipped on this branch (commit f9b7603)
* `server/lib/items/kinds/spoken.js` (132 lines): new gradable kind `spoken`. Content `{ prompt, expected?, rubric?, alternatives?, hints, explanation, kind: "spoken" }`. One of `expected` or `rubric` is required. Grading is exact match (case and accent insensitive, via `normalizeAnswerKey`) against `expected` or any entry in `alternatives`, like `vocab_card` and `translate`. Rubric items never auto grade, they return `{ correct: false, score: 0, needsReview: true }` so the guide writes the verdict and the learner sees "Sent for review". When both `expected` and `rubric` are present, exact match is checked first and non matching falls to rubric review. Strip never leaks `expected` or `alternatives` to the learner. Transcript extraction accepts `{ transcript }`, `{ text }`, or a bare string. Caps: 10 alternatives, 3 hints, rubric 3000 chars.
* `server/lib/items/kinds/index.js`: register `spoken` in the single registry.
* `web/src/pages/learn/items/SpokenItem.tsx` (194 lines): learner UI for `spoken`. Uses `PushToTalk` to fill `transcript`, shows "Heard: ..." in a boxed transcript, editable `textarea` with an explicit "That is what I meant" checkbox. Check is disabled until confirmed. Posts `{ transcript, language }` (or bare string) to `POST /api/learn/attempt`. Shows "Sent for review" on `needsReview`, otherwise Correct or Not quite with explanation. Re uses hint ladder, tutor chat, rumble.
* `web/src/pages/learn/LessonPlayer.tsx`: wire `kind === "spoken"` to `SpokenItem` with the same `onWrong`/`qKey`/`qIdx` plumbing as the other kinds.
* The underlying STT stack (not changed here, already on main, verified present):
  * `POST /api/stt` audio in, transcript out via `POST {baseUrl}/audio/transcriptions` (`stt-openai.js`), `STT_MODEL`/`sttModel` with fallback to `whisper-1`. Spend caps via `aiLimits.checkStt` (family `aiSttDailyCap` plus monthly and daily money caps, fail open on learning paths). `STT_MAX_UPLOAD_MB` raw audio and a single-file multipart parser, no new dep. Browser fallback to `SpeechRecognition` when no provider.
  * `web/src/components/PushToTalk.tsx`: push-to-talk helper, 16 kHz mono preference (`channelCount: 1, sampleRate: { ideal: 16000 }, echoCancellation, noiseSuppression`), `MediaRecorder` plus `AudioContext` analyser VAD/mic meter, too-short guard, space bar hold, Browser SpeechRecognition tier, transcript shown and confirmed before grading.
  * `server/lib/speech.js`: normalizer `normalizeForKind` for `text`/`numeric`/`mcq` (fillers out, number words to digits, fractions, choice index), pure functions no I/O, tested without a mic.

## ListenRepeatItem STT wiring
Already on `origin/main`: `ListenRepeatItem.tsx` renders a `PushToTalk kind="text" onResult={(spoken) => setTranscript(spoken.text)}` row beside the text input, so STT fills the answer box and the existing Check still grades.

## Task wording vs branch content
Task says scope owns `server/routes/stt.js`, `server/lib/speech.js`, `.../spoken.js`, `SpokenItem.tsx` plus ListenRepeat STT wiring and asks to build `POST /api/stt ... STT_MODEL ... spend caps, push to talk helper 16 kHz mono with VAD, new spoken kind graded by rubric or exact match, transcript shown and confirmed before grading`. All of that is present on the merged main tree. The `well11/speech-stt` branch itself only needed to add the `spoken` kind and its UI because the STT transport, model, caps, and recorder already rode on main.

## Verification (same as CI .github/workflows/ci.yml)
* `npm run check` (`node scripts/check.js`): 150 server files OK, no em dashes. `npm test` (server, method mocked): 757 pass, 0 fail.
* `npm test` with pglite path covered in other wells; here `npm test` (node --test) alone: 757 pass.
* `npm run check` full gate (`npm test` inside it): 757 pass, 0 fail. When run with `npm test` alone after: 772 pass (18 suites, with integration harness warm up).
* `npm run build` (tsc --noEmit + `npm --prefix web run build`): Vite build ok (built in ~3s).
* `npm --prefix web run lint`: 0 errors, 2 pre-existing warnings (AiVault/ProjectItem exhaustive-deps).
* `npm --prefix web test` (vitest run): 186 pass, 21 suites.

## Files changed on this branch
* `server/lib/items/kinds/index.js`
* `server/lib/items/kinds/spoken.js`
* `web/src/pages/learn/LessonPlayer.tsx`
* `web/src/pages/learn/items/SpokenItem.tsx`

## Notes
* No migration. No secrets opened. No em dashes. Push-to-talk helper already on main handles 16 kHz mono and the meter, no new native VAD dep was added there beyond the analyser level meter and the short-recording guard.
