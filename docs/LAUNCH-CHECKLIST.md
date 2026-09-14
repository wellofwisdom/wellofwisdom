# Launch checklist

From section 6 of `docs/REVIEW-AND-PLAN-2026-09-13.md`, as boxes with an owner.
The plan behind the order is there if you want the reasoning.

Owners are named as the person or the work stream that owns the result, not the
paperwork. Kevin owns the outward facing steps because they need one voice.

## Before launch (week 0, about five days)

- [ ] The four High items from the review are merged: secrets rotated and moved
      out of the handoff, `TRUST_PROXY`, the Content-Security-Policy, and
      `docs/OPERATIONS.md`. Owner: Well 4.
- [ ] `package.json` says `0.1.0` instead of `0.0.1`, so the version on screen
      matches the tag and the image. Owner: Kevin.
- [ ] Tag `v0.1.0` and publish the image, so `docker pull` finds it. Owner: Kevin.
- [ ] README: the GIF, the one-line pitch, three screenshots, the comparison
      table, and the "self-host in 30 seconds" block. The slots and the recording
      steps are already in the README. Owner: Kevin.
- [ ] Twenty good first issues pasted in, Discussions enabled, and the topics
      set: `hacktoberfest`, `education`, `homeschool`, `self-hosted`, `lms`, `ai`.
      Owner: Kevin. Drafts are in `docs/issues/`.
- [ ] The demo is seeded with real work and "Play as the learner" is the first
      button. Owner: Well 8.
- [ ] `/privacy`, `/terms` and `/children` are live and linked from the footer
      and the sign-up form. Owner: Well 7.
- [ ] The "Trusted by" quotes are gone unless those are real people who agreed
      to be quoted. Replace with true numbers. Owner: Well 7.
- [ ] The keyword chips have become four real pages, One Tap waits for a scroll
      or three seconds, the pricing card shows a number, and the two sample
      downloads work. Owner: Well 7.
- [ ] The landing bundle is under 150 kB gzipped and the chunk warning is gone.
      Owner: Well 5.

## Launch day (week 1, one day, everything at once)

- [ ] Show HN at 8 to 9 am Eastern on a Tuesday or Wednesday. Title and first
      comment written in advance; the comment covers the architecture, the trust
      boundary, why AGPL, and what does not work yet. Owner: Kevin.
- [ ] The same morning: r/selfhosted, r/homeschool, r/opensource and r/Teachers.
      Read each sub's self-promotion rules first. Owner: Kevin.
- [ ] Lobsters if there is an invite, Mastodon with `#selfhosted #education`,
      Bluesky. Owner: Kevin.
- [ ] Product Hunt the same day or the day after. Owner: Kevin.
- [ ] Submit to `awesome-selfhosted` (needs the release and the image, which is
      why week 0 tags one), `awesome-education`, `awesome-lms`, and the selfh.st
      and noted.lol newsletters. Owner: Kevin.
- [ ] Email five homeschool YouTubers and podcasters with the demo link and an
      offer of a free hosted family. Owner: Kevin.

## Weeks 2 to 6 (keep the curve up)

- [ ] One release a week, each with a changelog entry. Owner: Kevin.
- [ ] One "how we built X" post: the trust boundary, the spaced review
      scheduler, the audio cache, or the Postgres job queue with `SKIP LOCKED`.
      Owner: Kevin.
- [ ] Answer every issue within a day for the first month. Owner: Kevin.
- [ ] First named pilot, three families or one co-op, written up as a case study
      on the site. Owner: Kevin.

## Running in parallel from week 1

- [ ] NLnet NGI Zero Commons Fund, the short form. The best fit of the grants.
      Owner: Kevin.
- [ ] Digital Public Goods Alliance registration. Needs the privacy policy and a
      documented data model, both of which week 0 already asks for. Owner: Kevin.
- [ ] The Tools Competition when the autumn call opens. Needs a pilot with data.
      Owner: Kevin.

## Do not do these on launch day

- Do not deploy anything. The launch is a post, not a release. Owner: Kevin.
- Do not push a hotfix straight to `main`, however small. Owner: Kevin.
- Do not promise a date for Steam, the desktop build, or the language work.
  Owner: Kevin.

## The gate before anything is posted

Run these on `main` after the last merge, not on a branch:

- [ ] `npm run check && npm test && npm --prefix web run build` all green.
- [ ] `docker compose up -d` from a fresh clone, then sign up as a new family.
- [ ] The demo in a private window: Recent activity, Progress, Attendance, Work
      and a report all have content.
- [ ] The sign-up form links to the privacy page, and the link works logged out.
- [ ] The landing page in a private window: no One Tap over the hero, four
      comparison pages reachable from the footer, and both sample downloads open.
- [ ] One learner run through a lesson on a phone.
- [ ] `/robots.txt`, `/sitemap.xml` and `/llms.txt` answer with the live origin.

If any of those fail, post nothing, fix it, and go the following Tuesday.
