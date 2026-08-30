// SPDX-License-Identifier: AGPL-3.0-or-later
// Workspace pages (the free-form layer): nested pages, one editor.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Flat list — the client builds the tree (families have dozens, not thousands).
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select id, parent_id, title, icon, position, updated_at
         from workspace_pages where family_id = $1
        order by position, id`,
      [req.user.familyId]
    );
    res.json({ pages: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { title, parentId, icon, body } = req.body || {};
    let parent = null;
    if (parentId != null) {
      const p = await db.query(
        "select 1 from workspace_pages where id = $1 and family_id = $2",
        [Number(parentId), req.user.familyId]
      );
      if (!p.rowCount) return bad(res, "parent_not_found", 404);
      parent = Number(parentId);
    }
    const { rows } = await db.query(
      `insert into workspace_pages (family_id, parent_id, title, icon, body, created_by)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [
        req.user.familyId, parent,
        String(title || "Untitled").slice(0, 200),
        icon ? String(icon).slice(0, 8) : null,
        String(body || "").slice(0, 100000),
        req.user.id,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "select id, parent_id, title, icon, body, updated_at from workspace_pages where id = $1 and family_id = $2",
      [Number(req.params.id), req.user.familyId]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ page: rows[0] });
  } catch (err) {
    next(err);
  }
});

// Autosave target: partial updates, touch updated_at.
router.patch("/:id", async (req, res, next) => {
  try {
    const { title, body, icon, parentId, position } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, Number(req.params.id)];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (title !== undefined) add("title", String(title || "Untitled").slice(0, 200));
    if (body !== undefined) add("body", String(body).slice(0, 100000));
    if (icon !== undefined) add("icon", icon ? String(icon).slice(0, 8) : null);
    if (position !== undefined) add("position", Math.min(9999, Math.max(0, Number(position) || 0)));
    if (parentId !== undefined) {
      if (parentId === null) add("parent_id", null);
      else {
        const p = await db.query(
          "select 1 from workspace_pages where id = $3 and family_id = $1",
          [req.user.familyId, Number(req.params.id), Number(parentId)]
        );
        if (!p.rowCount) return bad(res, "parent_not_found", 404);
        if (Number(parentId) === Number(req.params.id)) return bad(res, "parent_self");
        add("parent_id", Number(parentId));
      }
    }
    if (!sets.length) return bad(res, "nothing_to_update");
    sets.push("updated_at = now()");
    const { rowCount } = await db.query(
      `update workspace_pages set ${sets.join(", ")} where id = $2 and family_id = $1`,
      params
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from workspace_pages where id = $2 and family_id = $1",
      [req.user.familyId, Number(req.params.id)]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
