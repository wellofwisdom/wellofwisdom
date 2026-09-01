// SPDX-License-Identifier: AGPL-3.0-or-later
// The grown-ups in a family: who they are, what they may do, and how a new one
// gets in.
//
// Invites are single-use, expiring links, which is what replaces handing round
// a join code that never rotates. The token is shown once at creation and only
// its hash is stored, so a leaked database does not hand out family access.
const crypto = require("node:crypto");
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const perm = require("../lib/perm");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function num(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function hashToken(t) {
  return crypto.createHash("sha256").update(String(t)).digest("hex");
}

router.get("/roles", auth.authRequired, (_req, res) => {
  res.json({
    roles: Object.values(perm.GUIDE_ROLES)
      .sort((a, b) => b.rank - a.rank)
      .map((r) => ({ id: r.id, label: r.label, blurb: r.blurb })),
  });
});

/** Everyone who can sign in as a grown-up here. */
router.get("/", auth.authRequired, async (req, res, next) => {
  try {
    if (!perm.can(req.user, "view_progress")) return bad(res, "not_allowed", 403);
    const { rows } = await db.query(
      `select u.id, u.name, u.email, u.guide_role, u.created_at,
              coalesce(array_agg(gl.learner_id) filter (where gl.learner_id is not null), '{}') as learner_ids
         from users u
         left join guide_learners gl on gl.guide_id = u.id
        where u.family_id = $1 and u.role = 'parent'
        group by u.id
        order by u.created_at`,
      [req.user.familyId]
    );
    res.json({
      guides: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        guide_role: r.guide_role || "owner",
        learner_ids: (r.learner_ids || []).map(Number),
        is_you: Number(r.id) === Number(req.user.id),
      })),
      you: { id: req.user.id, guideRole: req.user.guideRole },
    });
  } catch (err) {
    next(err);
  }
});

/** Change someone's role. Owners only, and never the last owner. */
router.put("/:id/role", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const id = num(req.params.id);
    const next_ = String((req.body || {}).role || "");
    if (!perm.GUIDE_ROLES[next_]) return bad(res, "role_invalid");

    const t = await db.query(
      "select id, guide_role from users where id = $1 and family_id = $2 and role = 'parent'",
      [id, req.user.familyId]
    );
    const target = t.rows[0];
    if (!target) return bad(res, "not_found", 404);

    // Demoting the last owner leaves nobody who can administer the family.
    if ((target.guide_role || "owner") === "owner" && next_ !== "owner") {
      const owners = await db.query(
        "select count(*)::int as n from users where family_id = $1 and role = 'parent' and coalesce(guide_role,'owner') = 'owner'",
        [req.user.familyId]
      );
      if (owners.rows[0].n <= 1) return bad(res, "last_owner");
    }

    await db.query("update users set guide_role = $3 where id = $1 and family_id = $2",
      [id, req.user.familyId, next_]);
    // Leaving the assistant role makes an assignment list meaningless.
    if (next_ !== "assistant") {
      await db.query("delete from guide_learners where guide_id = $1", [id]).catch(() => {});
    }
    res.json({ ok: true, role: next_ });
  } catch (err) {
    next(err);
  }
});

/** Which learners an assistant may see. */
router.put("/:id/learners", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const id = num(req.params.id);
    const ids = Array.isArray((req.body || {}).learnerIds)
      ? req.body.learnerIds.map(num).filter((n) => n !== null)
      : [];
    const owned = await db.query(
      "select id from users where family_id = $1 and role = 'learner' and id = any($2::bigint[])",
      [req.user.familyId, ids]
    );
    const valid = owned.rows.map((r) => Number(r.id));

    await db.query("delete from guide_learners where guide_id = $1", [id]);
    for (const learnerId of valid) {
      await db.query(
        "insert into guide_learners (guide_id, learner_id) values ($1,$2) on conflict do nothing",
        [id, learnerId]
      );
    }
    res.json({ ok: true, learnerIds: valid });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const id = num(req.params.id);
    const t = await db.query(
      "select id, guide_role from users where id = $1 and family_id = $2 and role = 'parent'",
      [id, req.user.familyId]
    );
    if (!t.rows[0]) return bad(res, "not_found", 404);
    const owners = await db.query(
      "select count(*)::int as n from users where family_id = $1 and role = 'parent' and coalesce(guide_role,'owner') = 'owner'",
      [req.user.familyId]
    );
    const verdict = perm.canRemoveGuide(
      req.user,
      { id, guideRole: t.rows[0].guide_role || "owner" },
      owners.rows[0].n
    );
    if (!verdict.ok) return bad(res, verdict.reason, verdict.reason === "not_allowed" ? 403 : 400);

    await db.query("delete from users where id = $1 and family_id = $2", [id, req.user.familyId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- invites

router.get("/invites", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select id, guide_role, learner_ids, note, expires_at, used_at, created_at
         from invites where family_id = $1 and used_at is null and expires_at > now()
        order by created_at desc`,
      [req.user.familyId]
    );
    res.json({ invites: rows.map((r) => ({ ...r, id: Number(r.id) })) });
  } catch (err) {
    next(err);
  }
});

/** Create one. The token is returned ONCE and never stored in the clear. */
router.post("/invites", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const guideRole = String(b.role || "guide");
    if (!perm.invitableRoles(req.user).includes(guideRole)) return bad(res, "role_invalid");
    const days = Math.min(30, Math.max(1, Number(b.days) || 7));
    const learnerIds = Array.isArray(b.learnerIds) ? b.learnerIds.map(num).filter((n) => n !== null) : [];

    const token = crypto.randomBytes(24).toString("base64url");
    const { rows } = await db.query(
      `insert into invites (family_id, token_hash, guide_role, learner_ids, note, expires_at, created_by)
       values ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval, $7)
       returning id, guide_role, expires_at`,
      [req.user.familyId, hashToken(token), guideRole, learnerIds,
        b.note ? String(b.note).slice(0, 200) : null, String(days), req.user.id]
    );
    res.status(201).json({
      invite: { ...rows[0], id: Number(rows[0].id) },
      token, // shown once
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/invites/:id", auth.requirePerm("manage_guides"), async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      "delete from invites where id = $1 and family_id = $2 and used_at is null",
      [num(req.params.id), req.user.familyId]
    );
    if (!rowCount) return bad(res, "not_found", 404);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** What an invite is for, before someone commits to signing up. No auth: the
 *  token is the credential. Returns nothing that identifies the family beyond
 *  its name, so a guessed token leaks almost nothing. */
router.get("/invites/peek/:token", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select i.guide_role, i.note, i.expires_at, f.name as family_name
         from invites i join families f on f.id = i.family_id
        where i.token_hash = $1 and i.used_at is null and i.expires_at > now()`,
      [hashToken(req.params.token)]
    );
    if (!rows[0]) return bad(res, "invite_invalid", 404);
    res.json({ invite: rows[0], role: perm.GUIDE_ROLES[rows[0].guide_role] || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.hashToken = hashToken;
