# Community courses

Courses in Well of Wisdom are plain JSON (`.wow-course.json`), the same file the
course page's **Export** button downloads and the **Import** dialog reads. That
makes a shared library a Git repository: one folder per course, a pull request
to add one, CI that checks every file the way an import will read it, and any
instance importing straight from a link. The project grows with its content,
and a fork inherits all of it.

## Layout

```
community-courses/
  courses/
    comparing-fractions/
      course.wow-course.json
      README.md            optional: who it is for, what it needs, credits
    latin-first-declension/
      course.wow-course.json
  .github/workflows/validate.yml
```

One course per folder, named with a short slug. The file inside is always
`course.wow-course.json`.

## What a course needs to be accepted

`node scripts/validate-course.js --library courses` passes. It checks, file by
file, and names the place of every problem (`unit 2, lesson 3, item 4`):

- **An open licence**: `CC-BY-4.0`, `CC-BY-SA-4.0` or `CC0-1.0`. A library is
  for adapting and passing on, so "all rights reserved" is not accepted here,
  though it is a fine choice on your own instance.
- **Every question has its answer.** A course exported with "share answers"
  unticked leaves the keys out; that is right for a public page and wrong for a
  library, because the teacher who imports it has to grade. Export it with
  answers included.
- **Nothing is lost on import.** An item the importer cannot use (a multiple
  choice question with one choice, an empty article) is named, and so is
  anything past the size of a course: 6 units, 5 lessons a unit, 8 items a
  lesson, 5 choices a question, 4 questions a video.

The check needs no database, network or AI key. It reads files.

`docs/examples/comparing-fractions.wow-course.json` in this repository is a
small complete course to copy from.

## Adding a course

1. Build and review it on any instance. Read every question and its answer:
   generated courses are drafts until a person has checked them.
2. On the course page, **Export**. The file includes the answers.
3. Put it at `courses/<slug>/course.wow-course.json`, add a `license` if the
   file has none, and open a pull request.

## Importing one

In any instance: **Courses, Import, Paste a shared course link**, and paste the
link to the file on GitHub. The file page link works (the importer fetches the
raw file behind it), and so does a raw link. The course lands as a draft in your
own library, to review before learners see it.

## The CI workflow

The community repository runs this repository's validator, pinned to a release
so a change here never breaks a pull request there without warning:

```yaml
name: Validate courses
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: wellofwisdom/wellofwisdom
          ref: main            # pin to a release tag once there is one
          path: wow
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm --prefix wow ci --omit=dev
      - run: node wow/scripts/validate-course.js --library courses
```
