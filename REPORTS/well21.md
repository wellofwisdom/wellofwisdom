# Well 21 launch checklist

## Summary

Well 21 scope: docs/OPERATIONS.md, docs/COMMUNITY-COURSES.md, README.md, web/public/og* and screenshots. No migration. Verified one command install, pricing anchor, backup and 30 day wording, legal pages, and README assets. All five gates passed. One non-blocking note on demo gif.

## One command install

* Command under test: `git clone ... && cd wellofwisdom && docker compose up -d`, opens `http://localhost:3000`, first account owns the family.
* This box cannot run docker (`docker` not found), so docker compose up was not executed here. Verified statically instead:
  * `docker-compose.yml` is intact: `app` + `db` (postgres:16-alpine), `uploads:/app/data` volume, `pgdata` volume, healthcheck, and `local-ai` ollama profile.
  * `Dockerfile` is a two stage build (node:20-alpine), `npm ci`, `npm --prefix web ci`, `npm run build`, runtime stage copies `web/dist`, `server`, `public`, `docs/examples`.
  * `README.md` Self host in 30 seconds section matches the compose file exactly.
* `npm install` (root 154 packages) and `npm --prefix web install` (272 packages) both clean. `npm run verify:install` passed (pglite temp dir, 43 migrations, outline 1 unit 2 lessons, language plumbing es/fr, per lesson generation, temp dir removed). `node scripts/validate-course.js docs/examples/french-a1/course.wow-course.json` passed (2 units, 6 lessons, 38 items, 17 questions, CC-BY-4.0).

## Pricing section and /#pricing

* The anchor is live, not dead. `web/src/pages/Landing.tsx` renders `<section id="pricing">` ("Own it free, or let us run it") with Self-host free, Hosted for families ($9), Schools co-ops districts (Let's talk). All three plans have real copy and CTAs.
* Four references to `/#pricing` all resolve to that id: `web/src/site/SiteChrome.tsx` (nav Pricing link and footer Product Pricing, both smooth scroll on /), `web/src/pages/Landing.tsx` (school CTA scrolls to pricing and focuses waitlist email), `web/src/components/DemoBanner.tsx` (See pricing), `web/src/pages/Settings.tsx` (admin note: form lives at #pricing). `Landing.tsx` also has a hashchange listener so a direct `/#pricing` load scrolls correctly. No fix needed.

## Backup and 30 day deletion wording

All three surfaces use the same numbers and plain language:

* `docs/OPERATIONS.md`: Backups row says nightly 04:10 to `/root/wow-backups/*.sql.gz`, seven days kept. Backups and restore section adds pg_dump gzipped 04:10 seven days, uploads live on `/app/data` not in dump, hosted is automatic (seven daily DB copies plus persistent uploads volume), deletion on hosted within 30 days and ages out as rotation expires, self-host deletion immediate, waitlist removed same way, contacts `privacy@` and `support@`, and notes whole-family export roadmap plus that Privacy and Children's pages state the same 30 day wording.
* `web/src/pages/legal/Privacy.tsx`: Retention and deletion says close a hosted account via `privacy@wellofwisdom.app`, removed within 30 days and ages out as rotation expires, waitlist same, plus the backups paragraph says nightly 04:10 seven daily copies and uploads on separate volume.
* `web/src/pages/legal/Children.tsx`: Hosting paragraph is word for word the same 04:10, seven daily copies, separate volume, within 30 days, ages out.
* No 30-day inconsistency found. Nightly 04:10 and seven day retention are stated in all three places. No edit made here.

## Legal pages

* `web/src/pages/legal/Privacy.tsx` (updated 16 September 2026): short, what we collect, what leaves your box (self-host vs hosted), how we store and protect, retention and deletion (within 30 days), cookies, contact `privacy@` and `support@`. No third party trackers or sale of data.
* `web/src/pages/legal/Children.tsx` (same date): what we store about a child, what leaves your server, how a parent reviews and deletes, hosting (same 30 day wording), contact via guide and `privacy@` for hosted.
* `web/src/pages/legal/Terms.tsx` (same date): short version, licence AGPL-3.0, what you agree to, guides and learners, AI, availability, liability, changes, contact `support@`, `privacy@`, `kevin@`.
* `server/lib/site.json` registers all three as `section: legal` (`privacy`, `terms`, `children`), plus `LegalChrome` and `web/src/site/SiteChrome.tsx` footer link them under Trust.
* Copy is short, scannable, plain English. No changes made.

## README, og and screenshots

* `README.md` hero uses `docs/brand/logo-512.png`, `web/public/og.png` (1200x630 per `web/index.html` og:image), and the demo video note points at `web/public/demo.gif` under 8 MB (or `demo.mp4`).
* `web/index.html`: `og:image` is `https://wellofwisdom.app/og.png` with 1200x630, plus twitter:card large image.
* `web/public/og.png` 43,419 bytes, 1200x630 PNG. `shot-world-map.png` 34,506 bytes 1200x720, `shot-studio.png` 47,396 bytes 1200x720, `shot-report.png` 39,909 bytes 1200x720. All valid PNG, correct marketplace dimensions.
* `web/public/demo.gif` and `demo.mp4` do not exist yet. README describes exactly how to capture them (1440x900, two path nodes, one lesson right and wrong, boss win, ScreenToGif 12 fps, under 8 MB). This is the one Well 21 gap to close before launch if a motion preview is desired; the three still shots already cover the same views.
* `docs/COMMUNITY-COURSES.md` untouched and correct. `docs/OPERATIONS.md` one-line fix already on branch: French pack note switched from "on its own branch ... once that pack is on main" to "at docs/examples/french-a1/course.wow-course.json proves the same for language=fr, and node scripts/validate-course.js ... reports no missing answers" (commit 76ee61d from dac4dd2).

## Five gates

| Gate | Command | Result |
| --- | --- | --- |
| build | `npm run build` | ok, 5.31s |
| web lint | `npm --prefix web run lint` | ok (2 warnings, 0 errors, pre-existing hook deps) |
| check | `npm run check` | ok, 150 server files, no em dashes |
| server tests | `npm test` | 772 pass, 0 fail |
| web tests | `npm --prefix web test` | 186 pass, 21 suites |
| install probe | `npm run verify:install` | ok (pglite, mocked AI end to end) |
| french pack | `node scripts/validate-course.js docs/examples/french-a1/...` | ok (1 of 1) |

Docker compose up was not runnable on this Windows box (no docker binary). All other gates run on every push via CI on ubuntu with postgres:16 service and will also cover build and lint there.

## Open item

* Record `web/public/demo.gif` under 8 MB per README instructions (or ship `demo.mp4` with a video tag) if launch wants motion in the hero. Not blocking for the doc and anchor checklist, but it is in Well 21 scope.

## Branch

`well21/launch-checklist` from `dac4dd2`, one commit ahead (`76ee61d` French pack note). Working tree clean. No migration.
