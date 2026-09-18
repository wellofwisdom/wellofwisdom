# Operations: running wellofwisdom.app

The hosted instance, how it is deployed, verified, tested and backed up. This is the part of the maintainer handoff that belongs in the repo. It contains no credentials: every secret is referenced by where it lives, never by value.

## Where things are

| Thing | Where |
|---|---|
| Live app | https://wellofwisdom.app (Cloudflare proxied, A record to the Hetzner box) |
| Hosting | Coolify on a Hetzner server, one app plus one Postgres container (`wow-postgres`, `postgres:16-alpine`) on the `coolify` docker network |
| Uploads | Coolify persistent volume mounted at `/app/data` (without it every deploy deletes every upload) |
| Database volume | `wow-pgdata` |
| Secrets | A local file outside the repo that the maintainer keeps; Coolify env for the running app; `server_settings` rows for anything set through the in-app Settings page (email, media, AI vault). Rows override env. |
| Backups | Nightly 04:10 cron on the server to `/root/wow-backups/*.sql.gz`, seven days kept |
| Email | SparkPost, configured in Settings, sending from `learn@wellofwisdom.app`; `bounce.wellofwisdom.app` is a CNAME to SparkPost (never add a CNAME at the root, it breaks the A record) |

## Environment the hosted instance needs

Beyond `.env.example`:

- `COOKIE_SECURE=true` behind TLS.
- `TRUST_PROXY=1` (the default) for Traefik, plus `CLIENT_IP_HEADER=cf-connecting-ip` because Cloudflare sits in front of it: Traefik rewrites `X-Forwarded-For` to Cloudflare's edge address, so without the header every visitor through one edge would share a rate limit. A plain self-host behind one proxy uses `1` alone; an app exposed with no proxy uses `false`. Never `true` on a public instance: it lets a client choose its own address and defeats the login rate limit. `CLIENT_IP_HEADER` is only safe when the origin cannot be reached except through Cloudflare (firewall the box to Cloudflare's ranges).
- `CSP_MODE=enforce` (default). Set `report` to watch the browser console for violations before enforcing on an unusual setup, `off` only while debugging.
- `SIGNUP_INVITE_CODE` set, so only invited families join while AI keys are configured.
- `DEMO_MODE=true` and `DEMO_SINGLE_FAMILY=true` for the public demo.
- `GOOGLE_CLIENT_ID` for Continue with Google.
- `UPLOAD_DIR=/app/data/uploads` (the image default).

Coolify env changes are DELETE plus POST through the API; PATCH silently does nothing. One key per call, and do not send `is_build_time`.

## Deploying

Deploys are not automatic. Push to `main`, then trigger the Coolify app start endpoint with the Coolify API token (kept outside the repo). Then verify. A green push is not proof of anything.

### Verification ritual

On the server:

1. Deployment queue: the latest row for the app must read `finished` with the commit you pushed.
2. Container: `docker ps` shows the app container up with a fresh start time.
3. Logs: the last five minutes show migrations applied and the listen line, which now prints the CSP mode and the trust proxy setting.
4. Health: `curl -s https://wellofwisdom.app/api/health` returns `ok: true`, `db.ok: true`, `ai.configured: true`.
5. One real page: open `/c` and one public course, and check the response carries a `content-security-policy` header and an `x-request-id`.

The app container has no `curl`, and `docker exec` runs the deployed image, not your working tree. To exercise new server code end to end, deploy it first or run it on the host against the container IP.

## Testing against a scratch database

Never test against the production database. Create a scratch database on the server's Postgres (`wow_smoke` owned by a throwaway user), run the local server against it with `DATABASE_URL` pointing at a tunnel or at the container IP, drive it with `curl` and a cookie jar, and drop the database when done.

Two gotchas learned the hard way:

- An `ssh -L` tunnel to the docker network does not work from an agent sandbox: the port binds, connections are refused. Pipe a `.sql` file to `psql` over ssh instead, wrap assertions in a `do $$ ... raise exception ... $$` block, and end with `rollback;`.
- Postgres `bigint` columns come back as strings from `pg`. Convert with `Number()` at the API boundary (`server/lib/learners.js` is the pattern), never at each call site.

## Backups and restore

- Nightly `pg_dump` to `/root/wow-backups`, gzipped, seven days kept. Uploads live on the `/app/data` volume and are not in the dump; back the volume up separately.
- A restore drill is: create a scratch database, `gunzip -c` the dump into it, boot the app against it with a scratch `UPLOAD_DIR`, sign in, open a course. Do this before any migration that touches existing rows.
- Whole-family export from the app is on the roadmap (Well 9). Until it ships, the dump is the family's only complete copy.

## Recurring jobs

- `server/lib/jobs.js`: Postgres queue with `SKIP LOCKED`, in-process sweeper. Course generation, media, narration and music run here.
- `server/lib/digest.js`: weekly digests and tomorrow reminders on a schedule inside the same process.
- Both start only when `DATABASE_URL` is set. One container runs web and jobs together; a split into web replicas plus a worker is a role selector away (see `docs/ARCHITECTURE.md`).

## Providers

- AI: any OpenAI-compatible endpoint, Claude, or Gemini, selected in the AI vault (Settings) or by env. Every call goes through `fetchT` (timeout plus retry). Accounting and caps are enforced before generation and fail open, never blocking learning.
- Media (images, video, voice, music): kie.ai jobs API. The key lives in `server_settings.media` set from Settings, which overrides the `KIE_API_KEY` env. kie wraps business errors in an HTTP 200 with a non-200 `code`; check both. Shape: `createTask` then poll `recordInfo` for `resultUrls`.
- Email: SparkPost via Settings. DKIM and the bounce CNAME are at Cloudflare.

## Rotating a key

1. Mint the replacement in the vendor dashboard.
2. Install it where it is read: Settings page for email and media and the AI vault, Coolify env for anything read from env.
3. Redeploy if an env changed.
4. Verify the new key with a real call (health shows AI configured; send a test email; generate one image).
5. Verify the old key is dead with a call that now returns 401.
6. Delete the old key at the vendor.

Any key that has appeared in a chat transcript, a log, a screenshot or a commit is treated as leaked and rotated the same day.

## Coolify API notes (beta.474)

- Create app from a public repo: `POST /api/v1/applications/public`; the repository field wants the full URL and the branch field is `git_branch`.
- Set the domain with `PATCH /api/v1/applications/{uuid}` and the field `domains`.
- Env: `POST /api/v1/applications/{uuid}/envs`, one key per call.
- The deployment queue query needs `a.id::text = q.application_id`.

## Install verification (generator v2)

After a fresh install or a database reset, confirm the generator path works without an AI key:

```
npm run verify:install
```

It boots the server with `DB_DRIVER=pglite` against a fresh temp dir, runs migrations, and exercises the outline then per-lesson generation end to end with mocked AI. It also proves language plumbing: `language=es cefr=A1` surfaces `vocab_card`, `listen_choice`, `listen_repeat` in the kind menu while a non-language course still produces the same 1-unit shapes. The temp dir is removed on exit.

For a full pglite test sweep:

```
npm run test:pglite
```

## House rules that bite in production

- Every outbound server fetch goes through `fetchT`; a bare `fetch` hangs forever when a provider stalls.
- Every AI output passes the normalizer in `server/lib/coursegen.js` before it is stored. Never persist raw model JSON.
- Grading is server-side only. The learner API strips answers, explanations and hints.
- Every query is family-scoped from the session.
- Fail open on the side features (accounting, badges, XP, review scheduling): a `.catch(() => {})` there is deliberate.
- No em dashes anywhere. `npm run check` fails the build on one.
