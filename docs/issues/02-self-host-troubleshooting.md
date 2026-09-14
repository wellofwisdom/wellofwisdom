# Add a troubleshooting section to docs/OPERATIONS.md

Labels: `good first issue`, `docs`
Size: small, one evening
Files: `docs/OPERATIONS.md`

## What

The first boot is where self-hosters give up. Add a troubleshooting section to
`docs/OPERATIONS.md` covering the failures people actually hit, each as a
Symptom, a Cause and a Fix.

## What to cover

Write one entry for each of these. Add any others you hit while testing.

1. The log says `[migrate] FAILED`. The app still boots on purpose, degraded,
   but nothing you save will work. Usually the database is not ready or
   `DATABASE_URL` points at the wrong host.
2. Login says `too_many_attempts` after a few tries. The limiter allows 10
   attempts per 15 minutes per IP, and a wrong `TRUST_PROXY` makes every visitor
   look like the same one.
3. Cookies do not stick behind HTTPS. `COOKIE_SECURE` and the proxy hop count
   both have to be right.
4. Uploaded video and images vanish after a rebuild. The compose file mounts a
   volume for `/app/data`; a hand-rolled run without it loses them.
5. The boot line says `ai=off`. Everything except course generation still works.
   Name the variables to set and say so plainly.
6. A large paste answers `payload_too_large`. Point at `IMPORT_BODY_LIMIT`.

## Done when

- [ ] Every entry has all three parts: Symptom, Cause, Fix.
- [ ] The commands are copy-pasteable and correct.
- [ ] No keys, tokens or passwords, not even as examples.
- [ ] A reader who has never seen the code can follow it.
- [ ] `npm run check` passes.

## Hints

- Test each fix on a scratch database before writing it down. A guess that does
  not work is worse than no entry.
- The boot line prints db, ai, csp and trustProxy state. Tell the reader to read
  it first, because it answers half of these questions.
