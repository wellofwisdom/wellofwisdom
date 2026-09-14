# Add a health check for the app container

Labels: `good first issue`, `docker`
Size: small, one evening
Files: `docker-compose.yml`, `Dockerfile` (only if a tool is missing)

## What

The database container has a health check. The app container does not, so
`docker compose up` reports the app as running the moment the process starts,
even if migrations failed and it is up in the degraded state. The app already
answers `GET /api/health` with the database and AI state inside.

## Steps

1. Read `docker-compose.yml`. The `db` service shows the pattern to copy.
2. Add a health check to the `app` service that calls `/api/health` and checks
   for a 200. Use a tool the image actually has: check the `Dockerfile` first.
   Node is there, so a one-line `node -e` with `fetch` works and adds nothing
   to the image.
3. Set sensible timing: a 10 second interval, a 5 second timeout, and a start
   period long enough for the first migration run.
4. Confirm the states: `docker compose ps` should show `healthy` when the app is
   serving and `starting` while migrations run.

## Done when

- [ ] `docker compose up -d` then `docker compose ps` shows the app healthy.
- [ ] With the database stopped, the app reports unhealthy rather than healthy,
      because `/api/health` reports the database state.
- [ ] No new image dependency was added, or the reason is explained.
- [ ] The README self-host block still works word for word.

## Hints

- `/api/health` always answers 200 while the process is up, and reports the
  database inside the body. If you want the container to go unhealthy when the
  database is down, check the body, not only the status code.
- Keep the check cheap. It runs every ten seconds forever.
