// SPDX-License-Identifier: AGPL-3.0-or-later
// Server-side grading. Answers NEVER go to the learner's browser. The client
// sends an answer, the server compares, records the attempt, returns the verdict.

// parseNumeric is kept here for external callers; per-kind grading lives in
// server/lib/items/kinds/* and this file just delegates to that registry.
function parseNumeric(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  const mixed = s.match(/^(-?\d+)\+(\d+)\/(\d+)$/); // unlikely but safe
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const mixedSpace = String(v ?? "").trim().match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedSpace) return Number(mixedSpace[1]) + Number(mixedSpace[2]) / Number(mixedSpace[3]);
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? NaN : Number(frac[1]) / denom;
  }
  return parseFloat(s);
}

// A kind is defined once, in server/lib/items/kinds/*. grading here is not a
// second place to add a new kind. doc/COURSE-BUILDER-V2.md principle 5.
function gradeExercise(item, learnerAnswer) {
  if (!item || typeof item !== "object") return null;
  if (item.kind != null) {
    try {
      const exercise = require("./items/exercise");
      const h = exercise.REGISTRY && exercise.REGISTRY[item.kind];
      if (h && typeof h.grade === "function") return h.grade(item, learnerAnswer);
    } catch {}
  }
  const keyless = item.answer == null || String(item.answer).trim() === "";
  switch (item.kind) {
    case "mcq": {
      if (keyless || !(item.choices || []).some((c) => c.id === item.answer)) return null;
      const id = String(learnerAnswer ?? "");
      const valid = (item.choices || []).some((c) => c.id === id);
      return valid && String(item.answer) === id;
    }
    case "numeric": {
      if (keyless) return null;
      const expected = parseNumeric(item.answer);
      const given = parseNumeric(learnerAnswer);
      if (!Number.isFinite(expected) || !Number.isFinite(given)) return false;
      const tol = Math.max(Math.abs(expected) * 0.005, 0.01);
      return Math.abs(expected - given) <= tol;
    }
    case "text":
      return null;
    default:
      return null;
  }
}

// Extract a YouTube video id from most URL shapes (or a bare id).
function youtubeId(input) {
  const s = String(input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/) || null;
  return m ? m[1] : null;
}

// SSRF guard for parent-supplied source URLs: plain http(s) only, no obvious
// private hosts. (v1 guard; DNS-rebinding hardening can come with the proxy.)
function safeSourceUrl(raw) {
  let url = null;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    return null;
  }
  return url;
}

// HTML -> readable text (rough and safe: tags stripped, entities decoded).
function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

module.exports = { gradeExercise, parseNumeric, youtubeId, safeSourceUrl, htmlToText };
