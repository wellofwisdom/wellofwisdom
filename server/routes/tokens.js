// SPDX-License-Identifier: AGPL-3.0-or-later
// API token management: create/list/revoke own tokens (guide only).
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const perm = require("../lib/perm");
const apiTokens = require("../lib/apiTokens");

const router = express.Router();
router.use(auth.authRequired);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

router.get("/", async (req, res, next) => {
  try {
    if (req.user.role !== "parent") return bad(res, "parent_only", 403);
    const rows = await apiTokens.listTokens({ familyId: req.user.familyId, userId: req.user.id });
    res.json({ tokens: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      scopes: r.scopes,
      lastUsedAt: r.last_used_at,
      createdAt: r.created_at,
      revokedAt: r.revoked_at,
    })) });
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    if (req.user.role !== "parent") return bad(res, "parent_only", 403);
    // A token acts as its guide. An observer may never act, so an observer
    // may never mint one (their existing ones still revoke, see DELETE).
    if (perm.isReadOnly(req.user)) return bad(res, "read_only", 403);
    // Demo families are shared by many strangers at once. A token minted
    // there would outlive the demo session as a standing credential, so
    // creation is refused until the family upgrades.
    const fam = await db.query("select is_demo from families where id = $1", [req.user.familyId]);
    if (fam.rows[0] && fam.rows[0].is_demo) return bad(res, "demo_forbidden", 403);
    const { name, scopes } = req.body || {};
    const created = await apiTokens.createToken({
      familyId: req.user.familyId,
      userId: req.user.id,
      name,
      scopes,
    });
    res.status(201).json({
      token: created.token,
      id: Number(created.id),
      name: created.name,
      scopes: created.scopes,
      createdAt: created.created_at,
    });
  } catch (err) {
    if (err.code === "name_required" || err.code === "name_too_long" || err.code === "scopes_required") return bad(res, err.code);
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (req.user.role !== "parent") return bad(res, "parent_only", 403);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const row = await apiTokens.revokeToken({ id, familyId: req.user.familyId, userId: req.user.id });
    if (!row) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
