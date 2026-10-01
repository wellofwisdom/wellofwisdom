// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio overviews (guide): generate a two-host podcast summary for a unit and
// read it back. The heavy work runs as an "overview" job (see lib/jobs.js and
// lib/overview.js); these routes only validate, enqueue, and poll. Generation
// spends AI tokens and TTS credits, so it sits on the same spend_media gate as
// image and video generation.
const express = require("express");
const auth = require("../lib/auth");
const db = require("../lib/db");
const jobs = require("../lib/jobs");
const ai = require("../lib/ai");
const media = require("../lib/media");
const overview = require("../lib/overview");

const router = express.Router();
router.use(auth.parentOnly);

function bad(res, msg, code = 400) {
  return res.status(code).json({ error: msg });
}

async function unitOwned(unitId, familyId) {
  const { rows } = await db.query(
    `select u.id from units u join courses c on c.id = u.course_id where u.id = $1 and c.family_id = $2`,
    [Number(unitId), familyId]
  );
  return Boolean(rows[0]);
}

router.get("/status", async (_req, res) => {
  const tts = media.speechStatus();
  res.json({ ai: ai.configured(), tts, canGenerate: ai.configured() && tts.configured });
});

router.post("/generate", auth.requirePerm("spend_media"), async (req, res, next) => {
  try {
    const unitId = Number((req.body || {}).unitId);
    if (!Number.isInteger(unitId)) return bad(res, "unit_invalid");
    if (!(await unitOwned(unitId, req.user.familyId))) return bad(res, "not_found", 404);
    if (!ai.configured()) return bad(res, "ai_not_configured", 503);
    if (!media.speechStatus().configured) return bad(res, "tts_not_configured", 503);
    const jobId = await jobs.enqueue(req.user.familyId, "overview", { unitId }, req.user.id);
    res.status(202).json({ jobId });
  } catch (err) {
    next(err);
  }
});

// Job progress for the generate button. Same shape as /api/courses/jobs/:id.
router.get("/job/:id", async (req, res, next) => {
  try {
    const job = await jobs.get(Number(req.params.id), req.user.familyId);
    if (!job) return bad(res, "not_found", 404);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

router.get("/for-unit/:unitId", async (req, res, next) => {
  try {
    const unitId = Number(req.params.unitId);
    if (!Number.isInteger(unitId)) return bad(res, "unit_invalid");
    if (!(await unitOwned(unitId, req.user.familyId))) return bad(res, "not_found", 404);
    res.json({ overview: await overview.latestOverview(unitId, req.user.familyId) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
