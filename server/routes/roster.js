// SPDX-License-Identifier: AGPL-3.0-or-later
// Roster import: bulk creation of learners via CSV.
const express = require("express");
const crypto = require("node:crypto");
const db = require("../lib/db");
const auth = require("../lib/auth");
const roster = require("../lib/roster");

const router = express.Router();

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

function genPin() {
  const n = crypto.randomInt(1000, 10000);
  return String(n);
}

function parseBodyCsv(reqBody) {
  const body = reqBody || {};
  if (typeof body.csv === "string") return body.csv;
  if (typeof body.text === "string") return body.text;
  return "";
}

async function buildValidation(familyId, rawCsv) {
  const parsed = roster.parseCsv(rawCsv);
  const rows = parsed.rows;
  const trimmed = rows.slice(0, roster.MAX_ROWS + 1);
  const capExceeded = rows.length > roster.MAX_ROWS;
  const existing = await db.query(
    "select username from users where family_id = $1 and role = 'learner'",
    [familyId]
  );
  const existingNames = existing.rows.map((r) => r.username);
  const validated = roster.validateRows(
    trimmed.map((r) => {
      const copy = { ...r };
      copy.__raw = r.__raw;
      return copy;
    }),
    existingNames
  );
  if (capExceeded && !validated.capExceeded) validated.capExceeded = true;
  const totalRows = Math.min(rows.length, roster.MAX_ROWS + 1);
  return {
    rows: validated.validated.slice(0, roster.MAX_ROWS),
    capExceeded: validated.capExceeded || capExceeded,
    totalRows: rows.length,
    ignoredBeyondCap: Math.max(0, rows.length - roster.MAX_ROWS),
  };
}

// POST /api/roster/preview  { csv: string } -> { rows: [...], capExceeded }
router.post("/preview", auth.requirePerm("create_learner"), async (req, res, next) => {
  try {
    const limit = auth.loginLimit(`${req.ip || "unknown"}:roster-preview`, { max: 30, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });
    const rawCsv = parseBodyCsv(req.body);
    if (!String(rawCsv || "").trim()) return bad(res, "csv_required");
    if (String(rawCsv).length > 500000) return bad(res, "csv_too_large");
    const v = await buildValidation(req.user.familyId, String(rawCsv));
    res.json({ rows: v.rows, capExceeded: v.capExceeded, totalRows: v.totalRows, ignoredBeyondCap: v.ignoredBeyondCap });
  } catch (err) {
    next(err);
  }
});

// POST /api/roster/import { csv: string } -> { created: [...{name, username, pin}], failed: [...] }
router.post("/import", auth.requirePerm("create_learner"), async (req, res, next) => {
  try {
    const limit = auth.loginLimit(`${req.ip || "unknown"}:roster-import`, { max: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.ok) return res.status(429).json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec });
    const rawCsv = parseBodyCsv(req.body);
    if (!String(rawCsv || "").trim()) return bad(res, "csv_required");
    if (String(rawCsv).length > 500000) return bad(res, "csv_too_large");
    const v = await buildValidation(req.user.familyId, String(rawCsv));
    const valid = v.rows.filter((r) => r.valid);
    if (!valid.length) {
      return res.json({ created: [], failed: v.rows.filter((r) => !r.valid).map((r) => ({ index: r.index, errors: r.errors })) });
    }

    const learners = require("../lib/learners");

    await db.query("BEGIN");
    try {
      const existing = await db.query(
        "select username from users where family_id = $1 and role = 'learner' for update",
        [req.user.familyId]
      );
      const taken = new Set(existing.rows.map((r) => String(r.username).toLowerCase()));

      const created = [];
      for (const row of valid) {
        let username = row.username;
        if (!username) {
          username = row.generatedUsername || roster.toUsername(row.name, taken);
          let attempt = 0;
          while (taken.has(username) && attempt < 20) {
            username = roster.toUsername(row.name, taken);
            attempt++;
          }
        } else {
          username = String(username).toLowerCase();
        }
        if (taken.has(username)) {
          await db.query("ROLLBACK");
          return bad(res, "username_taken", 409);
        }
        if (!/^[a-z0-9_.-]{2,24}$/.test(username)) {
          await db.query("ROLLBACK");
          return bad(res, "username_invalid");
        }
        taken.add(username);
        const pin = genPin();
        const pinHash = auth.hashPin(String(pin));
        const grade = row.grade != null ? row.grade : null;
        const interests = Array.isArray(row.interests) ? row.interests : [];
        const email = row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(row.email)) ? String(row.email).toLowerCase() : null;
        const ins = await db.query(
          `insert into users (family_id, role, name, username, pin_hash, grade_level, interests, email)
           values ($1,'learner',$2,$3,$4,$5,$6,$7) returning id, name, username`,
          [req.user.familyId, String(row.name).slice(0, 80), username, pinHash, grade, interests, email]
        );
        const inserted = ins.rows[0];
        created.push({ id: Number(inserted.id), name: inserted.name, username: inserted.username, pin });
      }
      await db.query("COMMIT");
      const failed = v.rows.filter((r) => !r.valid).map((r) => ({ index: r.index, errors: r.errors }));
      res.json({ created, failed, capExceeded: v.capExceeded });
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

router.get("/template", auth.requirePerm("create_learner"), async (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="roster-template.csv"');
  res.send("name,username,grade,interests,email\nMaya Smith,maya,5,sewing; horses,maya@example.com\nJon Doe,,3,space,\n");
});

module.exports = router;
