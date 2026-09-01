// SPDX-License-Identifier: AGPL-3.0-or-later
// Upload and stream media. The upload body is the raw file. No multipart, so
// no parser dependency: the browser sends the File object straight as the
// request body and names it in a header.
const express = require("express");
const db = require("../lib/db");
const auth = require("../lib/auth");
const store = require("../lib/uploads");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

// Raw body for the biggest thing we accept. express.raw buffers, which is fine
// at these sizes and keeps the write atomic.
const rawBody = express.raw({
  type: store.acceptedMimes(),
  limit: `${Number(process.env.UPLOAD_MAX_VIDEO_MB || 500)}mb`,
});

/** POST /api/uploads, body is the file, Content-Type is its mime. */
router.post("/", auth.parentOnly, rawBody, async (req, res, next) => {
  try {
    const mime = String(req.get("content-type") || "").split(";")[0].trim();
    const t = store.typeFor(mime);
    if (!t) return bad(res, "unsupported_type", 415);
    if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, "empty_body");
    if (req.body.length > store.maxBytesFor(t.kind)) return bad(res, "too_large", 413);

    const saved = await store.save(req.user.familyId, mime, req.body);
    const title = String(req.get("x-upload-title") || "").slice(0, 200) || null;
    const originalName = String(req.get("x-upload-name") || "").slice(0, 260) || null;

    const { rows } = await db.query(
      `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id, kind, mime, bytes, title, original_name, is_public, created_at`,
      [req.user.familyId, saved.kind, mime, saved.bytes, saved.key, originalName, title, req.user.id]
    );
    const row = rows[0];
    res.status(201).json({ upload: { ...row, id: Number(row.id), url: `/media/${row.id}` } });
  } catch (err) {
    if (err.message === "too_large") return bad(res, "too_large", 413);
    if (err.message === "unsupported_type") return bad(res, "unsupported_type", 415);
    next(err);
  }
});

/** What this family has uploaded. */
router.get("/", auth.parentOnly, async (req, res, next) => {
  try {
    const kind = req.query.kind ? String(req.query.kind) : null;
    const { rows } = await db.query(
      `select id, kind, mime, bytes, title, original_name, duration_sec, poster_url, is_public, created_at
         from uploads where family_id = $1 ${kind ? "and kind = $2" : ""}
        order by created_at desc limit 200`,
      kind ? [req.user.familyId, kind] : [req.user.familyId]
    );
    res.json({
      uploads: rows.map((r) => ({ ...r, id: Number(r.id), bytes: Number(r.bytes), url: `/media/${r.id}` })),
      usage: await store.familyUsage(db, req.user.familyId),
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", auth.parentOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { title, isPublic } = req.body || {};
    const sets = [];
    const params = [req.user.familyId, id];
    if (title !== undefined) { params.push(String(title).slice(0, 200) || null); sets.push(`title = $${params.length}`); }
    if (isPublic !== undefined) { params.push(Boolean(isPublic)); sets.push(`is_public = $${params.length}`); }
    if (!sets.length) return bad(res, "nothing_to_update");
    const { rows } = await db.query(
      `update uploads set ${sets.join(", ")} where id = $2 and family_id = $1
       returning id, kind, mime, bytes, title, is_public`,
      params
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    res.json({ upload: { ...rows[0], id: Number(rows[0].id), bytes: Number(rows[0].bytes) } });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", auth.parentOnly, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { rows } = await db.query(
      "delete from uploads where id = $1 and family_id = $2 returning storage_key",
      [id, req.user.familyId]
    );
    if (!rows[0]) return bad(res, "not_found", 404);
    await store.remove(rows[0].storage_key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** GET /media/:id. The streaming endpoint, mounted at the app root.
 *  Public files are open (a trailer on a shared course); everything else needs
 *  a session in the owning family. Learners included: they have to watch it. */
async function streamHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return bad(res, "id_invalid");
    const { rows } = await db.query(
      "select id, family_id, kind, mime, storage_key, original_name, is_public from uploads where id = $1",
      [id]
    );
    const up = rows[0];
    if (!up) return bad(res, "not_found", 404);

    if (!up.is_public) {
      const user = req.user;
      if (!user) return bad(res, "auth_required", 401);
      if (Number(user.familyId) !== Number(up.family_id)) return bad(res, "forbidden", 403);
    }

    const ok = await store.stream(res, up.storage_key, up.mime, {
      rangeHeader: req.get("range"),
      download: req.query.download ? (up.original_name || `upload-${id}`) : null,
    });
    if (!ok) return bad(res, "file_missing", 410);
  } catch (err) {
    next(err);
  }
}

module.exports = router;
module.exports.streamHandler = streamHandler;
