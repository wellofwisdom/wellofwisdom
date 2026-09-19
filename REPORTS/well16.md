# Well 16 - French A1 Pack (well16/french-pack)

**Branch:** `well16/french-pack` from `origin/main` (212f2d9)
**Scope:** `docs/examples/**` and `server/templates/adventures/**` only
**Date:** 2026-09-19

## Course: French A1

**File:** `docs/examples/french-a1/course.wow-course.json`
**Title:** French A1: Bonjour, la classe, la famille, et une histoire
**License:** CC-BY-4.0
**Units:** 2 | **Lessons:** 6 | **Items:** 38 | **Questions:** 17

### Structure

| Unit | Lesson | Item types | Exercise kinds |
|---|---|---|---|
| Premiers mots (3 lessons) | Bonjour ! Greetings and politeness | article, figure, steps, video, exercises | match, categorize, order |
|  | Je m appelle... Introducing yourself | article, figure, steps, exercises | order, scenario |
|  | En classe : classroom and colors | article, figure, steps, exercises | match, categorize, order |
| Ma famille et une histoire (3 lessons) | Ma famille : family members | article, figure, steps, exercises | match, categorize, scenario |
|  | Chez moi et la semaine : home and days | article, figure, steps, exercises | order, categorize, match |
|  | Lire et ecouter : Une journee au marche | article, figure, steps, graded_reader, video, exercises | order, categorize, scenario |

Per-lesson shape: article plus figure plus steps plus 2 to 3 exercises. Same density as Language v1 flagships (Spanish A1, marvel courses use one unit variant; this uses two units for six lessons).

### Exercise kind mix

Kinds used: order, match, categorize, scenario (4 kinds). Unit 1 uses match/categorize/order and scenario, Unit 2 uses all four. Three kinds per unit as required, scenario provides the choice with feedback pattern on politeness and market language.

### Video items (2)

Both are embedded YouTube, verified live via oEmbed before inclusion:

1. `hd0_GZHHWeE` - French Greetings (French Essentials Lesson 1) - in greeting lesson where spoken form matters and the article already explains the written forms solidly.
2. `9ro7xmZqRm0` - Ma famille : French Story for Beginners (A1) - in graded reader where listening to family words in a story complements the reader.

No video invented. Both ids verified 200 via `https://www.youtube.com/oembed`.

### Graded reader

Lesson 6 graded_reader "Une journee au marche" - short A1 market story reusing greetings, colors, family, and numbers. 10 glosses, level A1.

### Adventure template

`server/templates/adventures/french-a1.json` - id `french-a1`, "Le Petit Voyage" (story). Four chapters map to the two units. Characters: you, Mme Martin (market), Luc (classmate), Maitresse Dubois (teacher), Mamie et Papi. Loot five items matching course themes. Warm small town tone, no public figures.

## Five gates (pre-push)

All run on 2026-09-19 on this branch, no changes to code:

1. **validate-course** `node scripts/validate-course.js docs/examples/french-a1/course.wow-course.json` - ok (2 units, 6 lessons, 38 items, 17 questions)
2. **validate-course --library** `node scripts/validate-course.js --library docs/examples/french-a1/course.wow-course.json` - ok (CC-BY-4.0, no lost content)
3. **check** `npm run check` - 149 server files OK, no em dashes
4. **web gates** `npm --prefix web run lint` - 0 errors (2 pre-existing warnings), `npm --prefix web test` - 18 files 175 tests pass, `npm run build` - ok
5. **server tests** `npm test` - 748 pass, 0 fail

## Commit

`well16/french-pack: French A1 (6 lessons) with adventure template` - docs/examples/french-a1/course.wow-course.json plus server/templates/adventures/french-a1.json

## Push

Pushed to `origin/well16/french-pack` (new branch).
