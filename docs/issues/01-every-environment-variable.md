# Document every environment variable in one page

Labels: `good first issue`, `docs`
Size: small, one evening
Files: `docs/CONFIG.md` (new), and one link each in `README.md` and `docs/OPERATIONS.md`

## What

Right now the only place a self-hoster can learn what a variable does is
`.env.example` and a grep through the code. Write one page: every variable, one
line each, its default, and what breaks when it is wrong.

## Steps

1. List what the code actually reads:

   ```bash
   grep -rhoE "process\.env\.[A-Z0-9_]+" server scripts | sort -u
   ```

2. Read `.env.example` and keep its grouping.
3. For each variable write: name, what it does, the default, and the failure
   mode. Example row: `TRUST_PROXY`, how many proxies sit in front, `1`, and
   "set it wrong and the login limiter can be spoofed or the real IP is lost".
4. Group them: database, sessions and security, AI, media and uploads, mail,
   demo and signup, performance and limits.
5. Link the page from the README docs table and from `docs/OPERATIONS.md`.

## Done when

- [ ] Every variable the code reads appears exactly once.
- [ ] No variable appears that the code does not read.
- [ ] Names and defaults only. No value, key or password is copied in.
- [ ] The failure mode is a real one, not a guess.
- [ ] `npm run check` passes.

## Hints

- A variable read in two files still gets one row. Say "used by" and name the
  files if that helps the reader.
- Some variables are read once and matter a lot (`COOKIE_SECURE`), others are
  read in a loop (the `AI_*` family). Put the important ones first in each group.
