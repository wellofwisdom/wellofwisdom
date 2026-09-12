# Well 2 ,  IP-Lensed K-12 Curriculum Plan

> **Owner:** Well 2 (Kevin: "well2") on branch `courses/well2-ip-curriculum`, worktree `../wellofwisdom-well2`
> Well 1 stays on `main` for core dev. This branch is the only place courses, world templates, and IP curriculum tooling land until merged.

Goal: build the first wave of courses that make the app undeniable to public educators, funders, and award juries. Every course uses popular **public-domain IP as the lens**, is **fact-checked and grade-correct**, plays as a **real game** with characters, scenes, and loot that **mean something in the original story**, and ships at a **GitHub-ready quality bar** (clean `.wow-course.json`, validated, Open licensed, illustrated).

---

## 1. What "done very well" means here

- **No wrong information.** A student, a teacher, or a state reviewer reads the course and finds no factual errors. This is a trust product.
- **One idea per page, built to scan.** Per AGENTS.md marketing rule, internal lesson copy also reads in short blocks: headings, bullets, small steps, not wall text.
- **Every game element earns its story.** A battle, a treasure, a loot item, a boss ,  each comes from the source text and fits the lesson it gates.
- **Award signal:** original, defensible pedagogy (lens-driven learning), 100 lighthouse + accessibility, kids actually play it, teachers can file it.

---

## 2. K-12 subject map ,  what we ship, by band

We cover the four core families at every band, plus an ELA-adjacent creative slot. Nothing exotic in wave 1.

| Band | Math | ELA | Science | Social Studies | Extras |
|------|------|-----|---------|---------------|--------|
| **K-2 Foundations** | Counting and cardinality, addition and subtraction within 20, place value, shapes, measurement, telling time | Phonics and decoding, sight words, sentence building, read-aloud comprehension, vocabulary in context | Living vs non-living, weather and seasons, plants and animals, push and pull, the five senses | Me and my community, maps and directions, helpers, holidays and traditions | Creative play |
| **3-5 Elementary** | Multiplication and division, fractions and decimals, area and perimeter, factors and multiples, intro to data | Grammar, paragraphs and narrative writing, fables and folktales, biography, research and citation | Ecosystems and food webs, matter and energy, earth systems, simple machines, the human body | US regions and states, early America, world geography, civics (rules and rights) | ,  |
| **6-8 Middle** | Ratios and proportions, integers and rational numbers, expressions and equations, geometry and scale, statistics | Literature analysis, argument writing, poetry, Greek and Norse myth as literature, media literacy | Life science (cells, genetics, evolution), earth science (plate tectonics, climate), physical science (forces, waves, chemistry) | World history (ancient to modern), US History (founding to Civil War to modern), government and economics | Intro CS (scratch-like logic, without claiming to run code) |
| **9-12 High** | Algebra I and II, geometry proofs, trigonometry, statistics and probability, pre-calculus | American literature, British literature, world literature, rhetoric and composition, research paper | Biology, chemistry, physics, environmental science, astronomy | World history and geography, US history and government, economics and personal finance, civics and media literacy | Computer science fundamentals |

For each band we ship at least one math, one ELA, one science, and one social studies course. No band gets only one family.

### Where a lens helps most vs least
- **Best fit:** ELA (the IP *is* the text), history (the world the IP came from), science (IP as narrative frame), elementary math (counting, sharing, measuring inside a story).
- **Hardest fit:** high-school formal proof math. There we use the IP as a framing adventure (characters want something that needs the math) rather than forcing the math into the story's language.

---

## 3. Public-domain IP catalog ,  verified, safe, popular

All titles below are public domain in the United States as of 2026 (author death + 70, or US publication before 1930). Each entry notes US PD status so a reviewer can check it in one click.

**When in doubt, do not ship it as IP-lensed. Use an original template (like `wildwood-rangers`) instead.** The app never needs to risk a borderline lens.

### Tier 1 ,  universally known, kid-beloved, visually rich

| IP | Year | Why it lenses well | Best bands |
|----|------|-------------------|------------|
| **Alice's Adventures in Wonderland** ,  Lewis Carroll | 1865 | Logic, size and scale, nonsense as a path into fractions, logic puzzles, and measurement. | K-2, 3-5 |
| **The Wonderful Wizard of Oz** ,  L. Frank Baum | 1900 | Journey structure (perfect chapter game), geography through Oz's regions, bravery and friendship as party mechanics. First 14 Oz books (1900-1920) are all PD. | K-2, 3-5 |
| **Peter Pan** ,  J. M. Barrie | Play 1904, novel 1911 | Flight, maps of Neverland, time, growing up as a throughline for biology and geography. US: published before 1930, so PD. | 3-5, 6-8 |
| **Winnie-the-Pooh** ,  A. A. Milne (1926) and **The House at Pooh Corner** (1928) | 1926 / 1928 | Gentle logic puzzles, counting honey pots, seasons in the Hundred Acre Wood. Both US PD (1926 entered 2022, 1928 entered 2024). | K-2, 3-5 |
| **Sherlock Holmes** ,  Arthur Conan Doyle | 1887-1927, all stories PD as of Jan 2023 | Deduction, observation, evidence, measurement ,  the natural lens for science and math reasoning. | 3-5, 6-8, 9-12 |
| **Treasure Island** ,  Robert Louis Stevenson | 1883 | Maps, navigation, ratios, and Percy's economics of piracy for geography, fractions, and economics. | 3-5, 6-8 |
| **The Adventures of Tom Sawyer / Huckleberry Finn** ,  Mark Twain | 1876 / 1884 | River geography, 19th-century America ,  US history and earth science through the Mississippi. | 6-8, 9-12 |

### Tier 2 ,  deep bench, strong mechanics

| IP | Year | Lens fit |
|----|------|----------|
| **Grimm's Fairy Tales** and **Hans Christian Andersen** | 1812-1857 / 1835-1872 | K-2 phonics, counting, comparison, morals as comprehension checks |
| **Aesop's Fables** | antiquity | K-2 close reading, inference, moral as thesis |
| **Beatrix Potter ,  Tales of Peter Rabbit, etc.** | 1902-1913 | K-2 nature science and counting |
| **The Secret Garden** ,  Frances Hodgson Burnett | 1911 | 3-5 life science (plants, ecosystems) and descriptive writing |
| **Anne of Green Gables** ,  L. M. Montgomery | 1908 | 6-8 imaginative writing, Canadian geography, late-19th-century social history |
| **Little Women** ,  Louisa May Alcott | 1868 | 9-12 American literature, Civil War home-front history |
| **Frankenstein** ,  Mary Shelley | 1818 | 9-12 biology ethics, close reading, the Gothic |
| **Dracula** ,  Bram Stoker | 1897 | 6-8/9-12 geography of Mitteleuropa, epistolary form, media literacy |
| **Journey to the Center of the Earth / 20,000 Leagues Under the Seas / Around the World in Eighty Days** ,  Jules Verne | 1864 / 1870 / 1873 | 6-8 earth science, ocean science, geography and scale, ratios (time and speed) |
| **The Count of Monte Cristo / The Three Musketeers** ,  Alexandre Dumas | 1844 / 1844 | 9-12 world history, rhetoric, economics of revenge and loyalty |
| **Gulliver's Travels** ,  Jonathan Swift | 1726 | 6-8 scale and ratio, satire, geography |
| **Robinson Crusoe** ,  Daniel Defoe | 1719 | 6-8 survival science, measurement, economics |
| **Moby-Dick** ,  Herman Melville | 1851 | 9-12 American literature, ocean ecology |
| **The Wind in the Willows** ,  Kenneth Grahame | 1908 | 3-5 river ecology (pairs perfectly with the existing River Ecology field course) |
| **Pride and Prejudice / Jane Eyre** (Austen / Bronte) | 1813 / 1847 | 9-12 rhetoric, British literature, social history |

### What we deliberately do NOT use

- **Steamboat Willie Mickey (1928, PD 2024) and later Disney** ,  the 1928 short is PD, but the character is heavily trademarked. One confused parent email is not worth the risk. Skip entirely in wave 1.
- **Harry Potter, Narnia (last book 1956, PD ~2026+ but not uniformly), Middle-earth, Peanuts (1950), Curious George, etc.** ,  still under copyright.
- **Anything where PD status varies by country** ,  we ship on US PD only and state it.

### Sourcing note we will put in each course's opening
> "This course is inspired by [Title] by [Author] ([Year]), which is in the public domain in the United States. Illustrations are original, made for this course. Quotes are short excerpts for study, or paraphrases. No affiliation with any estate."

That one line defuses 90 percent of educator concern.

---

## 4. How a world wraps a course ,  the game integration model

The app already has four `game_type` values in `019_worlds` and `lib/quest.js`:

- `story` ,  chapters that follow the tale. Beats: `scene, scene, boss`
- `dungeon` ,  rooms, traps, treasure. Beats: `battle, treasure, puzzle, miniboss`
- `rpg` ,  party levelling. Beats: `scene, battle, treasure, boss`
- `cyoa` ,  branching choices. Beats: `choice, scene, choice, boss`

Each encounter has `kind` (`scene`, `battle`, `puzzle`, `treasure`, `miniboss`, `boss`, `choice`), `requires` (what unlocks it), and `rewards` (what it pays), plus a boss authority path already in `023_boss_runs`.

### Rule: every game element means something in the original story

| Element | Must come from | Example that passes | Example that fails |
|---------|---------------|---------------------|--------------------|
| **Character** | Named person, creature, or archetype in the book, described from the text | Alice, White Rabbit, Cheshire Cat ,  Rabbit is late and anxious, so his bio says "always checking the watch" | Inventing "Shadow Ninja Alice" |
| **Scene** | A place or event in the book | The Mad Hatter's tea table that never ends, for fractions of a cake that never gets cut | A generic "forest level" |
| **Battle / Puzzle** | A conflict or riddle the book actually contains | The Queen of Hearts' croquet ground where nothing behaves as expected, for comparing fractions with unlike denominators | "Fight the Dark Lord" in an Alice course |
| **Treasure / Loot** | An object the text names or clearly implies | The "Drink Me" bottle, the Queen's tarts, the Cheshire smile, Holmes's lens, the Nautilus brass gauge | "Laser sword +10" |
| **Boss** | The book's central trial or antagonist, resolved without death | The Cheshire riddle-retort that asks for a streak of right answers; Holmes's Moriarty case; the Oz Wizard's test of courage | Killing a character |

Characters carry `portrait_url` (via `questgen.portraitPrompt`), chapters carry `artUrl` (`questgen.chapterPrompt`), encounters carry `rewards.artPrompt` then `art_url` via the `world-art` job. All three use one house style so the course feels like a set, not a clip-art collage.

### Loot that teaches

Loot is not just points. Each item maps to a concept and carries a teachable effect:

- **Common** ,  a keepsake (a tart, a honey pot, a brass button) ,  cosmetic, recalls the scene.
- **Uncommon** ,  a tool the character would own (Holmes's magnifier, Peter's thimble) ,  grants a hint token or a worked example.
- **Rare** ,  a map or key (Treasure Island chart fragment, Oz yellow brick) ,  unlocks a shortcut encounter or a bonus challenge.
- **Epic / Legendary** ,  the book's iconic thing (the "Drink Me" set, the Nautilus log) ,  boss-tier reward, narrative closure.

Trash loot is forbidden. A learner should be able to say after: "I got the tarts because we were splitting them into thirds and fifths."

### Game-type assignment ,  think creatively, not formulaically

We choose the game type *to fit the book's shape*, not the subject:

- **Wonderland and Oz → `cyoa` or `story`.** Their structure is a journey of weird encounters. `choice` encounters at the fork (follow the Rabbit or talk to the Cat) teach without punishing a wrong turn.
- **Treasure Island and Holmes → `dungeon` or `rpg`.** Rooms and cases. `puzzle` and `battle` map to navigation and deduction.
- **Secret Garden and Pooh → `story` or `rpg`.** Quiet, seasonal growth. Party mechanics suit gardening science (the party is the garden).
- **Verne and Dumas → `rpg`.** A crew that levels as the course deepens.

We deliberately mix them across the curriculum so a student who plays three courses does not play the same loop thrice.

---

## 5. Accuracy and educator trust ,  how we avoid teaching wrong information

This is the difference between "fun prototype" and "funders and awards."

### Authoring discipline (non-negotiable)

1. **Human-authored first draft, AI as second pair of eyes.** Every course JSON is hand-written and hand-checked, then (optionally) passed through the worksheet/AI pipeline only to catch clumsiness. The course that ships is the one a teacher read.
2. **Two-person read before publish.** One person checks **facts**, one checks **pedagogy and grade fit**. We keep a short checklist file (`docs/examples/<slug>/CHECKLIST.md`) signed off in the PR.
3. **No hallucinating primary sources.** If the course quotes Carroll, Verne, or Doyle, the quote is copied from Project Gutenberg text, with chapter and line, not recalled by a model.
4. **Math notation is exact.** Fractions use `$\\frac{a}{b}$`, not slashes in body. Inequalities survived the normalizer fix ,  we test them.
5. **Grade language is checked.** A K-2 article never uses a 9-12 sentence. The reading-level rewrite path (`POST /api/courses/rewrite`) exists to tune this, but the authored version is already at level.

### Technical guardrails already in the app that we lean on

- `lib/coursegen.normalizeCourse` / `normalizeItem` and `lib/coursecheck` ,  the trust boundary that drops or reports anything that would silently cut content. `docs/examples/*.wow-course.json` pass `lib/coursecheck`.
- `lib/text.stripTags` fix for `3 < 5` math.
- `lib/grade` server-side grading so answers are never leaked to the client.
- `lib/safefetch` for any source URL grounding ,  no import path fetches a private address.
- `lib/coursecheck` enforces **answers on every question** and **open license** ,  both matter for an educator library.

### Review checklist per course (PR template)

- [ ] Every factual claim cited to a source a teacher could open.
- [ ] Every question has a correct key, explanation, and hint. No invented keys.
- [ ] Math renders in KaTeX (local build check, not just preview).
- [ ] Art prompts describe no text in image, one house style across the course's world.
- [ ] Loot and encounters each name their origin in the text (chapter or page).
- [ ] Passes `node scripts/validate-course.js --library docs/examples` with zero errors.
- [ ] Passes `npm run check` (no em dashes, no style drift).
- [ ] Screen-reader and lighthouse spot-check on the course player.

---

## 6. Wave 1 course slate ,  the first 12, ordered to build momentum

We ship 12 to prove coverage without thinning quality. First four are the demo; next eight fill the grid.

**Phase A ,  flagship four (these go live first, one per core subject):**

| # | Title | Subject + Grade | IP lens | Game type | Why this one first |
|---|-------|----------------|---------|-----------|-------------------|
| 1 | **Wonderland Fractions** ,  "How Alice Shares the Tarts" | Math ,  fractions, grades 3-4 | **Alice in Wonderland** | `cyoa` ,  follow the Rabbit or answer the Cat | The most natural lens for "same vs unlike denominators." The tea party is an unbeatable metaphor for renaming pieces to the same size. |
| 2 | **Holmes Observes: Matter and Measurement** | Science ,  matter, measurement, observation, grades 4-5 | **Sherlock Holmes** | `dungeon` ,  cases as rooms, each room a measurement puzzle | Teaches the scientific method as deduction. Loot: lens, footprint cast, telegram. Treated seriously enough for a public-school science supervisor to nod. |
| 3 | **The Wind in the Willows ,  River Ecology** (builds on the existing River Ecology field course) | Science + ELA ,  ecosystems, descriptive writing, grades 3-5 | **The Wind in the Willows** | `story` ,  seasons on the riverbank | Pairs with the living field course. Characters: Mole, Rat, Badger, Toad ,  each a habitat. |
| 4 | **Oz and the Map ,  US Regions and Directions** | Social Studies ,  geography, maps, regions, grades 3-4 | **The Wizard of Oz** | `story` ,  each Oz region is a map unit | Compass rose, legend, scale, and the four quadrants through Munchkin Country → Emerald City. |

**Phase B ,  next eight (fill every band):**

| # | Title | Subject + Grade | IP lens | Game type |
|---|-------|----------------|---------|-----------|
| 5 | **Pooh Counts Honey** | Math ,  counting, addition, estimation, K-1 | **Winnie-the-Pooh** | `story` ,  gentle, no boss pressure |
| 6 | **Grimm Numbers ,  Shapes and Patterns** | Math ,  shapes, patterns, sorting, K-2 | **Grimm Fairy Tales** | `rpg` ,  a party of tale creatures that each bring a shape |
| 7 | **Neverland Navigation ,  Maps and Scale** | Geography + ratios, grades 5-6 | **Peter Pan** | `dungeon` ,  Neverland charted room by room |
| 8 | **Treasure Island ,  Fractions of the Crew's Share** | Math ,  fractions and economics, grades 5-6 | **Treasure Island** | `rpg` ,  shares as loot, mutiny as the boss fight |
| 9 | **Journey to the Center ,  Plate Tectonics** | Earth science, grades 6-8 | **Journey to the Center of the Earth** | `dungeon` ,  each depth is a layer of the earth |
| 10 | **Around the World in 80 Days ,  Ratios, Time, and World Geography** | Math + geography, grades 6-8 | **Around the World in Eighty Days** | `rpg` ,  the party is the traveling company, loot is timetables and tickets |
| 11 | **Frankenstein and Life ,  Cells to Systems** | Biology + ELA, grades 9-10 | **Frankenstein** | `cyoa` ,  choices are ethical, not just correct/wrong ,  the old Verne course's mature counterpart |
| 12 | **Dumas on Power ,  World History Through the Musketeers** | World history / civics, grades 9-12 | **The Three Musketeers** | `cyoa` ,  loyalty and oath as choice branches, boss is a trial before the king |

Each course is 2-3 units, 6-9 lessons, 15-24 exercises, one project, strict `coursecheck` shape. World templates live under `server/templates/adventures/<slug>.json` (model for the AI prose pass) or are hand-seeded for the first wave so the story is precise before we let a model touch it.

---

## 7. Character, art, and loot design ,  detailed per course (example)

**Wonderland Fractions** (the most taught course ,  exemplar for the rest):

- **Characters** (approved, in `adventure_characters`): Alice (self-insert, learner-tinted), White Rabbit ("always late, checks the watch" ,  anxiety as a trait, not a punchline), Cheshire Cat (speaks in riddles, hints without answers), Queen of Hearts (the boss ,  a trial of fairness: split the tarts so every guest gets the same amount).
- **Chapter art** via `questgen.chapterPrompt`: "A teatime table stretching without end, tarts of different sizes, warm storybook, no text."
- **Encounters, beat by beat:**
  - Ch 1 scene: the Rabbit's hall of doors ,  each door a different denominator. Requires: lesson 1 done.
  - Ch 1 puzzle: choose the bigger slice when the cuts match. Reward: a tart (common) + 10 XP.
  - Ch 2 choice: follow the Cat's riddle path or the Hatter's endless table. Both converge, neither punishes.
  - Ch 2 battle: the Queen's croquet ground where unlike pieces must be renamed. Reward: the Queen's tart-knife (rare ,  unlocks the "cut everything into twelfths" shortcut puzzle).
  - Boss: the Cheshire riddle-retort ,  5-in-a-row on renaming fractions (boss authority, `boss_run`). Win cutscene is optional video.
- **Loot with meaning:** honey-of-wonder tart (keepsake), Cheshire smile token (hint reveal: "make the pieces the same size first"), door key (map fragment). Each description names its chapter.
- **Project:** "Draw your own Wonderland tart table: cut three tarts into halves, thirds, and sixths and show where `one half` sits on all three."

Every other course gets the same depth: a one-page character sheet, a three-beat-per-chapter outline, and a loot table with chapter citations. That page is what an illustrator and a reviewer can argue about in one session.

---

## 8. Mix of game types ,  why it will be fun

A player who plays the first four in order experiences `cyoa → dungeon → story → story`, so the verbs change: choose, deduce, observe a season, map. A completist who plays all 12 sees each type three times, never back-to-back. Minibosses guard chapter stairs; only true bosses require a streak, so early chapters feel playful and late chapters feel earned. The learner inventory becomes a shelf of small, named keepsakes from beloved books ,  the collecting impulse that already sells a hundred kids' games, but now each keepsake is a fact they can state.

We will also ship one pure `rpg` party course (Around the World) where loot changes what the party can do, because a single RPG showcase wins a jury that values depth over breadth.

---

## 9. Build and validation loop ,  how we avoid shipping wrong courses fast

1. Write the course JSON by hand in `docs/examples/<slug>/course.wow-course.json` (copy `comparing-fractions.wow-course.json` shape).
2. Run `npm run validate-course -- --library docs/examples` locally ,  must be clean. `coursecheck` already mirrors the import normalizer.
3. Run `npm run check` (em-dash ban + lint) and `npm test` (coursecheck parity + grading).
4. Play the course as a learner on a scratch family (or `DEMO_SINGLE_FAMILY` demo) ,  every lesson, every question, the boss streak.
5. Generate or hand-place the world: `POST /api/adventures` with `game_type`, encounters, then `POST .../world-beats` and `POST .../art` (costs KIE credits, so we do it once per course and review).
6. Screenshot the journey view, the boss fight, and the inventory strip for the PR and the README.
7. PR to `main` with the checklist ticked. Merge only when both readers sign.

Estimator before shipping wave 1: one real playthrough by a 10-year-old and a parent watching over the shoulder. That hour will find more than any linter.

---

## 10. Funding and "Git of the week" angle

Funders and award programmes respond to three signals, in order: **craft**, **community**, and **distribution**.

- **Craft:** the four flagship courses are the portfolio. One teacher opening Wonderland Fractions and seeing the tarts, the riddles, and a boss that tests a real skill is more persuasive than any deck. Quality beats count.
- **Community:** every course is CC-BY-4.0 in `docs/examples` and validatable without the app. `community-courses` import is one paste, no git. That is the open-source story GitHub will feature: a repo that *is* a library.
- **Distribution:** the courses are plain JSON. A second instance imports them by URL. A researcher reads the `.txt` render. Search engines see `Course` JSON-LD and `llms.txt`. The artefact outlives the app, which is exactly what a foundation funds.

Launch note to recommend to Kevin when wave 1 is ready: a single Show HN / r/homeschool / awesome-selfhosted post framed as "we built 12 K-12 courses inside public-domain children's books ,  each is a playable game, each is CC-BY, each passes the same validator our app uses." Demo link on top, tarball link second, checklist and PD note in the README. That is the Git of the Week shape.

---

## 11. Execution order for Well 2

| Week | Work | Deliverable |
|------|------|-------------|
| **Week 1** | Draft Wonderland Fractions + Holmes Observes by hand, with their world JSON and loot tables. Validate, play, fix. | 2 published courses + 2 illustrated worlds, plus the checklist template reused thereafter |
| **Week 2** | Oz Maps + Willows River (pair with field science), then Pooh Counts + Grimm Numbers. | 6 courses covering K-5 across all families |
| **Week 3** | Neverland + Treasure Island + Journey to the Center + Around the World. | 10 courses, middle-school core complete |
| **Week 4** | Frankenstein Bio + Dumas History, sweep pass: cross-course art-house check, accessibility sweep, portfolio review with a real teacher. | 12 courses, README gallery refresh, community-courses bulk import tested, Show HN draft ready |

Well 1 can continue parallel core work on `main` without conflict; Well 2 rebases this branch onto `main` before each PR.

---

## 12. Open questions to resolve before art spend

- Confirm with Kevin: house illustration style prompt (current `questgen` prompt is warm storybook painterly, no text ,  keep or tighten).
- Confirm the single self-insert name per learner vs. using the learner's own name as the `self` character.
- Choose whether high-school literature courses also quote short Gutenberg excerpts inline (my recommendation: yes, 1-2 sentences per unit, cited).

---

*Branch: `courses/well2-ip-curriculum` · Worktree: `../wellofwisdom-well2` · Next commit: this plan + the directory scaffold for wave 1 courses.*
