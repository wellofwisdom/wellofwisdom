// SPDX-License-Identifier: AGPL-3.0-or-later
// Whole-family export: gather every row a family owns into a zip.
// family.json + one .wow-course.json per course + uploads by id.
// Owner only. No answer keys stripped: this is the family's own data.

const db = require("./db");

// Collect everything for a family, in a shape the importer can understand.
// The zip builder calls this, then writes each section to its own file.
async function collectFamily(familyId) {
  const fid = Number(familyId);

  const familyRes = await db.query("select id, name, join_code, created_at from families where id = $1", [fid]);
  const family = familyRes.rows[0] || null;

  const learnersRes = await db.query(
    "select id, name, username, grade_level, interests, reading_level, ai_notes, email, tutor_mode, prefs, created_at from users where family_id = $1 and role = 'learner' order by created_at",
    [fid]
  );

  const plansRes = await db.query("select * from term_plans where family_id = $1 order by created_at", [fid]);
  const milestonesRes = await db.query(
    "select m.* from plan_milestones m join term_plans p on p.id = m.plan_id where p.family_id = $1 order by m.plan_id, m.position",
    [fid]
  );
  const enrollmentsRes = await db.query(
    "select e.* from plan_enrollments e join term_plans p on p.id = e.plan_id where p.family_id = $1",
    [fid]
  );

  const eventsRes = await db.query("select * from events where family_id = $1 order by starts_at", [fid]).catch(() => ({ rows: [] }));
  const notesRes = await db.query("select * from workspace_pages where family_id = $1 order by created_at", [fid]);
  const resourcesRes = await db.query("select * from resources where family_id = $1 order by created_at", [fid]);
  const reportsRes = await db.query("select * from reports where family_id = $1 order by period_start", [fid]);
  const attendanceRes = await db.query("select * from attendance_days where family_id = $1 order by day", [fid]);
  const assessmentsRes = await db.query("select * from assessments where family_id = $1 order by taken_on", [fid]);
  const badgesRes = await db.query("select * from badges where family_id = $1 order by earned_at", [fid]);

  // Tutor threads with parent-visible messages
  const threadsRes = await db.query("select * from tutor_threads where family_id = $1 order by created_at", [fid]);
  let messagesRes = { rows: [] };
  if (threadsRes.rows.length) {
    const ids = threadsRes.rows.map((t) => t.id);
    messagesRes = await db.query(
      "select * from tutor_messages where thread_id = any($1::bigint[]) order by thread_id, created_at",
      [ids]
    );
  }

  // Attempts, completions, review schedule (learner work)
  const attemptsRes = await db.query("select * from attempts where family_id = $1 order by created_at", [fid]).catch(() => ({ rows: [] }));
  const completionsRes = await db.query("select * from lesson_completions where family_id = $1 order by completed_at", [fid]).catch(() => ({ rows: [] }));
  const reviewRes = await db.query("select * from review_schedule where family_id = $1 order by due_at", [fid]).catch(() => ({ rows: [] }));

  // Uploads index (not the bytes: those go as separate files)
  const uploadsRes = await db.query(
    "select id, kind, mime, bytes, storage_key, original_name, title, is_public, created_at from uploads where family_id = $1 order by created_at",
    [fid]
  );

  // Guides (parent users in the family, for reference)
  const guidesRes = await db.query(
    "select id, name, email, guide_role, created_at from users where family_id = $1 and role = 'parent' order by created_at",
    [fid]
  ).catch(() => ({ rows: [] }));

  const sanitized = {
    family,
    guides: guidesRes.rows,
    learners: learnersRes.rows,
    plans: plansRes.rows,
    planMilestones: milestonesRes.rows,
    planEnrollments: enrollmentsRes.rows,
    events: eventsRes.rows,
    notes: notesRes.rows,
    resources: resourcesRes.rows,
    reports: reportsRes.rows,
    attendance: attendanceRes.rows,
    assessments: assessmentsRes.rows,
    badges: badgesRes.rows,
    tutorThreads: threadsRes.rows,
    tutorMessages: messagesRes.rows,
    attempts: attemptsRes.rows,
    completions: completionsRes.rows,
    reviewSchedule: reviewRes.rows,
    uploads: uploadsRes.rows,
  };
  // Strip any credential fields that should never appear in an export.
  // The select statements already avoid them, but this is belt and braces
  // in case a future column addition leaks a hash.
  function stripHashes(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(stripHashes); return; }
    delete obj.password_hash;
    delete obj.passwordHash;
    delete obj.pin_hash;
    delete obj.pinHash;
    delete obj.token_hash;
    delete obj.tokenHash;
    delete obj.google_sub;
    // Recurse into nested values
    for (const v of Object.values(obj)) stripHashes(v);
  }
  stripHashes(sanitized);
  return sanitized;
}

// Build one course export payload (same shape as GET /api/courses/:id/export).
async function courseExportPayload(courseId, familyId) {
  const c = await db.query("select * from courses where id = $1 and family_id = $2", [courseId, familyId]);
  if (!c.rows[0]) return null;
  const course = c.rows[0];
  const units = await db.query("select id, title, position from units where course_id = $1 order by position, id", [courseId]);
  const lessons = await db.query(
    "select l.id, l.unit_id, l.title, l.summary, l.position from lessons l join units u on u.id = l.unit_id where u.course_id = $1 order by l.position, l.id",
    [courseId]
  );
  const items = await db.query(
    "select i.id, i.lesson_id, i.type, i.position, i.content from lesson_items i join lessons l on l.id = i.lesson_id join units u on u.id = l.unit_id where u.course_id = $1 order by i.position, i.id",
    [courseId]
  );
  const byUnit = units.rows.map((u) => ({
    title: u.title,
    lessons: lessons.rows
      .filter((l) => l.unit_id === u.id)
      .map((l) => ({ title: l.title, summary: l.summary, items: items.rows.filter((i) => i.lesson_id === l.id).map((i) => ({ type: i.type, content: i.content })) })),
  }));
  return {
    format: "wellofwisdom-course",
    version: 1,
    title: course.title,
    topic: course.topic,
    lens: course.lens,
    gradeLevel: course.grade_level,
    description: course.description,
    license: course.license || null,
    author: course.author_name || null,
    includesAnswers: true,
    units: byUnit,
  };
}

async function listCourseIds(familyId) {
  const { rows } = await db.query("select id from courses where family_id = $1 order by created_at", [Number(familyId)]);
  return rows.map((r) => Number(r.id));
}

module.exports = { collectFamily, courseExportPayload, listCourseIds };
