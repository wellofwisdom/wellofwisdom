// SPDX-License-Identifier: AGPL-3.0-or-later
// Server-side grading. Answers NEVER go to the learner's browser — the client
// sends an answer, the server compares, records the attempt, returns the verdict.

// Parse kid-typed numbers: "5/8" → 0.625, "1 3/4" → 1.75, "$3.50" → 3.5, "2.5" → 2.5.
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

// mcq: answer = choice id. numeric: answer = number (0.5% tolerance).
// text: self-check — model answer is shown, learner judges themselves (null).
function gradeExercise(item, learnerAnswer) {
  switch (item.kind) {
    case "mcq": {
      const id = String(learnerAnswer ?? "");
      const valid = (item.choices || []).some((c) => c.id === id);
      return valid && String(item.answer ?? "") === id;
    }
    case "numeric": {
      const expected = Number(item.answer);
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

// HTML → readable text (rough and safe: tags stripped, entities decoded).
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

module.exports = { gradeExercise, youtubeId, safeSourceUrl, htmlToText };
