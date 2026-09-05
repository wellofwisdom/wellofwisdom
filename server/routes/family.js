// SPDX-License-Identifier: AGPL-3.0-or-later
// Family routes (parent only). Every query is scoped to req.user.familyId
// the multi-tenant rule from docs/ARCHITECTURE.md.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const perm = require("../lib/perm");
const learners = require("../lib/learners");
const { assignedLearners } = require("../lib/preview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

const LEARNER_FIELDS = learners.FIELDS;

router.get("/learners", async (req, res, next) => {
  try {
    // A scoped assistant sees only their assigned learners in the roster too,
    // not the whole family. Owner, guide and observer see everyone.
    const assigned = await assignedLearners(req.user.id);
    const visible = perm.visibleLearnerIds(req.user, assigned); // null = everyone
    res.json({ learners: await learners.listForFamily(db, req.user.familyId, visible === null ? undefined : visible) });
  } catch (err) {
    next(err);
  }
});

router.post("/learners", auth.requirePerm("create_learner"), async (req, res, next) => {
  try {
    const { name, username, pin, gradeLevel, interests, readingLevel, aiNotes, email } = req.body || {};
    if (!String(name || "").trim()) return bad(res, "name_required");
    const uname = String(username || "").trim().toLowerCase();
    if (!/^[a-z0-9_.-]{2,24}$/.test(uname)) return bad(res, "username_invalid");
    if (!/^\d{4,6}$/.test(String(pin || ""))) return bad(res, "pin_invalid");
    const grade = gradeLevel == null || gradeLevel === "" ? null : Number(gradeLevel);
    if (grade != null && (!Number.isInteger(grade) || grade < 1 || grade > 14)) return bad(res, "grade_invalid");

    const exists = await db.query(
      "select 1 from users where family_id = $1 and username = $2",
      [req.user.familyId, uname]
    );
    if (exists.rowCount > 0) return bad(res, "username_taken", 409);

    const { rows } = await db.query(
      `insert into users (family_id, role, name, username, pin_hash, grade_level, interests, reading_level, ai_notes, email)
       values ($1, 'learner', $2, $3, $4, $5, $6, $7, $8, $9) returning ${LEARNER_FIELDS}`,
      [
        req.user.familyId,
        String(name).trim().slice(0, 80),
        uname,
        auth.hashPin(String(pin)),
        grade,
        Array.isArray(interests) ? interests.slice(0, 12).map((s) => String(s).trim().slice(0, 40)).filter(Boolean) : [],
        readingLevel ? String(readingLevel).slice(0, 20) : null,
        aiNotes ? String(aiNotes).slice(0, 2000) : null,
        email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email)) ? String(email).toLowerCase() : null,
      ]
    );
    res.status(201).json({ learner: learners.shape(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch("/learners/:id", auth.requirePerm("edit_learner"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { name, pin, gradeLevel, interests, readingLevel, aiNotes, email } = req.body || {};

    const sets = [];
    const params = [req.user.familyId, id];
    const add = (col, val) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (name !== undefined) {
      if (!String(name || "").trim()) return bad(res, "name_required");
      add("name", String(name).trim().slice(0, 80));
    }
    if (pin !== undefined) {
      if (!/^\d{4,6}$/.test(String(pin || ""))) return bad(res, "pin_invalid");
      add("pin_hash", auth.hashPin(String(pin)));
    }
    if (gradeLevel !== undefined) {
      const grade = gradeLevel === null || gradeLevel === "" ? null : Number(gradeLevel);
      if (grade != null && (!Number.isInteger(grade) || grade < 1 || grade > 14)) return bad(res, "grade_invalid");
      add("grade_level", grade);
    }
    if (interests !== undefined) {
      add("interests", Array.isArray(interests) ? interests.slice(0, 12).map((s) => String(s).trim().slice(0, 40)).filter(Boolean) : []);
    }
    if (readingLevel !== undefined) {
      add("reading_level", readingLevel ? String(readingLevel).slice(0, 20) : null);
    }
    if (aiNotes !== undefined) {
      add("ai_notes", aiNotes ? String(aiNotes).slice(0, 2000) : null);
    }
    if (email !== undefined) {
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return bad(res, "email_invalid");
      add("email", email ? String(email).toLowerCase() : null);
    }
    if (!sets.length) return bad(res, "nothing_to_update");

    const { rows } = await db.query(
      `update users set ${sets.join(", ")}
        where id = $2 and family_id = $1 and role = 'learner' returning ${LEARNER_FIELDS}`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ learner: learners.shape(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete("/learners/:id", auth.requirePerm("delete_learner"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { rowCount } = await db.query(
      "delete from users where id = $2 and family_id = $1 and role = 'learner'",
      [req.user.familyId, id]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Family info for the parent (join code shown in Settings).
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "select id, name, join_code, created_at from families where id = $1",
      [req.user.familyId]
    );
    res.json({ family: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
