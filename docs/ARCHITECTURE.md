# Architecture

Well of Wisdom ships as **one codebase and one Docker image**, deployed two ways:

| | Self-hosted (free, forever) | Well of Wisdom Cloud (ours) |
|---|---|---|
| Install | `docker compose up -d` | managed fleet |
| Database | local Postgres container | managed Postgres + pgBouncer |
| Storage | local volume | S3-compatible object storage |
| AI | any OpenAI-compatible endpoint, incl. local Ollama | our pooled endpoints |
| Sessions/queue | in-Postgres (single container works) | Redis + BullMQ, web/worker split |

Same image, env-configured. No "cloud edition" feature flags on learning features
the product is identical; only plumbing differs.

## The five scale rules (decided day one)

1. **Sessions live in Postgres** (cookie carries only a signed session id).
   Never in-memory: in-memory state assumes one process and blocks horizontal
   scaling. Redis session store is a cloud-side drop-in behind the same interface.
2. **Every table is tenant-scoped.** `family_id` on every row, every query goes
   through helpers that enforce it. Multi-tenant from the first table, not
   retrofitted. (Consider Postgres row-level security once the schema settles.)
3. **Storage behind an adapter** (`lib/storage.js`): `local` writes to the data
   volume (`UPLOAD_DIR`), `s3` talks to any S3-compatible endpoint via the AWS
   SDK v3 S3 client (R2, MinIO, AWS). Selected by `STORAGE_DRIVER`. Same
   interface: `put`, `get` (stream with range), `getBuffer`, `delete`,
   `exists`. Callers never know which. Whole-family export (`GET
   /api/family/export`, owner only) streams a zip with `family.json`, every
   course as `.wow-course.json`, and uploads by id. The zip re-imports its
   courses on any instance.
4. **Long work runs as jobs, not HTTP handlers.** Course generation takes
   minutes. A `job` table is the queue (Postgres-backed by default; BullMQ
   adapter in cloud). A role selector in the entrypoint boots a process as
   `web`, `worker`, or `all`: self-hosters run `all` in one container; cloud
   runs many stateless web replicas + a worker pool. (Proven pattern: the
   broadcast-worker split.)
5. **Postgres is the only hard dependency** at small scale. Redis, S3, Ollama
   are optional upgrades, each behind an interface with a working default.

## AI layer

- Any OpenAI-compatible endpoint (see `.env.example`); works fully offline with
  Ollama. Task-routed pro/flash tiers, env-overridable without redeploys.
- **Per-family usage accounting + spend caps** from the day AI calls start
  tokens, cost estimate, monthly limit with warn → stop. Fail-open: accounting
  never takes learning features down. (Proven pattern.)
- All provider calls go through `fetchT` (timeout + retry). Providers stall;
  bare fetch hangs forever.
- **Degradation is a feature:** no AI endpoint configured → previously generated
  courses stay fully usable. AI down ≠ app down.

## Tenancy & privacy (COPPA posture)

- Learner accounts are created and owned by a parent account. No learner email
  required. No third-party calls on learner request paths unless the family
  configures a cloud AI key (the UI says so plainly when they do).
- No telemetry by default; opt-in anonymous usage stats only.
- Full export of everything a family created, any time.

## Capacity expectations (honest)

A single modest server (2 to 4 vCPU) runs web + worker + Postgres comfortably for
hundreds of active families. Bottleneck is AI generation throughput, bounded by
the job queue, per-family rate limits, and spend caps. The web tier is stateless
→ horizontal scaling is a load balancer + replicas when needed. Read replicas,
CDN for static assets, and multi-region are later moves that don't require
rewrites under the rules above.

## Process discipline (borrowed from production ops)

- `node --check` on changed files + `npm test` before every push (CI enforces).
- A view/system smoke suite (jsdom render) once the frontend exists.
- Deploy verification: deployment finished + running image matches commit +
  logs clean. A green push is not proof.
