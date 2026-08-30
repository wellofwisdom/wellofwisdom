// SPDX-License-Identifier: AGPL-3.0-or-later
// Parent course routes: generate (job), list, detail tree, edit, publish, delete.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
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
// {type:'url',title,url} — URLs are fetched + stripped to text here (SSRF-guarded).
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
    const { title, description, status, learnerId } = req.body || {};
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
    if (status !== undefined) {
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

router.delete("/:id", async (req, res, next) => {
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

module.exports = router;
