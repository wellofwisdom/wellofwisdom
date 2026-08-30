// SPDX-License-Identifier: AGPL-3.0-or-later
// Postgres-backed job queue. Long work (AI course generation takes minutes)
// never runs inside an HTTP handler. FOR UPDATE SKIP LOCKED claims jobs safely
// if multiple workers ever run; today one in-process sweeper is the default
// role ("all"). Web/worker split comes later without schema changes.
const db = require("./db");
const { generateCourse } = require("./coursegen");

const HANDLERS = {
  course: async (job) => {
    const spec = job.payload;
    return generateCourse(spec, spec.created_by, job.family_id);
  },
  "plan-outline": async (job) => {
    const spec = job.payload;
    const { generateOutline } = require("./plangen");
    return generateOutline(spec);
  },
};

async function enqueue(familyId, type, payload, createdBy) {
  const { rows } = await db.query(
    `insert into jobs (family_id, type, payload)
     values ($1, $2, $3) returning id`,
    [familyId, type, JSON.stringify({ ...(payload || {}), created_by: createdBy })]
  );
  return rows[0].id;
}

async function get(jobId, familyId) {
  const { rows } = await db.query(
    "select id, type, status, error, result, created_at, updated_at from jobs where id = $1 and family_id = $2",
    [jobId, familyId]
  );
  return rows[0] || null;
}

let timer = null;

function startJobs({ intervalMs = 4000 } = {}) {
  if (timer) return;
  timer = setInterval(sweep, intervalMs);
  timer.unref();
  sweep();
}

async function sweep() {
  if (!db.configured()) return;
  let job;
  try {
    const claimed = await db.query(
      `update jobs set status = 'running', updated_at = now()
        where id = (
          select id from jobs where status = 'queued'
          order by id limit 1 for update skip locked
        )
        returning *`
    );
    job = claimed.rows[0];
  } catch (err) {
    return; // db hiccup: next sweep retries
  }
  if (!job) return;

  const handler = HANDLERS[job.type];
  try {
    if (!handler) throw new Error(`unknown_job_type_${job.type}`);
    const result = await handler(job);
    await db.query("update jobs set status = 'done', result = $2, updated_at = now() where id = $1", [
      job.id,
      JSON.stringify(result),
    ]);
    console.log(`[jobs] #${job.id} ${job.type} done`);
  } catch (err) {
    console.error(`[jobs] #${job.id} ${job.type} FAILED: ${err.message}`);
    await db
      .query("update jobs set status = 'error', error = $2, updated_at = now() where id = $1", [job.id, err.message])
      .catch(() => {});
  }
}

function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { enqueue, get, startJobs, stopJobs };
