# Translating the learner app

The learner-facing app is the first surface that is translated. The console, marketing pages and lesson content stay in their source language for now.

## How it works

- Dictionaries live in `web/src/i18n/en.ts` (English, the source), `web/src/i18n/es.ts` (Spanish), and `web/src/i18n/fr.ts` (French).
- `web/src/i18n/index.ts` holds a tiny `t(key, vars)` helper and a `useT()` React hook. No library. `Lang` is `"en" | "es" | "fr"`.
- A key missing in the current language falls back to English and warns once in development.

## Language per learner

- Each learner row has `prefs.lang` (`en` default, `es` for Spanish, `fr` for French), set in the learner form and stored as `users.prefs`.
- `GET /api/me` returns `prefs` for learners. The browser reads it on login and sets `document.documentElement.lang` so screen readers and the speech voice pick the right language.
- Browser speech (`speechSynthesis`) and narration fall back to a voice matching `prefs.lang` when one exists.
- French is a browser and chrome change only; a learner with `prefs.lang: "fr"` sees the shell, HUD, course path and all the surfaces below in French. It does not by itself create French lessons; course target language is separate (see Language lesson kinds).

## Adding a new language

1. Copy `web/src/i18n/en.ts` to `web/src/i18n/<code>.ts` (use the two-letter code: `fr`, `pt`, `de`).
2. Translate every value. Keep the `{var}` placeholders exactly as they are. The French file is `fr.ts`.
3. In `web/src/i18n/index.ts`, import the new dictionary, add it to `dictionaries`, and extend the `Lang` type. `normalizeLang` already recognises `fr` (two-letter lowercased slice).
4. Add the option to the language dropdown in `web/src/pages/LearnerForm.tsx` (`LANGS`).
5. Add the new file to the vitest that every key in `en` exists in the new language (`web/src/i18n/i18n.test.tsx`). `fr.ts` is already covered.

## What is translated and what is not

- Translated: shell (including the controller toggle `shell.controllerOn` / `shell.controllerOff`), HUD, home, course path, world view, world map, quest log, dailies, weeklies, practice, tutor chat (including `tutor.talk` for the push to talk button), narration chrome, gamification strip, adventure banner, collection gallery, plus exercise strings, lesson kinds, and kind labels (`vocab`, `listenChoice`, `listenRepeat`, `translate`, `dialogue`). French has all of them.
- Spoken input chrome inside `PushToTalk.tsx` is also translated through the same dictionaries (`exercise.speak`, `exercise.hint`, tutor `talk` label); the transcript itself is never translated, it is normalised (see `docs/API.md` STT / Spoken answers).
- Not translated in one place: `LessonPlayer.tsx` owns the page frame, but Well 3 moves its remaining hard strings to `t()` using the reserved `lesson.*` keys already in all three dictionaries (`lesson.courseBack`, `lesson.print`, `lesson.lessonComplete`, `lesson.photoFinish`, `lesson.nextLesson`, `lesson.backToCourse`). Course content, lesson titles, lesson bodies and the wording inside an exercise `prompt` are never auto-translated; they are what the guide wrote or what the generator wrote for that course's target language.
- The controller preference itself (`wow-controller-mode` in `localStorage`) is local to the browser and is not a language. It toggles keyboard and gamepad spatial navigation via `[data-nav]` under the same routes (`docs/API.md` Controller). Its button label is translated but its state is not stored on the server.

## Language lesson kinds

The platform now has language kinds inside normal lessons:

- **vocab_card**: word, form, gloss, example, CEFR level A1 to B2, optional image and audioText, alternatives accepted, spaced review per card.
- **listen_choice**: hear audioText or a local clip at `/media/` then choose one of up to six options. The answer is a choice id graded on the server.
- **listen_repeat**: hear the expected phrase then repeat. Grading folds accents, strips punctuation and counts words correct in order. You can type the transcript or use STT (`POST /api/stt` with `kind: "text"`). Alternatives are accepted and partial credit is scored as words matched divided by words expected.
- **translate**: prompt, expected answer, direction en_to_es, es_to_en, en_to_fr or fr_to_en, optional alternatives and rubric. Grading is exact match after normalizing case and punctuation; a miss is flagged needsReview so the guide can apply the rubric. Use STT with `kind: "text"` for a spoken translation before confirm.
- **dialogue**: prompt plus scene, 1 to 6 turns with optional goals, goodEndings, hints and explanation. Learner posts turns, grading checks completeness per turn.
- **graded_reader**: leveled reader with body, level A1 to C2 and optional glosses. Tap a word glosses are shown inline. No exercise grade, used as part of the lesson.

These kinds appear in generated courses when a target language is set (for example `language: "es"` or `language: "fr"` at A1). They use the same attempt endpoint as other items, so `normalizeLang` and `prefs.lang` still control only the chrome language, not the course target language. French A1 uses en_to_fr and fr_to_en directions. The controller and the spoken path both work inside these kinds under the same attempt, so holding the microphone lands the same grading that typing does.

## Checks

- `npm --prefix web test` runs `web/src/i18n/i18n.test.tsx`, which fails if keys drift (French must match English key for key, except translate direction keys that only French and Spanish use).
- `npm run check` fails on em dashes. Every `fr` string must avoid them the same way `en` does.
- `npm --prefix web run build` must pass: LeanerShell's controller toggle reads `shell.controllerOn` / `shell.controllerOff` through `useT()`, so a missing key breaks the learner shell.

## For Well 3

The lesson player keys are ready. When you translate `LessonPlayer.tsx`, replace the hard strings with:

- `lesson.courseBack`, `lesson.print`, `lesson.lessonComplete`, `lesson.photoFinish`, `lesson.nextLesson`, `lesson.backToCourse`

and keep the exercise grading strings in `en.ts` if you add more. Push to talk labels are already global (`exercise.speak` / `tutor.talk`), so Well 3 does not need a new label for spoken input inside a kind.
