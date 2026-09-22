# Course Builder v2: from worksheets to lessons kids want to play

Written on 13 September 2026 from a read of `main` at `1901beb` and all 17 example courses. It says what the course builder does today, what is missing, and how it should evolve. The item contracts in section 5 are the shared agreement for the shapes.

---

## 1. Where it stands

**The generator** (`server/lib/coursegen.js`) makes one AI call that returns a whole course as JSON. The shape is fixed: exactly 3 units of 3 lessons, and every lesson is one article of 120 to 220 words followed by 2 or 3 exercises. A project may close the course. Videos are included only when the model is "certain" of a real YouTube id.

**Item types:** four. `article`, `exercise` (with kinds `mcq`, `numeric`, `text`), `video` (with multiple-choice questions), and `project` (with a rubric).

**The editor** (`web/src/pages/CourseDetail.tsx`) can edit any item, add an article, exercise, video or project to a lesson, delete an item, rewrite an article to a reading level, and draft video questions with AI. It can also publish, export, and set a trailer.

**The player** (`web/src/pages/learn/LessonPlayer.tsx`) shows items top to bottom. Grading is server-side and answers never reach the browser, which is the right foundation for everything below.

**The hand-built courses** (all 17 in `docs/examples`) follow the generator's pattern at a smaller size:

| Measure | Typical IP course |
|---|---|
| Units and lessons | 2 units, 6 lessons |
| Exercises | 10 to 13, mostly multiple choice |
| Article length | about 100 words |
| Videos, images, interactive items | none |
| Projects | 1 |
| Time to finish | about 60 to 90 minutes |

## 2. What is missing

The honest summary: every lesson is **read a paragraph, then take a quiz**. The worlds wrap that in a story, but inside a lesson the child is filling in a worksheet. The gaps, most important first.

### 2a. Interaction inside a lesson
- **No way to touch the idea.** No dragging, ordering, matching, sorting, placing on a number line, shading a fraction, labelling a diagram, or plotting a point. For K to 5 maths especially, manipulatives are how the concept lands.
- **No images in lessons.** The item schema has no figure type, so a lesson on the water cycle or the parts of a cell is text only. The kie image pipeline already exists for world art.
- **Feedback is one-size.** A wrong multiple choice answer gets the same explanation whichever wrong choice was picked. The best feedback names the misconception behind that specific choice.
- **One hint, not a ladder.** Struggling learners need a second and third nudge before the explanation.
- **No worked examples.** Research on novices is clear that studying a solved problem step by step, then solving one with the last step blank, beats practice alone.
- **No predict-then-reveal.** Asking a learner to commit to a guess before the explanation makes the explanation stick.
- **No branching.** The worlds have choose-your-path, lessons do not.
- **No multi-select, no fill-in-the-blank, no maths expression input** (MathLive was in the original roadmap).

### 2b. Generator
- **One shot for the whole course.** A single call caps quality, risks truncation, and gives the guide nothing to steer until it is finished.
- **No outline step.** The guide cannot approve or reorder the unit and lesson plan before content is written.
- **Fixed 3 by 3 shape.** A one-week unit and a semester course get the same size.
- **No learning objectives, no time estimate, no difficulty ramp** inside a unit.
- **No verification pass.** Nothing re-checks that each answer key is right before a guide sees it. The guide is the only safety net.
- **Generated YouTube ids are not checked.** The oEmbed check runs when a guide adds a video by hand, not on generated videos, so a made-up id reaches learners as a broken embed.

### 2c. Editor
- **Cannot add, delete, or reorder units and lessons.**
- **Cannot reorder items** inside a lesson.
- **Cannot regenerate one lesson or one item** ("make this harder", "add a manipulative", "shorter article").
- **Cannot preview one lesson as the learner** without switching the whole session into preview.
- **No undo or version history** for a course.

### 2d. The hand-built course bar
The IP courses are well researched and accurate, and the world tie-ins are clever. They are also short and single-mode: no images, no audio, no interactive items, mostly multiple choice. They should become the showcase for v2, not the floor.

## 3. Next steps

This section is reserved for the technical gaps that remain. See the roadmap for what has shipped and what is next.

## 4. Design principles for v2

1. **The server stays the grader.** Every new interactive kind is graded in `server/lib/grade.js`. The learner payload carries what is needed to render, never the key. `attempts.answer` is already `jsonb`, so structured answers fit without a migration.
2. **Every kind degrades.** Each interactive item has a keyboard path, a screen reader path, and a controller path (`data-nav`). If a kind cannot render, the player shows its text form rather than nothing.
3. **Partial credit is recorded, correctness is binary.** Review scheduling and XP keep working on `correct: true|false`; a `score` from 0 to 1 is stored alongside for reports.
4. **Feedback names the mistake.** Any choice, bucket or blank can carry its own feedback string.
5. **One registry.** A kind is defined once on the server (normalize, problem check, strip, grade) and once on the client (render, answer shape). Adding a kind never means editing a long if-chain in five places.
6. **The generator writes lessons, not quizzes.** A lesson follows a shape (section 6), and interactive kinds are chosen because they fit the idea, not to hit a quota.

## 5. Item contracts

Content shapes as stored in `lesson_items.content`. Fields marked **key** are stripped before the learner sees the item. Answer shapes are what the player posts to `POST /api/learn/attempts`.

### Changes to existing kinds
- **All gradable kinds** gain `hints: string[]` (a ladder, up to 3; the old single `hint` is read as a one-item ladder).
- **`mcq` choices** gain optional `feedback: string` per choice, shown when that choice is picked.
- **`exercise` kind `multi`** (new): multi-select. Content `{ prompt, choices[{id,text,feedback?}], answer: string[] (key) }`. Answer `string[]`. Correct when the sets match exactly; score is the share of correct decisions across all choices.

### New content kinds (not graded)
| Type | Content | Notes |
|---|---|---|
| `figure` | `{ uploadId? , prompt?, alt, caption }` | `prompt` is for kie image generation; the generated image becomes an upload. `alt` is required. |
| `steps` | `{ title, problem, steps[{ text, reveal: true }], fadeLast?: number }` | Worked example revealed one step at a time. `fadeLast: 1` turns the last step into a `cloze` the learner completes. |
| `predict` | `{ prompt, choices[{id,text}], reveal }` | Learner commits a guess, then `reveal` shows. Recorded but never marked wrong. |
| `flashcards` | `{ cards[{ front, back, imageUploadId? }] }` | Each card joins spaced review. |
| `audio` | `{ title, transcript, uploadId }` |  |

### New gradable kinds (type `exercise`, new `kind` values)
| Kind | Content (key fields marked) | Answer posted | Grading |
|---|---|---|---|
| `order` | `{ prompt, items[{id,text}], answer: id[] (key) }`; items shuffled server-side per attempt | `id[]` | Exact order is correct; score from longest correct run |
| `match` | `{ prompt, left[{id,text}], right[{id,text}], answer: {leftId: rightId} (key) }` | `{leftId: rightId}` | All pairs correct; score is share of pairs |
| `categorize` | `{ prompt, buckets[{id,label}], cards[{id,text}], answer: {cardId: bucketId} (key), feedback?: {cardId: string} }` | `{cardId: bucketId}` | All placed right; per-card feedback on misplaced cards |
| `cloze` | `{ text with [[1]] [[2]] markers, blanks[{ id, accept: string[] (key), numeric?: true, choices?: string[] }] }` | `{blankId: string}` | Each blank: case and space insensitive match, or numeric with the existing tolerance and fraction parsing |
| `numberline` | `{ prompt, min, max, step, labels?, answer: number (key), tolerance (key) }` | `number` | Within tolerance |
| `fraction` | `{ prompt, model: "bar"\|"circle", parts, answer: { numerator, denominator } (key) }` | `{ shaded: number[] }` | Equivalent fraction is correct (2/4 equals 1/2) unless `exact: true` |
| `hotspot` | `{ prompt, uploadId, alt, regions[{id, shape:"rect"\|"poly", points (percent)}], answer: regionId[] (key) }` | `{ x, y }` in percent, or region ids for keyboard | Point inside a correct region |
| `plot` | `{ prompt, grid{xmin,xmax,ymin,ymax,step}, answer: [{x,y}] (key), tolerance }` | `[{x,y}]` | Every required point within tolerance, no extras |
| `scenario` | `{ start, nodes{id: { text, choices[{ text, next, feedback }] }}, good: nodeId[] (key) }` | path of node ids | Reaching a good ending; the path is kept for the guide |

Later: `expression` (MathLive, symbolic equivalence), `code` (sandboxed runner), `spoken` (voice answers), `graph` beyond points.

## 6. Generator v2

1. **Outline first.** Call one returns units and lessons with objectives, a time estimate, and the planned interactive kind per lesson. The guide reorders, renames, deletes or adds before anything else is written. Size follows the guide's choice (a week, a month, a term), within the existing caps.
2. **Lesson by lesson.** Each lesson is its own job, so a failure costs one lesson, the guide watches it fill in, and long courses do not truncate.
3. **A lesson shape.** Hook (a `predict` or a question from the lens), short explanation with a `figure`, a `steps` worked example, a manipulative or sorting item that fits the idea, two or three practice items of rising difficulty, and a one-question check. The prompt gives the model the menu of kinds from section 5 with one example each.
4. **Misconception-aware distractors.** Every wrong choice must be a mistake a real learner makes, with `feedback` naming it. The existing `misconceptions.js` data feeds the prompt.
5. **Verification pass.** A second, cheaper call re-solves every gradable item without seeing the key. Disagreements are flagged in the editor as "check this answer" before the guide publishes.
6. **Media pass.** `figure.prompt` items queue kie image jobs through the existing media pipeline; generated YouTube ids go through the existing oEmbed check and are dropped when unavailable.
7. **Per-task providers.** Course generation for a course that will be published as open content can use a cheaper provider, and anything that includes a learner's name, notes or interests stays on the family's main provider.

## 7. Editor v2

- Add, delete, rename and drag to reorder units, lessons and items.
- **Regenerate with an instruction** on any lesson or item: "make it harder", "add a manipulative", "use the horse lens", "shorter". The result is a draft beside the original, accepted or discarded.
- **"Make this lesson interactive"**: converts a read-then-quiz lesson into the section 6 shape, keeping the guide's own text.
- A form per new kind from section 5, with a live preview beside it.
- Preview one lesson as the learner in a side panel, without switching the session.
- The verification flags from section 6 appear inline, and publish is blocked until each is resolved or dismissed.
- Snapshot on every save, with a "restore this version" list.

## 8. Engagement inside the lesson

- A **lesson progress bar** and a **combo counter** for consecutive first-try answers, reusing the existing sound and motion rules (muted by default, reduced motion respected).
- **Wrong answers get the companion.** The world's companion character says the choice feedback, through the narrator when voice is on.
- **Mastery check at the end** of each unit: a short mixed quiz drawn from that unit's items. Passing it earns the unit's mastery star on the path.
- **Warm-up review** at the start of a lesson: one or two due review items from earlier lessons, interleaved.
- **World hooks per item**: an item can name the encounter beat it belongs to, so the scene changes as the learner solves it.
- **Photo finish** for projects becomes a real hand-in with the photo attached, already half built.

## 9. The IP course bar for wave 2

Each flagship course (Wonderland, Holmes, Willows, Oz first) is upgraded to:
- 3 to 4 units of 3 to 4 lessons, 3 to 5 hours of learning.
- At least one `figure` per lesson and at least three different interactive kinds per unit.
- A `steps` worked example in every lesson that teaches a procedure.
- Choice feedback on every multiple choice item.
- Narrated articles (cached voice) and a chapter music loop.
- The existing accuracy checklist, plus the verification pass from section 6 run over the hand-written keys.

## 10. Acceptance

A guide generates "Fractions through baking, grade 4, two weeks", approves an outline, watches lessons fill in with a figure, a worked example, a fraction manipulative and choice feedback, fixes one flagged answer, previews a lesson as the learner, and publishes. A learner plays it with a mouse, a keyboard, and a controller.
