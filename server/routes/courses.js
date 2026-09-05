// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent course routes: generate (job), list, detail tree, edit, publish, delete.
const express = require("express");
const auth = require("../lib/auth");
const perm = require("../lib/perm");
const db = require("../lib/db");
const share = require("../lib/share");
const jobs = require("../lib/jobs");
const ai = require("../lib/ai");
const { fetchT } = require("../lib/http");
const { safeSourceUrl, htmlToText } = require("../lib/grade");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Start course generation. Sources may be {type:'text',title,text} or
// {type:'url',title,url}: URLs are fetched + stripped to text here (SSRF-guarded).
router.post("/generate", async (req, res, next) => {
  try {
    const { topic, learnerId, lens, gradeLevel, notes, sources } = req.body || {};
    if (!String(topic || "").trim() || String(topic).length < 3) return bad(res, "topic_required");
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    const grade = gradeLevel == null || gradeLevel === "" ? null : Number(gradeLevel);
    if (grade != null && (!Number.isInteger(grade) || grade < 1 || grade > 14)) return bad(res, "grade_invalid");
    let learnerProfile = null;
    if (learnerId != null) {
      const owns = await db.query(
        "select name, grade_level, interests, ai_notes from users where id = $1 and family_id = $2 and role = 'learner'",
        [Number(learnerId), req.user.familyId]
      );
      if (!owns.rowCount) return bad(res, "learner_not_found", 404);
      learnerProfile = owns.rows[0];
    }

    // Resolve sources (max 5; URLs fetched server-side, never client-side).
    const resolved = [];
    for (const s of (Array.isArray(sources) ? sources : []).slice(0, 5)) {
      if (s && s.type === "text" && String(s.text || "").trim()) {
        resolved.push({ type: "text", title: String(s.title || "Notes").slice(0, 200), text: String(s.text).slice(0, 30000) });
      } else if (s && s.type === "url" && String(s.url || "").trim()) {
        const url = safeSourceUrl(s.url);
        if (!url) return bad(res, "source_url_invalid");
        try {
          const r = await fetchT(url.toString(), { headers: { "user-agent": "WellOfWisdom/0.1 (+https://wellofwisdom.app)" } }, { timeoutMs: 15000, retries: 1 });
          if (!r.ok) throw new Error(`http_${r.status}`);
          const body = (await r.text()).slice(0, 400000);
          const text = htmlToText(body);
          if (!text || text.length < 80) throw new Error("empty_page");
          resolved.push({ type: "url", title: String(s.title || url.hostname).slice(0, 200), url: url.toString(), text: text.slice(0, 30000) });
        } catch (err) {
          return bad(res, "source_fetch_failed", 400);
        }
      }
    }

    const spec = {
      topic: String(topic).trim().slice(0, 300),
      learnerId: learnerId ? Number(learnerId) : null,
      lens: String(lens || "").trim().slice(0, 100) || null,
      gradeLevel: grade,
      interests: learnerProfile ? learnerProfile.interests : [],
      learnerNotes: learnerProfile && learnerProfile.ai_notes ? String(learnerProfile.ai_notes) : null,
      notes: String(notes || "").trim().slice(0, 1000) || null,
      sources: resolved,
    };
    const jobId = await jobs.enqueue(req.user.familyId, "course", spec, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:id", async (req, res, next) => {
  try {
    const job = await jobs.get(Number(req.params.id), req.user.familyId);
    if (!job) return bad(res, "not_found", 404);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select c.id, c.title, c.topic, c.lens, c.grade_level, c.status, c.description, c.created_at,
              u.name as learner_name,
              (select count(*) from units un where un.course_id = c.id)::int as unit_count,
              (select count(*) from lessons l join units un on un.id = l.unit_id where un.course_id = c.id)::int as lesson_count,
              (select count(*) from lesson_items i join lessons l on l.id = i.lesson_id join units un on un.id = l.unit_id
                where un.course_id = c.id and i.type = 'exercise')::int as exercise_count
         from courses c left join users u on u.id = c.learner_id
        where c.family_id = $1 and c.status != 'archived'
        order by c.created_at desc`,
      [req.user.familyId]
    );
    res.json({ courses: rows });
  } catch (err) {
    next(err);
  }
});

async function courseTree(courseId, familyId) {
  const c = await db.query(
    `select c.*, u.name as learner_name from courses c left join users u on u.id = c.learner_id
      where c.id = $1 and c.family_id = $2`,
    [courseId, familyId]
  );
  if (!c.rows[0]) return null;
  const units = await db.query(
    `select id, title, position from units where course_id = $1 order by position, id`,
    [courseId]
  );
  const lessons = await db.query(
    `select l.id, l.unit_id, l.title, l.summary, l.position
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
  const byUnit = units.rows.map((u) => ({
    ...u,
    lessons: lessons.rows
      .filter((l) => l.unit_id === u.id)
      .map((l) => ({ ...l, items: items.rows.filter((i) => i.lesson_id === l.id) })),
  }));
  return { ...c.rows[0], units: byUnit };
}

// Paste-a-worksheet -> AI parses into exercises (job; poll /jobs/:id).
router.post("/worksheet-import", async (req, res, next) => {
  try {
    const { text, title, courseId } = req.body || {};
    if (!String(text || "").trim() || String(text).trim().length < 30) return bad(res, "text_required");
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    if (courseId != null) {
      const owns = await db.query("select 1 from courses where id = $1 and family_id = $2", [Number(courseId), req.user.familyId]);
      if (!owns.rowCount) return bad(res, "course_not_found", 404);
    }
    const jobId = await jobs.enqueue(req.user.familyId, "worksheet-import", {
      text: String(text).slice(0, 12000),
      title: String(title || "").trim().slice(0, 160) || "Imported worksheet",
      courseId: courseId ? Number(courseId) : null,
    }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

// Export a course as portable JSON (with answers: for guides, for sharing).
router.get("/:id/export", async (req, res, next) => {
  try {
    const tree = await courseTree(Number(req.params.id), req.user.familyId);
    if (!tree) return bad(res, "not_found", 404);
    res.json({
      format: "wellofwisdom-course",
      version: 1,
      title: tree.title,
      topic: tree.topic,
      lens: tree.lens,
      gradeLevel: tree.grade_level,
      description: tree.description,
      units: tree.units.map((u) => ({
        title: u.title,
        lessons: u.lessons.map((l) => ({
          title: l.title,
          summary: l.summary,
          items: l.items.map((i) => ({ type: i.type, content: i.content })),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Import a course from exported JSON (reuses the generation normalizer as
// the trust boundary. Nothing lands unvalidated).
router.post("/import", async (req, res, next) => {
  try {
    const payload = req.body && req.body.course ? req.body.course : req.body;
    if (!payload || payload.format !== "wellofwisdom-course") return bad(res, "format_invalid");
    const { normalizeCourse, persistCourse } = require("../lib/coursegen");
    const course = normalizeCourse(payload);
    if (!course) return bad(res, "course_unparseable");
    const r = await persistCourse(
      course,
      {
        topic: String(payload.topic || course.title).slice(0, 300),
        lens: payload.lens ? String(payload.lens).slice(0, 100) : null,
        gradeLevel: payload.gradeLevel != null ? Number(payload.gradeLevel) : null,
        sources: [],
      },
      req.user.id,
      req.user.familyId
    );
    res.status(201).json({ courseId: r.courseId });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const tree = await courseTree(Number(req.params.id), req.user.familyId);
    if (!tree) return bad(res, "not_found", 404);
    res.json({ course: tree });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { title, description, status, learnerId, trailerUploadId } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, id];
    const add = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (title !== undefined) {
      if (!String(title || "").trim()) return bad(res, "title_required");
      add("title", String(title).trim().slice(0, 200));
    }
    if (description !== undefined) add("description", String(description || "").slice(0, 1000) || null);
    if (trailerUploadId !== undefined) {
      if (trailerUploadId === null) {
        add("trailer_upload_id", null);
      } else {
        // Only this family's own upload, and only a video.
        const own = await db.query(
          "select 1 from uploads where id = $1 and family_id = $2 and kind = 'video'",
          [Number(trailerUploadId), req.user.familyId]
        );
        if (!own.rowCount) return bad(res, "upload_not_found", 404);
        add("trailer_upload_id", Number(trailerUploadId));
      }
    }
    if (status !== undefined) {
      // Changing whether a course is live to learners is a publish action, not
      // an edit: an assistant may edit a course but not publish or archive it.
      if (!perm.can(req.user, "publish_course")) return bad(res, "not_allowed", 403);
      if (!["draft", "published", "archived"].includes(status)) return bad(res, "status_invalid");
      add("status", status);
    }
    if (learnerId !== undefined) {
      if (learnerId !== null) {
        const owns = await db.query(
          "select 1 from users where id = $3 and family_id = $1 and role = 'learner'",
          [req.user.familyId, id, Number(learnerId)]
        );
        if (!owns.rowCount) return bad(res, "learner_not_found", 404);
      }
      add("learner_id", learnerId === null ? null : Number(learnerId));
    }
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");
    const { rows } = await db.query(
      `update courses set ${sets.join(", ")} where id = $2 and family_id = $1 returning id, status`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", auth.requirePerm("delete_course"), async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from courses where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Edit a lesson item's content (parent fixes AI output before publishing).
router.patch("/items/:itemId", async (req, res, next) => {
  try {
    const itemId = Number(req.params.itemId);
    const { content } = req.body || {};
    if (!content || typeof content !== "object") return bad(res, "content_required");
    const { rows } = await db.query(
      `update lesson_items i set content = $3
         from lessons l, units un, courses c
        where i.lesson_id = l.id and l.unit_id = un.id and un.course_id = c.id
          and i.id = $1 and c.family_id = $2
        returning i.id`,
      [itemId, req.user.familyId, JSON.stringify(content)]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Delete an item (parent trims AI output).
router.delete("/items/:itemId", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      `delete from lesson_items i
         using lessons l, units un, courses c
        where i.lesson_id = l.id and l.unit_id = un.id and un.course_id = c.id
          and i.id = $1 and c.family_id = $2`,
      [Number(req.params.itemId), req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Edit a lesson's title/summary.

// Reading-level rewrite: the same article, aimed at a different reader, so
// siblings can share a course. The guide asks for it and reviews the draft
// before it saves (the normal item PATCH is the save), so nothing is applied
// automatically. It preserves the teaching, the markdown and the math, and
// changes only how the words land.
const REWRITE_LEVELS = {
  simpler: "noticeably simpler than it is now: shorter sentences and plainer words",
  "grade-3": "a 3rd grade reader, around age 8",
  "grade-5": "a 5th grade reader, around age 10",
  "grade-8": "an 8th grade reader, around age 13",
  advanced: "a confident older student: richer vocabulary, more nuance, longer arguments",
};

router.post("/rewrite", async (req, res, next) => {
  try {
    const text = String((req.body && req.body.text) || "").slice(0, 20000);
    const level = String((req.body && req.body.level) || "");
    if (!text.trim()) return bad(res, "text_required");
    if (!REWRITE_LEVELS[level]) return bad(res, "level_invalid");
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    const out = await ai.chat("lesson-content", [
      {
        role: "system",
        content:
          "You rewrite a lesson article at a target reading level WITHOUT changing what it teaches. " +
          "Keep every fact, example and step. Keep the light markdown exactly as written: **bold**, " +
          "- bullets, # headings, and $math$ (never reword, move or drop the math). Change only sentence " +
          "length, vocabulary and how much you spell things out, to fit the reader. " +
          "Return ONLY the rewritten body: no preamble, no code fences, no commentary.",
      },
      { role: "user", content: `Rewrite for ${REWRITE_LEVELS[level]}.\n\n---\n${text}` },
    ], { maxTokens: 2000, temperature: 0.4, usage: { familyId: req.user.familyId, note: "rewrite-level" } });
    const body = String(out.content || "").replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim().slice(0, 20000);
    if (!body) return bad(res, "rewrite_failed", 502);
    res.json({ text: body });
  } catch (err) {
    next(err);
  }
});

// Add an item to a lesson. The guide is adding it by hand (a video they
// uploaded, a note), so it goes through the same normalizer as AI output
// there is one trust boundary, not two.
router.post("/lessons/:lessonId/items", async (req, res, next) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId)) return bad(res, "id_invalid");
    const { type, content } = req.body || {};
    if (!["article", "exercise", "video", "project"].includes(type)) return bad(res, "type_invalid");

    const owns = await db.query(
      `select l.id from lessons l join units un on un.id = l.unit_id
         join courses c on c.id = un.course_id
        where l.id = $1 and c.family_id = $2`,
      [lessonId, req.user.familyId]
    );
    if (!owns.rowCount) return bad(res, "not_found", 404);

    const { normalizeItem } = require("../lib/coursegen");
    let inputContent = content || {};
    let resolvedFromUrl = false;

    // Paste-a-link: turn one pasted URL into a verified, structured source
    // (YouTube, Vimeo, PeerTube, or a direct file) before it crosses the
    // normalizer, so the guide can fix a bad link now rather than a learner
    // meeting a dead embed later. All of it is SSRF-guarded in resolveVideoUrl.
    if (type === "video" && inputContent.url &&
        !inputContent.youtubeId && !inputContent.uploadId &&
        !inputContent.vimeoId && !inputContent.fileUrl && !inputContent.peertubeId) {
      const { resolveVideoUrl } = require("../lib/video");
      const r = await resolveVideoUrl(inputContent.url);
      if (r.error) return bad(res, r.error);
      inputContent = {
        ...r.content,
        title: inputContent.title || r.title || undefined,
        note: inputContent.note,
        questions: inputContent.questions,
      };
      resolvedFromUrl = true;
    }

    const clean = normalizeItem({ type, content: inputContent });
    if (!clean) return bad(res, "content_invalid");

    // A YouTube id supplied directly (not through a pasted url we already
    // verified above) is checked now, while the guide can still fix a typo.
    if (clean.type === "video" && clean.content.youtubeId && !resolvedFromUrl) {
      const { checkYouTube } = require("../lib/video");
      const v = await checkYouTube(clean.content.youtubeId);
      if (!v.ok) return bad(res, "video_unavailable");
      if (v.title && !inputContent.title) clean.content.title = v.title;
    }
    // A video item pointing at an upload must point at one of OUR uploads.
    if (clean.type === "video" && clean.content.uploadId) {
      const own = await db.query(
        "select 1 from uploads where id = $1 and family_id = $2 and kind = 'video'",
        [clean.content.uploadId, req.user.familyId]
      );
      if (!own.rowCount) return bad(res, "upload_not_found", 404);
    }

    const pos = await db.query(
      "select coalesce(max(position), -1) + 1 as p from lesson_items where lesson_id = $1",
      [lessonId]
    );
    const { rows } = await db.query(
      `insert into lesson_items (lesson_id, type, position, content)
       values ($1, $2, $3, $4) returning id, type, position, content`,
      [lessonId, clean.type, pos.rows[0].p, JSON.stringify(clean.content)]
    );
    res.status(201).json({ item: { ...rows[0], id: Number(rows[0].id) } });
  } catch (err) {
    next(err);
  }
});

router.patch("/lessons/:lessonId", async (req, res, next) => {
  try {
    const { title, summary } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.lessonId)];
    const add = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (title !== undefined) {
      if (!String(title || "").trim()) return bad(res, "title_required");
      add("title", String(title).trim().slice(0, 200));
    }
    if (summary !== undefined) add("summary", String(summary || "").slice(0, 500) || null);
    if (!sets.length) return bad(res, "nothing_to_update");
    const { rowCount } = await db.query(
      `update lessons l set ${sets.join(", ")}
         from units un, courses c
        where l.unit_id = un.id and un.course_id = c.id and l.id = $2 and c.family_id = $1`,
      params
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ---- sharing ----

// Publish to this instance's public page. Nothing leaves the server until a
// guide asks: sharing is opt-in, per course.
router.post("/:id/publish", auth.requirePerm("share_course"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { license, author, shareAnswers } = req.body || {};
    if (license && !share.LICENSES.includes(license)) return bad(res, "license_invalid");

    const cur = await db.query(
      "select id, title, public_slug from courses where id = $1 and family_id = $2",
      [id, req.user.familyId]
    );
    if (!cur.rows[0]) return bad(res, "not_found", 404);
    const slug = cur.rows[0].public_slug || (await share.uniqueSlug(cur.rows[0].title, id));

    const { rows } = await db.query(
      `update courses
          set public_slug = $3, published_at = now(), status = 'published',
              license = $4, author_name = $5, share_answers = $6
        where id = $1 and family_id = $2
        returning public_slug, published_at, license, author_name, share_answers`,
      [
        id, req.user.familyId, slug,
        license || share.DEFAULT_LICENSE,
        author ? String(author).slice(0, 120) : null,
        shareAnswers !== false,
      ]
    );
    res.json({ ok: true, ...rows[0], url: `/c/${rows[0].public_slug}` });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/unpublish", auth.requirePerm("share_course"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    // Keep the slug so re-publishing restores the same URL and old links heal.
    const { rowCount } = await db.query(
      "update courses set published_at = null where id = $1 and family_id = $2",
      [id, req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Import straight from another instance's public course URL. This is the whole
// federation story: no registry, no accounts, just a URL between two servers.
router.post("/import-url", async (req, res, next) => {
  try {
    const raw = String((req.body && req.body.url) || "").trim();
    const safe = safeSourceUrl(raw); // returns a URL object, or null if unsafe
    if (!safe) return bad(res, "url_invalid");
    // Accept either the page URL or the export URL; normalize to the export.
    let target = safe.href.replace(/\/+$/, "");
    if (!/\/export$/.test(target)) {
      const m = target.match(/\/c\/([A-Za-z0-9-]+)$/);
      if (m) target = `${target.slice(0, m.index)}/api/public/courses/${m[1]}/export`;
      else if (/\/api\/public\/courses\/[A-Za-z0-9-]+$/.test(target)) target = `${target}/export`;
    }
    const r = await fetchT(target, { headers: { accept: "application/json" } }, { timeoutMs: 20000, retries: 1 });
    if (!r.ok) return bad(res, `fetch_failed_${r.status}`);
    const payload = await r.json().catch(() => null);
    if (!payload || payload.format !== "wellofwisdom-course") return bad(res, "not_a_course");

    const { normalizeCourse, persistCourse } = require("../lib/coursegen");
    const course = normalizeCourse(payload);
    if (!course) return bad(res, "course_unparseable");
    const out = await persistCourse(
      course,
      {
        topic: String(payload.topic || course.title).slice(0, 300),
        lens: payload.lens ? String(payload.lens).slice(0, 100) : null,
        gradeLevel: payload.gradeLevel != null ? Number(payload.gradeLevel) : null,
        sources: [{ type: "url", title: `Imported from ${target}`, url: target }],
      },
      req.user.id,
      req.user.familyId
    );
    res.status(201).json({ courseId: out.courseId, title: course.title, from: target });
  } catch (err) {
    next(err);
  }
});


/** The whole course on one page, WITH answers, explanations and hints.
 *
 *  The other half of reviewing a course. Preview shows how it feels; this
 *  shows whether the content is any good, without clicking through twenty
 *  seven exercises to find the one the model got wrong. Guides only, and
 *  never reachable by a learner: this is the teacher's edition.
 */
router.get("/:id/answer-key", async (req, res, next) => {
  try {
    const tree = await courseTree(Number(req.params.id), req.user.familyId);
    if (!tree) return bad(res, "not_found", 404);

    let exercises = 0;
    let missingAnswers = 0;
    const units = tree.units.map((u) => ({
      title: u.title,
      lessons: u.lessons.map((l) => ({
        title: l.title,
        summary: l.summary,
        items: l.items.map((i) => {
          const c = i.content || {};
          if (i.type !== "exercise") return { type: i.type, content: c };
          exercises++;
          const answerText = c.kind === "mcq"
            ? ((c.choices || []).find((ch) => ch.id === c.answer) || {}).text || null
            : c.answer;
          // Worth surfacing: an exercise with no answer cannot be graded, and
          // the generator does occasionally produce one.
          if (answerText === null || answerText === undefined || answerText === "") missingAnswers++;
          return {
            type: i.type,
            content: {
              prompt: c.prompt,
              kind: c.kind,
              choices: c.choices,
              answer: c.answer,
              answerText,
              explanation: c.explanation || null,
              hint: c.hint || null,
            },
          };
        }),
      })),
    }));

    res.json({
      course: { id: Number(tree.id), title: tree.title, topic: tree.topic, lens: tree.lens },
      units,
      stats: { exercises, missingAnswers },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
