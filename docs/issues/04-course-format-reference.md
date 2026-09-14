# Document the course package format field by field

Labels: `good first issue`, `docs`
Size: small, one evening
Files: `docs/COURSE-FORMAT.md` (new), one link in `docs/COMMUNITY-COURSES.md`

## What

`docs/COMMUNITY-COURSES.md` explains why the format exists and how to share a
course. A contributor who wants to hand-write one needs the exact fields. Write
that reference.

## Where the truth lives

- `server/lib/share.js`: the package that export writes and import reads, and
  the list of allowed licences.
- `server/lib/coursecheck.js`: what passes the library check, and the reasons a
  package is refused.
- `docs/examples/comparing-fractions.wow-course.json`: a real package you can
  read next to your notes.

## Steps

1. Read the three files above.
2. Document the top level fields with type and whether they are required.
3. Document a unit, then a lesson, then each item type (`article`, `exercise`,
   `video`, `project`) with the content fields of each.
4. List the allowed licences, taken from the code, not from memory.
5. Finish with a minimal valid package a reader can paste into a file and import.

## Done when

- [ ] Every field you document is one the code reads. Check each with a grep.
- [ ] The licence list matches the code exactly.
- [ ] Every item type in the doc appears in the item registry.
- [ ] `npm run validate-course docs/examples/comparing-fractions.wow-course.json`
      still prints OK, and you did not have to change the file to make it pass.
- [ ] `npm run check` passes.

## Hints

- `npm run validate-course` takes a file or a folder and explains what it did
  not like. Use it to check a package you write while documenting.
- Say what happens when a question has no answer key. It is the most common
  thing a hand-written package gets wrong.
