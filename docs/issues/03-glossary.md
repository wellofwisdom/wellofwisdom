# Add a glossary for the two vocabularies

Labels: `good first issue`, `docs`
Size: small, one evening
Files: `docs/GLOSSARY.md` (new)

## What

The app speaks two languages and a newcomer meets both in the first hour. The
grown-up side says guide, learner, family, plan, resource, report. The game side
says world, encounter, boss, loot, reward, dailies, stamina, mastery star. Write
one page that defines both, one sentence per term.

## Steps

1. Read `docs/DESIGN.md` and `docs/ARCHITECTURE.md` first. Use the words they
   already use, so the glossary does not invent a third vocabulary.
2. Write two sections: "The grown-up side" and "The learner's game".
3. One sentence per term. Where a term has a source of truth in code, name the
   file in brackets, for example `lens (server/lib/coursegen.js)`.
4. Cover at least: guide, owner, assistant, observer, learner, family code,
   lens, plan, milestone, course, unit, lesson, item, attempt, submission,
   review queue, report, portfolio, and on the game side: world, encounter,
   boss, loot, inventory, reward, companion, HUD, dailies, weeklies, stamina,
   mastery star, streak, badge, XP, vault, preview.

## Done when

- [ ] Two sections, alphabetical in each.
- [ ] One sentence per term, no more.
- [ ] No term is defined that the app does not use.
- [ ] The README docs table links the page.
- [ ] `npm run check` passes.

## Hints

- If two terms mean the same thing, say so instead of repeating the sentence. A
  glossary that clarifies "guide is what the UI calls a parent" saves a reader
  real confusion.
