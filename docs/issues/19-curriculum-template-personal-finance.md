# Add a personal finance curriculum template

Labels: `good first issue`, `curriculum`, `docs`
Size: small, one evening
Files: `server/templates/plans/personal-finance.json` (new)

## What

The app ships five year-long plan templates that need no AI key: Algebra 1, US
History, Biology, Intro to Python and Creative Writing. Adding one is one JSON
file, and it is the easiest way to help a family that does not have an AI key.
This one is for personal finance, which every homeschool asks for.

## Steps

1. Read `server/templates/plans/algebra-1.json`. Copy its shape exactly: `id`,
   `title`, `subject`, `description`, `suggestedWeeks`, then `milestones`, each
   with `title`, `description`, `projectIdea` and `resourceHint`.
2. Write 12 to 18 milestones for a year. Order them so each one needs the one
   before it: earning, budgeting, banking, credit and debt, interest, insurance,
   taxes, giving, investing, and a capstone.
3. Every `projectIdea` has to be something a family can actually do at home with
   no budget. "Track the household grocery spend for two weeks and find three
   cuts" beats "open a brokerage account".
4. Keep `resourceHint` to a real, named, free resource. Do not invent a link.
5. Confirm it loads: `GET /api/plans/templates` should list it and
   `GET /api/plans/templates/personal-finance` should return the milestones.

## Done when

- [ ] The file parses and appears in the plan wizard with no AI key configured.
- [ ] Every milestone has all four fields, none empty.
- [ ] The tone matches the existing templates: plain, specific, no hype.
- [ ] No em dash anywhere. `npm run check` fails on one.
- [ ] `npm run check` passes.

## Hints

- Read `server/templates/plans/us-history.json` as well as `algebra-1.json`. The
  two together show how much variation is welcome in the wording.
- The loader skips a file it cannot parse without any message, so a typo looks
  like a missing template. Test by loading it, not by reading it.
