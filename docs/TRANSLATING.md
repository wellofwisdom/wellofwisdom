# Translating the learner app

The learner-facing app is the first surface that is translated. The console, marketing pages and lesson content stay in their source language for now.

## How it works

- Dictionaries live in `web/src/i18n/en.ts` (English, the source) and `web/src/i18n/es.ts` (Spanish).
- `web/src/i18n/index.ts` holds a tiny `t(key, vars)` helper and a `useT()` React hook. No library.
- A key missing in the current language falls back to English and warns once in development.

## Language per learner

- Each learner row has `prefs.lang` (`en` default, `es` for Spanish), set in the learner form and stored as `users.prefs`.
- `GET /api/me` returns `prefs` for learners. The browser reads it on login and sets `document.documentElement.lang` so screen readers and the speech voice pick the right language.
- Browser speech (`speechSynthesis`) and narration fall back to a voice matching `prefs.lang` when one exists.

## Adding a new language

1. Copy `web/src/i18n/en.ts` to `web/src/i18n/<code>.ts` (use the two-letter code: `fr`, `pt`, `de`).
2. Translate every value. Keep the `{var}` placeholders exactly as they are.
3. In `web/src/i18n/index.ts`, import the new dictionary, add it to `dictionaries`, and extend the `Lang` type.
4. Extend `normalizeLang` so the short code is recognised, and add the option to the language dropdown in `web/src/pages/LearnerForm.tsx` (`LANGS`).
5. Add the new file to the vitest that every key in `en` exists in the new language (`web/src/i18n/i18n.test.tsx`).

## What is translated and what is not

- Translated: shell, HUD, home, course path, world view, world map, quest log, dailies, weeklies, practice, tutor chat, narration chrome, gamification strip, adventure banner, collection gallery.
- Not translated: `LessonPlayer.tsx` and `web/src/pages/learn/items/**`. Well 3 owns those files and is moving them. The keys they will need are already in `en.ts` / `es.ts` under `lesson.*`, so Well 3 can switch those files to `t()` without adding new keys.
- Course content, lesson titles and lesson bodies are never translated automatically. They are what the guide wrote.

## Checks

- `npm --prefix web test` runs `web/src/i18n/i18n.test.tsx`, which fails if keys drift.
- `npm run check` fails on em dashes.

## For Well 3

The lesson player keys are ready. When you translate `LessonPlayer.tsx`, replace the hard strings with:

- `lesson.courseBack`, `lesson.print`, `lesson.lessonComplete`, `lesson.photoFinish`, `lesson.nextLesson`, `lesson.backToCourse`

and keep the exercise grading strings in `en.ts` if you add more.
