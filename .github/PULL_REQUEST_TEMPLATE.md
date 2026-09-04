<!-- Thanks for contributing to Well of Wisdom. Keep this short and honest. -->

## What this changes

<!-- One or two sentences. What does a user or a guide get, or what is fixed? -->

## Why

<!-- The problem it solves. Link an issue with "Closes #123" if there is one. -->

## How it was checked

Before pushing, this repo expects all three to pass:

- [ ] `npm run check` (lint plus the whole server test suite, and it fails on an em dash)
- [ ] `npm test`
- [ ] `cd web && npm run build`

And, where it applies:

- [ ] New behaviour has a test, especially anything on a trust boundary
      (answer keys, family scoping, an AI output crossing the normalizer, a
      URL that gets fetched).
- [ ] No answer, explanation or hint can reach the public course surface.
- [ ] No secrets, keys or private URLs in the diff.
- [ ] No em dash anywhere: code, comments, UI copy, docs, commit message.

## Notes for the reviewer

<!-- Anything easy to get wrong, a decision you are unsure about, a follow-up
     you deliberately left out. -->
