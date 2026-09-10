// SPDX-License-Identifier: AGPL-3.0-or-later
// Check a .wow-course.json package the way an import will read it, and say
// exactly what would not survive.
//
// Import is forgiving on purpose: it drops an item it cannot use, trims a
// course to its maximum size, and keeps a question whose answer was not
// shared. For a person importing one course that is right. For a library of
// courses other people contributed it is not: a file that loses its seventh
// lesson on every import should be caught when it is submitted, with the
// place named, not discovered by a teacher mid-term. This is that check, and
// it is what a community-courses repository runs on every pull request
// (scripts/validate-course.js is the command line around it).
//
// It walks the package with the SAME rules as coursegen.normalizeCourse (the
// limits are imported, not copied), and a test asserts that what it says
// survives is what normalizeCourse actually keeps.
const cg = require("./coursegen");
const { LICENSES } = require("./share");

// Licences that let a stranger adapt and redistribute a course, which is what
// a shared library needs. "all-rights-reserved" is a real choice for a course
// published on someone's own instance, but not one a library can accept.
const OPEN_LICENSES = LICENSES.filter((l) => l !== "all-rights-reserved");

const { stripTags } = require("./text");

// A title the normalizer will keep: a string with something left once tags
// are stripped, exactly as coursegen's clean() sees it.
const has = (v) => typeof v === "string" && stripTags(v.trim()).trim() !== "";

function where(u, l, i) {
  const parts = [`unit ${u + 1}`];
  if (l != null) parts.push(`lesson ${l + 1}`);
  if (i != null) parts.push(`item ${i + 1}`);
  return parts.join(", ");
}

/**
 * pkg: the parsed JSON. Options:
 *   requireOpenLicense  a licence from OPEN_LICENSES must be named (a library)
 *   allowMissingAnswers questions without keys are warnings, not errors
 * Returns { ok, errors, warnings, stats } where each problem is
 * { at, message } and stats counts what an import would actually keep.
 */
function checkPackage(pkg, { requireOpenLicense = false, allowMissingAnswers = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (at, message) => errors.push({ at, message });
  const warn = (at, message) => warnings.push({ at, message });
  const stats = { units: 0, lessons: 0, items: 0, questions: 0, missingAnswers: 0 };

  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    err("file", "not a JSON object");
    return { ok: false, errors, warnings, stats };
  }
  if (pkg.format !== "wellofwisdom-course") err("file", 'format must be "wellofwisdom-course"');
  if (!has(pkg.title)) err("course", "has no title");

  if (requireOpenLicense) {
    if (!pkg.license) err("course", `names no licence (one of ${OPEN_LICENSES.join(", ")})`);
    else if (!OPEN_LICENSES.includes(pkg.license)) {
      err("course", `licence "${pkg.license}" does not let others adapt and share it (use ${OPEN_LICENSES.join(", ")})`);
    }
  } else if (pkg.license && !LICENSES.includes(pkg.license)) {
    warn("course", `licence "${pkg.license}" is not one this app knows`);
  }

  const units = Array.isArray(pkg.units) ? pkg.units : [];
  if (!units.length) err("course", "has no units");
  if (units.length > cg.MAX_UNITS) {
    err(`unit ${cg.MAX_UNITS + 1}`, `and after are dropped: a course holds at most ${cg.MAX_UNITS} units (${units.length} given)`);
  }

  units.slice(0, cg.MAX_UNITS).forEach((u, ui) => {
    if (!u || typeof u !== "object") return err(where(ui), "is not an object and is dropped");
    const lessons = Array.isArray(u.lessons) ? u.lessons : [];
    if (lessons.length > cg.LESSONS_SCANNED) {
      err(where(ui, cg.LESSONS_SCANNED), `and after are dropped: only the first ${cg.LESSONS_SCANNED} lessons of a unit are read`);
    }
    let keptLessons = 0;
    // Counted per unit and added only if the unit itself survives.
    const unitStats = { lessons: 0, items: 0, questions: 0, missingAnswers: 0 };
    lessons.slice(0, cg.LESSONS_SCANNED).forEach((l, li) => {
      if (!l || typeof l !== "object") return err(where(ui, li), "is not an object and is dropped");
      if (!has(l.title)) return err(where(ui, li), "has no title and is dropped with its items");
      const items = Array.isArray(l.items) ? l.items : [];
      let keptItems = 0;
      const lessonStats = { items: 0, questions: 0, missing: 0 };
      items.forEach((item, ii) => {
        const at = where(ui, li, ii);
        const type = item && item.type;
        const clean = cg.normalizeItem(item);
        if (!clean) {
          const why = cg.itemProblem(item) || "content_invalid";
          return err(at, `(${type || "no type"}) is dropped: ${why}`);
        }
        if (keptItems >= cg.MAX_ITEMS) {
          return err(at, `is dropped: a lesson holds at most ${cg.MAX_ITEMS} items`);
        }
        keptItems++;
        // What the normalizer keeps but changes: a sixth choice, a fifth video
        // question. itemProblem names these, because an edit refuses them too.
        const changed = cg.itemProblem(item);
        if (changed && !/^answer_(required|invalid)$/.test(changed)) err(at, `(${type}) loses content on import: ${changed}`);
        const missing = cg.missingAnswers([clean]);
        const questions = clean.type === "exercise" ? 1 : clean.type === "video" ? (clean.content.questions || []).length : 0;
        lessonStats.items++;
        lessonStats.questions += questions;
        lessonStats.missing += missing;
        if (missing) {
          const msg = `(${type}) has ${missing === 1 ? "a question" : `${missing} questions`} with no usable answer key`;
          (allowMissingAnswers ? warn : err)(at, msg);
        }
      });
      if (!keptItems) return err(where(ui, li), "has no usable items and is dropped");
      if (keptLessons >= cg.MAX_LESSONS) {
        return err(where(ui, li), `is dropped: a unit holds at most ${cg.MAX_LESSONS} lessons`);
      }
      keptLessons++;
      unitStats.lessons++;
      unitStats.items += lessonStats.items;
      unitStats.questions += lessonStats.questions;
      unitStats.missingAnswers += lessonStats.missing;
    });
    if (!has(u.title)) return err(where(ui), "has no title and is dropped with all its lessons");
    if (!keptLessons) return err(where(ui), "has no usable lessons and is dropped");
    stats.units++;
    for (const k of Object.keys(unitStats)) stats[k] += unitStats[k];
  });

  return { ok: errors.length === 0, errors, warnings, stats };
}

module.exports = { checkPackage, OPEN_LICENSES };
