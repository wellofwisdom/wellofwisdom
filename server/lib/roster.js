// SPDX-License-Identifier: AGPL-3.0-or-later
// Roster import: CSV parsing and row validation for bulk learner creation.

const MAX_ROWS = 200;

function stripBom(s) {
  if (!s) return "";
  const t = String(s);
  if (t.charCodeAt(0) === 0xfeff) return t.slice(1);
  return t;
}

function detectDelimiter(headerLine) {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_ALIASES = {
  name: ["name", "learner", "student", "full name", "fullname"],
  username: ["username", "user", "login", "handle"],
  grade: ["grade", "grade_level", "gradelevel", "level", "year"],
  interests: ["interests", "interest", "hobbies", "tags"],
  email: ["email", "e-mail", "mail"],
  target_language: ["target_language", "target language", "targetlanguage", "language", "lang"],
};

function normalizeHeader(h) {
  const low = String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      if (low === a.replace(/[^a-z0-9]/g, "")) return canonical;
    }
  }
  return null;
}

function normalizeRosterLang(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "en";
  if (s === "en" || s === "en-us" || s === "en-gb" || s === "english") return "en";
  if (s === "es" || s === "es-es" || s === "spanish" || s === "espanol" || s === "español") return "es";
  if (s === "fr" || s === "fr-fr" || s === "french" || s === "francais" || s === "français") return "fr";
  return null;
}

function parseCsv(raw) {
  let text = stripBom(String(raw || ""));
  if (!text.trim()) return { headers: [], rows: [] };
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delim);
  const headers = rawHeaders.map(normalizeHeader);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.every((c) => c === "")) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (key) row[key] = cells[j] != null ? cells[j] : "";
    }
    row.__raw = cells;
    rows.push(row);
  }
  return { headers: rawHeaders, mappedHeaders: headers, rows, delim };
}

function toUsername(name, used) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16) || "learner";
  let cand = base.slice(0, 24);
  if (cand.length < 2) cand = cand + "01";
  if (!used.has(cand) && /^[a-z0-9_.-]{2,24}$/.test(cand)) return cand;
  for (let n = 1; n < 1000; n++) {
    const suff = String(n);
    const pref = base.slice(0, 24 - suff.length);
    const tryName = pref + suff;
    if (!used.has(tryName) && /^[a-z0-9_.-]{2,24}$/.test(tryName)) return tryName;
  }
  return cand;
}

function validateRows(rows, existingUsernames) {
  const existingSet = new Set((existingUsernames || []).map((u) => String(u).toLowerCase()));
  const fileSeen = new Map();
  const out = [];
  let capExceeded = false;
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const errors = [];
    const name = String(r.name || "").trim();
    if (!name) errors.push("name_required");
    else if (name.length > 80) errors.push("name_too_long");

    let username = String(r.username || "").trim().toLowerCase();
    if (username && !/^[a-z0-9_.-]{2,24}$/.test(username)) errors.push("username_invalid");
    const effUsername = username || (name ? toUsername(name, new Set([...existingSet, ...fileSeen.keys()])) : "");
    if (username) {
      if (existingSet.has(username)) errors.push("username_taken");
      if (fileSeen.has(username)) errors.push("username_duplicate_in_file");
      fileSeen.set(username, idx);
    } else if (effUsername) {
      fileSeen.set(effUsername, idx);
    }

    let grade = null;
    const rawGrade = String(r.grade || "").trim();
    if (rawGrade) {
      const g = Number(rawGrade);
      if (!Number.isInteger(g) || g < 1 || g > 14) errors.push("grade_invalid");
      else grade = g;
    }

    const rawInterests = String(r.interests || "").trim();
    let interests = [];
    if (rawInterests) {
      interests = rawInterests.split(/[,;]/).map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    }

    let email = null;
    const rawEmail = String(r.email || "").trim();
    if (rawEmail) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) errors.push("email_invalid");
      else email = rawEmail.toLowerCase();
    }

    let language = "en";
    const rawLang = String(r.target_language != null ? r.target_language : r.language != null ? r.language : r.lang != null ? r.lang : "").trim();
    if (rawLang) {
      const norm = normalizeRosterLang(rawLang);
      if (!norm) errors.push("language_invalid");
      else language = norm;
    }

    if (idx >= MAX_ROWS) {
      capExceeded = true;
      errors.push("row_cap_exceeded");
    }

    out.push({
      index: idx,
      name,
      username: username || null,
      generatedUsername: !username && effUsername ? effUsername : null,
      grade,
      interests,
      email,
      language,
      errors,
      valid: errors.length === 0,
      raw: r.__raw || [],
    });
  }
  return { validated: out, capExceeded };
}

function buildParsableRows(rows) {
  return rows.map((r, idx) => ({
    name: String(r.name || "").trim().slice(0, 80),
    username: String(r.username || "").trim().toLowerCase() || null,
    grade: String(r.grade || "").trim() || null,
    interests: String(r.interests || "").trim() || null,
    email: String(r.email || "").trim() || null,
    target_language: String(r.target_language != null ? r.target_language : r.language != null ? r.language : "").trim() || null,
    __index: idx,
  }));
}

module.exports = {
  MAX_ROWS,
  stripBom,
  detectDelimiter,
  splitCsvLine,
  parseCsv,
  toUsername,
  validateRows,
  buildParsableRows,
  normalizeRosterLang,
};
