// SPDX-License-Identifier: AGPL-3.0-or-later
// Snapshots of the course tree. One jsonb per save, at most 20 per course.
const db = require("./db");

const MAX_VERSIONS = 20;

// Build a snapshot from the live tables. No secrets, no family id, just
// what an export carries and a learner sees (with answers here for guides).
async function snapshotTree(courseId, familyId) {
  const c = await db.query(
    `select id, title, topic, lens, grade_level, status, description, learner_id
       from courses where id = $1 and family_id = $2`,
    [courseId, familyId]
  );
  if (!c.rows[0]) return null;
  const units = await db.query("select id, title, position from units where course_id = $1 order by position, id", [courseId]);
  const lessons = await db.query(
    `select l.id, l.unit_id, l.title, l.summary, l.position, coalesce(l.standards,'{}') as standards
       from lessons l join units un on un.id = l.unit_id
      where un.course_id = $1 order by l.position, l.id`,
    [courseId]
  );
  const items = await db.query(
    `select i.id, i.lesson_id, i.type, i.position, i.content
       from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
      where un.course_id = $1 order by i.position, i.id`,
    [courseId]
  );
  const course = c.rows[0];
  return {
    id: Number(course.id),
    title: course.title,
    topic: course.topic,
    lens: course.lens,
    grade_level: course.grade_level,
    status: course.status,
    description: course.description,
    learner_id: course.learner_id ? Number(course.learner_id) : null,
    units: units.rows.map((u) => ({
      id: Number(u.id),
      title: u.title,
      position: Number(u.position),
      lessons: lessons.rows.filter((l) => Number(l.unit_id) === Number(u.id)).map((l) => ({
        id: Number(l.id),
        title: l.title,
        summary: l.summary,
        standards: l.standards || [],
        position: Number(l.position),
        items: items.rows.filter((i) => Number(i.lesson_id) === Number(l.id)).map((i) => ({
          id: Number(i.id),
          type: i.type,
          position: Number(i.position),
          content: i.content || {},
        })),
      })),
    })),
  };
}

async function saveSnapshot(courseId, familyId, userId) {
  const tree = await snapshotTree(courseId, familyId);
  if (!tree) return null;
  const r = await db.query(
    "insert into course_versions (course_id, family_id, snapshot, created_by) values ($1,$2,$3,$4) returning id, created_at",
    [courseId, familyId, JSON.stringify(tree), userId || null]
  );
  // Keep only the latest MAX_VERSIONS per course.
  await db.query(
    `delete from course_versions where course_id = $1 and id not in (
       select id from course_versions where course_id = $1 order by created_at desc, id desc limit $2
     )`,
    [courseId, MAX_VERSIONS]
  );
  return { id: Number(r.rows[0].id), createdAt: r.rows[0].created_at, snapshot: tree };
}

async function listVersions(courseId, familyId) {
  const { rows } = await db.query(
    `select id, created_at, created_by from course_versions
      where course_id = $1 and family_id = $2 order by created_at desc, id desc limit $3`,
    [courseId, familyId, MAX_VERSIONS]
  );
  return rows.map((r) => ({ id: Number(r.id), createdAt: r.created_at, createdBy: r.created_by ? Number(r.created_by) : null }));
}

async function getVersion(versionId, courseId, familyId) {
  const { rows } = await db.query(
    "select id, snapshot from course_versions where id = $1 and course_id = $2 and family_id = $3",
    [versionId, courseId, familyId]
  );
  if (!rows[0]) return null;
  return { id: Number(rows[0].id), snapshot: rows[0].snapshot };
}

// Restore by running the snapshot through the same normalizer an import uses.
// Never writes raw JSON into the tables, so a tampered or old snapshot that
// contains an invalid item is clamped or refused rather than smuggled in.
async function restoreVersion(version, courseId, familyId) {
  const snap = version.snapshot;
  // Shape the snapshot into the coursegen course shape sans format wrapper.
  const payload = {
    title: snap.title,
    description: snap.description,
    units: (snap.units || []).map((u) => ({
      title: u.title,
      lessons: (u.lessons || []).map((l) => ({
        title: l.title,
        summary: l.summary,
        standards: l.standards,
        items: (l.items || []).map((i) => ({ type: i.type, content: i.content })),
      })),
    })),
  };
  const { normalizeCourse } = require("./coursegen");
  const normalized = normalizeCourse(payload);
  if (!normalized) throw Object.assign(new Error("course_unparseable"), { code: "course_unparseable" });
  // Keep course header fields from the snapshot (already present) and re-apply
  // the normalized units/lessons/items after clearing the current ones.
  const client = await db.getPool().connect().catch(() => null);
  // Under pglite getPool throws, so fall back to sequential queries.
  async function withTx(fn) {
    if (client) {
      try {
        await client.query("begin");
        const r = await fn(client);
        await client.query("commit");
        return r;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    // No pool (pglite): no transaction primitive beyond individual queries.
    return fn({ query: db.query.bind(db) });
  }
  return withTx(async (q) => {
    await q.query("update courses set title = $1, description = $2, updated_at = now() where id = $3 and family_id = $4", [
      String(snap.title).slice(0, 200),
      snap.description ? String(snap.description).slice(0, 1000) : null,
      courseId,
      familyId,
    ]);
    // Remove existing units (cascades to lessons and items).
    await q.query("delete from units where course_id = $1", [courseId]);
    const standards = require("./standards");
    let unitPos = 0;
    for (const u of normalized.units) {
      const un = await q.query("insert into units (course_id, title, position) values ($1,$2,$3) returning id", [courseId, u.title, unitPos++]);
      const unitId = un.rows[0].id;
      let lessonPos = 0;
      for (const l of u.lessons) {
        const arr = standards.normalizeStandards(l.standards || []);
        const ln = await q.query(
          "insert into lessons (unit_id, title, summary, standards, position) values ($1,$2,$3,$4,$5) returning id",
          [unitId, l.title, l.summary || null, arr, lessonPos++]
        );
        const lessonId = ln.rows[0].id;
        let itemPos = 0;
        for (const item of l.items) {
          await q.query("insert into lesson_items (lesson_id, type, position, content) values ($1,$2,$3,$4)", [
            lessonId,
            item.type,
            itemPos++,
            JSON.stringify(item.content),
          ]);
        }
      }
    }
    // Snapshot the restored state as the new head, so undo is not lost.
    // Do this outside of withTx's raw queries where possible.
    return { ok: true };
  });
}

module.exports = { MAX_VERSIONS, snapshotTree, saveSnapshot, listVersions, getVersion, restoreVersion };
