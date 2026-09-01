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
  "worksheet-import": async (job) => {
    const spec = job.payload;
    const { importWorksheet } = require("./worksheet");
    const { items, title } = await importWorksheet(spec, spec.created_by, job.family_id);

    const db = require("./db");
    // existing course -> new unit at the end; otherwise a fresh standalone course
    if (spec.courseId) {
      const owned = await db.query(
        `select id from courses where id = $1 and family_id = $2`,
        [Number(spec.courseId), job.family_id]
      );
      if (owned.rows[0]) {
        const maxPos = await db.query(
          "select coalesce(max(position), -1) + 1 as p from units where course_id = $1", [Number(spec.courseId)]
        );
        const unit = await db.query(
          "insert into units (course_id, title, position) values ($1, $2, $3) returning id",
          [Number(spec.courseId), "Imported worksheets", maxPos.rows[0].p]
        );
        const lesson = await db.query(
          "insert into lessons (unit_id, title, summary, position) values ($1, $2, $3, 0) returning id",
          [unit.rows[0].id, title, "Imported from a worksheet: review before publishing."]
        );
        let pos = 0;
        for (const item of items) {
          await db.query(
            "insert into lesson_items (lesson_id, type, position, content) values ($1, $2, $3, $4)",
            [lesson.rows[0].id, "exercise", pos++, JSON.stringify(item.content)]
          );
        }
        await db.query("update courses set updated_at = now() where id = $1", [Number(spec.courseId)]);
        return { courseId: Number(spec.courseId), addedToExisting: true, items: items.length, title };
      }
    }
    // fresh course
    const { persistCourse } = require("./coursegen");
    const course = {
      title: title,
      description: "Imported from a worksheet.",
      units: [{ title: "Worksheet", lessons: [{ title, summary: "Imported from a worksheet: review, then publish.", items }] }],
    };
    const r = await persistCourse(course, { topic: title, lens: null, gradeLevel: null, sources: [] }, spec.created_by, job.family_id);
    return { courseId: r.courseId, addedToExisting: false, items: items.length, title };
  },
  image: async (job) => {
    const spec = job.payload;
    const media = require("./media");
    const r = await media.generateImage({
      prompt: spec.prompt,
      size: spec.size,
      purpose: spec.purpose,
      refType: spec.refType,
      refId: spec.refId,
      familyId: job.family_id,
      userId: spec.created_by,
    });
    // course covers update the course row for cheap listing
    if (spec.purpose === "course-cover" && spec.refType === "course" && r.url && !r.url.startsWith("data:")) {
      await db.query("update courses set cover_url = $2 where id = $1 and family_id = $3",
        [spec.refId, r.url, job.family_id]).catch(() => {});
    }
    return r;
  },
  video: async (job) => {
    const spec = job.payload;
    const media = require("./media");
    return media.generateVideo({
      prompt: spec.prompt,
      duration: spec.duration,
      resolution: spec.resolution,
      purpose: spec.purpose,
      refType: spec.refType,
      refId: spec.refId,
      familyId: job.family_id,
      userId: spec.created_by,
    });
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
