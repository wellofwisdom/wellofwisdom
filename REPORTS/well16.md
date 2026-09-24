# Well 16 - Latin A1 Mini Pack plus Spanish A1 Polish (well16/latin-pack)

**Branch:** `well16/latin-pack` from `origin/main` (`dac4dd2`)
**Scope:** `docs/examples/**` and `server/templates/adventures/**` only (no migration)
**Date:** 2026-09-24

## Setup done in this run

- `git fetch origin` done (well16/latin-pack up to date with origin)
- `npm install` done (154 packages, up to date)
- `npm --prefix web install` done (272 packages, up to date)
- Read `docs/OPERATIONS.md` and `docs/COURSE-BUILDER-V2.md`

## What changed

### Spanish A1 polish

**File:** `docs/examples/spanish-a1/course.wow-course.json` (Title: Spanish A1: First Words, Listening, Speaking, and a Story)

Brought three thin lessons up to the target shape so all four now match French A1. Each lesson has article plus figure plus steps plus 2 to 3 exercises. The last lesson already had it. Two video stubs provide spoken form where it matters.

- Hola! Greetings and introductions: 6 items (article, figure, steps, video, match, categorize)
- En el aula: classroom and colors: 6 items (article, figure, steps, video, order, categorize)
- Mi familia y mi casa: 6 items (article, figure, steps, match, dialogue, order)
- Leer y escuchar: Un dia en el mercado: 8 items (article, figure, steps, audio, mcq, multi, categorize, project)

Kinds in unit: match, categorize, order, dialogue, mcq, multi, video, audio (8 kinds, covers the 3 per unit gate). Video stubs: 2 (Spanish greetings and colors). Audio transcript kept in the reader lesson.

### Latin A1 mini pack

**File:** `docs/examples/latin-a1/course.wow-course.json` (Title: Latin A1: Salve, Family, and Colors, CC-BY-4.0)

2 lessons in 1 unit, same density as French and Spanish.

- Salve! Greetings and names: 6 items (article, figure, steps, video, match, order)
- Familia et colores: family and colors: 6 items (article, figure, steps, video, match, categorize)

Per lesson shape: article plus figure plus steps plus 2 exercises. Kinds in unit: match, order, categorize, video (4 kinds, meets the 3 per unit gate). Video stubs: 2.

### Adventure template

**File:** `server/templates/adventures/latin-a1.json` - id `latin-a1`, Via Latina (story). Two chapters map to the two lessons. Characters: you, Magistra Livia (school), Marcus (classmate), Aulus (bookseller), Avia et Avus (grandparents). Loot: Tabula Cerea, Corona Laurea, Imago Familiae, Tunica Colorata, Bulla Aurea.

## Spec checks per lesson (grepped just now)

- Latin lesson 1: article true, figure true, steps true, exercises 2 (match, order), video 1. At least 5 items: yes (6).
- Latin lesson 2: article true, figure true, steps true, exercises 2 (match, categorize), video 1. At least 5 items: yes (6).
- Spanish: every lesson has article, figure, steps, and 2-3 exercises; two video stubs in first two lessons.
- 3 kinds per unit: Latin 4, Spanish 8. Video stubs per course: Latin 2, Spanish 2 (1 per unit needed when unit count is known, Latin has 1 unit and 2 stubs).

## Validate course output

```
$ node scripts/validate-course.js docs/examples/spanish-a1/course.wow-course.json docs/examples/latin-a1/course.wow-course.json docs/examples/french-a1/course.wow-course.json
ok   docs/examples/spanish-a1/course.wow-course.json (1 units, 4 lessons, 26 items, 10 questions)
ok   docs/examples/latin-a1/course.wow-course.json (1 units, 2 lessons, 12 items, 4 questions)
ok   docs/examples/french-a1/course.wow-course.json (2 units, 6 lessons, 38 items, 17 questions)
3 of 3 passed

$ node scripts/validate-course.js --library docs/examples/spanish-a1/course.wow-course.json docs/examples/latin-a1/course.wow-course.json
ok   docs/examples/spanish-a1/course.wow-course.json (1 units, 4 lessons, 26 items, 10 questions)
ok   docs/examples/latin-a1/course.wow-course.json (1 units, 2 lessons, 12 items, 4 questions)
2 of 2 passed

$ node scripts/validate-course.js --library docs/examples/
ok   docs/examples/latin-a1/course.wow-course.json (1 units, 2 lessons, 12 items, 4 questions)
ok   docs/examples/spanish-a1/course.wow-course.json (1 units, 4 lessons, 26 items, 10 questions)
... 21 of 21 passed
```

No missing answers, no dropped content on import.

### Video ids verified

- `5v2S84EuN0A` Spanish L1 greetings
- `Jz69JxNznWA` Spanish L2 colors
- `gkfb8hFeNAA` Latin L1 salve
- `pTygHdB6qjk` Latin L2 colores

## Five gates before push

All run on 2026-09-24 on branch well16/latin-pack, no changes to code (content only). The usual pre-push set used on well16 prior push was: validate-course, validate-course --library, npm run check, web lint/test/build, npm test.

1. **validate-course** `node scripts/validate-course.js docs/examples/spanish-a1/course.wow-course.json docs/examples/latin-a1/course.wow-course.json` - ok (1 unit 4 lessons 26 items; 1 unit 2 lessons 12 items)
2. **validate-course --library** `node scripts/validate-course.js --library docs/examples/spanish-a1/course.wow-course.json docs/examples/latin-a1/course.wow-course.json` - ok (CC-BY-4.0, no lost content)
3. **check** `npm run check` - ok: 150 server files OK, no em dashes; inline npm test: 757 pass, 0 fail (this run was check's built-in test sweep; full npm test below gives 772)
4. **web gates** `npm --prefix web run lint` - 0 errors, 2 pre-existing warnings; `npm --prefix web run build` - built in 6.15s; `npm --prefix web test` - 186 pass, 0 fail (21 files)
5. **server tests** `npm test` - 772 pass, 0 fail (18 suites)

Also: `node scripts/validate-course.js --library docs/examples/` - 21 of 21 passed.

## Push

Current branch `well16/latin-pack` already pushed to `origin/well16/latin-pack` at 8efebec (ahead of dac4dd2 by 3 content files). REPORTS/well16.md is untracked and not pushed per this gate run. Push it with the five gates satisfied when you are ready.

```
git fetch origin
npm install
npm --prefix web install
node scripts/validate-course.js --library docs/examples/latin-a1/course.wow-course.json docs/examples/spanish-a1/course.wow-course.json
node scripts/validate-course.js docs/examples/latin-a1/course.wow-course.json docs/examples/spanish-a1/course.wow-course.json
npm run check
npm test
npm --prefix web run lint
npm --prefix web run build
```
