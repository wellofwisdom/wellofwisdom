// SPDX-License-Identifier: AGPL-3.0-or-later
// Generator v2 routes, required by server/routes/courses.js, which passes
// the shared deps in. Kept separate so the v1 generation routes stay
// untouched in that file.
module.exports = function registerV2(router, deps) {
  const { db, jobs, ai, safeFetch, safeSourceUrl, htmlToText } = deps;
  function bad(res, msg, code = 400) { return res.status(code).json({ error: msg }); }
  router.post("/generate-outline", async (req, res, next) => {
    try {
      const { topic, learnerId, lens, gradeLevel, notes, sources, openPublish, size } = req.body || {};
      if (!String(topic || "").trim() || String(topic).length < 3) return bad(res, "topic_required");
      if (!ai.configured()) return bad(res, "ai_not_configured", 503);
      const grade = gradeLevel == null || gradeLevel === "" ? null : Number(gradeLevel);
      if (grade != null && (!Number.isInteger(grade) || grade < 1 || grade > 14)) return bad(res, "grade_invalid");
      let learnerProfile = null;
      if (learnerId != null) {
        const owns = await db.query("select name, grade_level, interests, ai_notes from users where id = $1 and family_id = $2 and role = 'learner'", [Number(learnerId), req.user.familyId]);
        if (!owns.rowCount) return bad(res, "learner_not_found", 404);
        learnerProfile = owns.rows[0];
      }
      const resolved = [];
      for (const s of (Array.isArray(sources) ? sources : []).slice(0, 5)) {
        if (s && s.type === "text" && String(s.text || "").trim()) resolved.push({ type: "text", title: String(s.title || "Notes").slice(0, 200), text: String(s.text).slice(0, 30000) });
        else if (s && s.type === "url" && String(s.url || "").trim()) {
          const url = safeSourceUrl(s.url);
          if (!url) return bad(res, "source_url_invalid");
          try {
            const r = await safeFetch(url.toString(), { timeoutMs: 15000, maxBytes: 2 * 1024 * 1024 });
            if (!r.ok) throw new Error("http_" + r.status);
            const body = (await r.text()).slice(0, 400000);
            const text = htmlToText(body);
            if (!text || text.length < 80) throw new Error("empty_page");
            resolved.push({ type: "url", title: String(s.title || url.hostname).slice(0, 200), url: url.toString(), text: text.slice(0, 30000) });
          } catch (err) { return bad(res, "source_fetch_failed", 400); }
        }
      }
      const sizeNorm = size && typeof size === "object" && !Array.isArray(size) ? {
        units: size.units != null ? Number(size.units) : undefined,
        lessonsPerUnit: size.lessonsPerUnit != null ? Number(size.lessonsPerUnit) : (size.lessons != null ? Number(size.lessons) : undefined),
        weeks: size.weeks != null ? Number(size.weeks) : undefined,
        outlineNote: size.outlineNote != null ? String(size.outlineNote).slice(0, 500) : undefined,
      } : undefined;
      const spec = {
        topic: String(topic).trim().slice(0, 300),
        learnerId: learnerId ? Number(learnerId) : null,
        lens: String(lens || "").trim().slice(0, 100) || null,
        gradeLevel: grade,
        interests: learnerProfile ? learnerProfile.interests : [],
        learnerNotes: learnerProfile && learnerProfile.ai_notes ? String(learnerProfile.ai_notes) : null,
        notes: String(notes || "").trim().slice(0, 1000) || null,
        sources: resolved,
        openPublish: !learnerId && Boolean(openPublish),
        size: sizeNorm,
      };
      const jobId = await jobs.enqueue(req.user.familyId, "course-outline", spec, req.user.id);
      res.status(202).json({ jobId });
    } catch (err) { next(err); }
  });
  router.post("/generate-from-outline", async (req, res, next) => {
    try {
      const { outline, topic, learnerId, lens, gradeLevel, notes, sources, openPublish, size } = req.body || {};
      if (!outline || typeof outline !== "object") return bad(res, "outline_required");
      if (!ai.configured()) return bad(res, "ai_not_configured", 503);
      let learnerProfile = null;
      if (learnerId != null) {
        const rows2 = await db.query("select name, grade_level, interests, ai_notes from users where id = $1 and family_id = $2 and role = 'learner'", [Number(learnerId), req.user.familyId]);
        if (!rows2.rows[0]) return bad(res, "learner_not_found", 404);
        learnerProfile = rows2.rows[0];
      }
      const spec = {
        topic: String(topic || outline.title || "Course").trim().slice(0, 300),
        learnerId: learnerId ? Number(learnerId) : null,
        lens: String(lens || "").trim().slice(0, 100) || null,
        gradeLevel: gradeLevel != null ? Number(gradeLevel) : null,
        notes: String(notes || "").trim().slice(0, 1000) || null,
        interests: learnerProfile ? learnerProfile.interests : [],
        learnerNotes: learnerProfile && learnerProfile.ai_notes ? String(learnerProfile.ai_notes) : null,
        sources: Array.isArray(sources) ? sources.slice(0,5) : [],
        openPublish: !learnerId && Boolean(openPublish),
        size,
      };
      const cg = require("../lib/coursegen");
      const normalizeOutline = cg.normalizeOutline || require("../lib/coursegen.v2").normalizeOutline;
      const normalized = normalizeOutline(outline, size);
      if (!normalized) return bad(res, "outline_unparseable");
      const v2 = require("../lib/coursegen.v2");
      const skeleton = await v2.persistOutlineAsSkeleton(normalized, spec, req.user.id, req.user.familyId);
      const outlineContext = JSON.stringify(normalized).slice(0, 4000);
      const lessonJobs = [];
      for (const lid of skeleton.lessonIds) {
        const lp = normalized.units.flatMap(u=>u.lessons).find(l=>l.title===lid.title) || { title: lid.title };
        const jid = await jobs.enqueue(req.user.familyId, "course-lesson", { courseId: skeleton.courseId, lessonId: lid.lessonId, spec, lessonPlan: lp, outlineContext }, req.user.id);
        lessonJobs.push({ lessonId: lid.lessonId, jobId: jid });
      }
      res.status(201).json({ courseId: skeleton.courseId, lessonJobs });
    } catch (err) { next(err); }
  });
  router.post("/:id/verify", async (req, res, next) => {
    try {
      const courseId = Number(req.params.id);
      if (!Number.isInteger(courseId)) return bad(res, "id_invalid");
      const owned = await db.query("select 1 from courses where id = $1 and family_id = $2", [courseId, req.user.familyId]);
      if (!owned.rowCount) return bad(res, "not_found", 404);
      const jobId = await jobs.enqueue(req.user.familyId, "course-verify", { courseId }, req.user.id);
      res.status(202).json({ jobId });
    } catch (err) { next(err); }
  });
  router.get("/:id/verification", async (req, res, next) => {
    try {
      const courseId = Number(req.params.id);
      if (!Number.isInteger(courseId)) return bad(res, "id_invalid");
      const owned = await db.query("select 1 from courses where id = $1 and family_id = $2", [courseId, req.user.familyId]);
      if (!owned.rowCount) return bad(res, "not_found", 404);
      const units = await db.query("select id from units where course_id = $1", [courseId]);
      if (!units.rows.length) return res.json({ flags: [] });
      const lessons = await db.query("select id from lessons where unit_id = any($1::bigint[])", [units.rows.map(u=>u.id)]);
      if (!lessons.rows.length) return res.json({ flags: [] });
      const items = await db.query("select id, lesson_id, content from lesson_items where lesson_id = any($1::bigint[]) and content->>'verification' is not null", [lessons.rows.map(l=>l.id)]);
      const flags = items.rows.map(r => ({ itemId: Number(r.id), lessonId: Number(r.lesson_id), verification: r.content.verification }));
      res.json({ flags, count: flags.length });
    } catch (err) { next(err); }
  });
  router.post("/:id/media-pass", async (req, res, next) => {
    try {
      const courseId = Number(req.params.id);
      if (!Number.isInteger(courseId)) return bad(res, "id_invalid");
      const owned = await db.query("select 1 from courses where id = $1 and family_id = $2", [courseId, req.user.familyId]);
      if (!owned.rowCount) return bad(res, "not_found", 404);
      const jobId = await jobs.enqueue(req.user.familyId, "course-media", { courseId }, req.user.id);
      res.status(202).json({ jobId });
    } catch (err) { next(err); }
  });
};
