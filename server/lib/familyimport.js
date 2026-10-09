// SPDX-License-Identifier: AGPL-3.0-or-later
// Family import: the restore side of GET /api/family/export.
//
// Takes the zip the export route produces (family.json manifest, one
// courses/<id>.wow-course.json per course, uploads/<id>.<ext> binaries),
// validates its shape, then either reports what it would create (dry run)
// or creates it inside the CURRENT guide's family (confirm).
//
// Contract, from the wave 7 packet:
//   validate before anything writes; a dry run writes nothing; a second
//   import of the same zip reports duplicates as skipped instead of
//   doubling rows; everything lands in the current family only; a partial
//   failure leaves a per-section report; guides and the family row itself
//   are never touched (the importing guide keeps their own account).
//
// Transactions follow the PR 113 lesson: one client per unit of work. Each
// section runs in its own db.transaction, so a bad section rolls back alone
// and the report says exactly what landed.
//
// Known limit, by design: attempts, lesson completions and the review
// schedule point at lesson_items ids the export does not carry (the course
// payload exports type and content, not ids), so work history cannot be
// re-anchored to the freshly imported courses. Those sections restore as a
// clear "not restorable" line rather than guessing.

const crypto = require("node:crypto");
const db = require("./db");
const auth = require("./auth");
const zipread = require("./zipread");

const MAX_LEARNERS = 500;
const MAX_COURSE_FILES = 200;
const MAX_SECTION_ROWS = 20000;

const SECTION_LABELS = {
  learners: "Learners",
  courses: "Courses",
  uploads: "Media files",
  plans: "Term plans",
  planEnrollments: "Plan enrollments",
  planMilestones: "Plan milestones",
  events: "Calendar events",
  notes: "Notes",
  resources: "Resources",
  reports: "Progress reports",
  attendance: "Attendance days",
  assessments: "Assessments",
  badges: "Badges",
  tutorThreads: "Tutor threads",
  tutorMessages: "Tutor messages",
  attempts: "Learner attempts",
  completions: "Lesson completions",
  reviewSchedule: "Review schedule",
  guides: "Guides",
};

// Report order: parents before children, mirrors the insert order.
const SECTION_ORDER = [
  "learners", "courses", "uploads", "guides", "plans", "planEnrollments",
  "planMilestones", "events", "notes", "resources", "reports", "attendance",
  "assessments", "badges", "tutorThreads", "tutorMessages", "attempts",
  "completions", "reviewSchedule",
];

const WORK_HISTORY_KEYS = ["attempts", "completions", "reviewSchedule"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USERNAME_RE = /^[a-z0-9_.-]{2,24}$/;
const RESOURCE_TYPES = ["link", "video", "book", "tool", "place", "note"];
const RESOURCE_STATUS = ["inbox", "queued", "in_use", "done"];
const EVENT_KINDS = ["session", "deadline", "field_trip", "exam", "other"];
const PLAN_STATUS = ["draft", "active", "archived"];
const UPLOAD_KINDS = ["video", "image", "audio"];
const ASSESSMENT_KINDS = ["test", "evaluation", "other"];

class ShapeError extends Error {
  constructor(problems) {
    super(`shape_invalid: ${problems.length} problem(s)`);
    this.code = "shape_invalid";
    this.problems = problems;
  }
}

function md5(s) {
  return crypto.createHash("md5").update(String(s), "utf8").digest("hex");
}

// pg hands bigint columns back as strings; the manifest carries both shapes.
function asInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function isStr(v) { return typeof v === "string"; }

function optStr(row, field, max) {
  const val = row ? row[field] : undefined;
  if (val === null || val === undefined || val === "") return null;
  return String(val).slice(0, max);
}

// An ISO timestamp string the way JSON.stringify writes one, or a Date the
// way pg hands one back (dates in the manifest can be either). undefined
// means "absent or unusable", and the insert falls back to now().
function isoTs(v) {
  if (isStr(v) && v) {
    return Number.isNaN(new Date(v).getTime()) ? undefined : v;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return undefined;
}

// DATE columns come back from pg as Date objects pinned to UTC midnight, so
// an export's JSON reads them as "...T00:00:00.000Z" regardless of server
// timezone. Normalize to the UTC calendar day: both sides of the dup check
// then agree in any timezone, and the restored date equals the date the
// exporting family had. A date-only string passes through untouched.
function utcDateOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function normalizeDate(v) {
  if (isStr(v)) {
    const s = v.trim();
    if (DATE_RE.test(s)) return s;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : utcDateOf(d);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return utcDateOf(v);
  return null;
}

function isoDate(v) { return normalizeDate(v); }

// Same ext table the export route uses to name upload entries.
function extFor(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg")) return "mp3";
  return "bin";
}

// ---------------------------------------------------------------------------
// Shape validation. Everything that could hit a database constraint is
// checked here, so a confirm import sees clean rows or nothing at all.

function makeValidator() {
  const problems = [];
  const add = (msg) => { if (problems.length < 200) problems.push(msg); };
  return { problems, add };
}

function reqFields(v, section, i, row, fields) {
  for (const [field, kind] of fields) {
    const val = row[field];
    if (kind === "int") {
      if (!Number.isInteger(asInt(val))) v.add(`${section}[${i}].${field}: required whole number missing`);
    } else if (kind === "date") {
      checkDate(v, section, i, row, field, true);
    } else if (!isStr(val) || !val.trim()) {
      v.add(`${section}[${i}].${field}: required text missing`);
    }
  }
}

function checkInt(v, section, i, row, field, min, max) {
  const n = asInt(row[field]);
  if (Number.isNaN(n)) { v.add(`${section}[${i}].${field}: not a whole number`); return; }
  if (n === null) return;
  if ((min != null && n < min) || (max != null && n > max)) v.add(`${section}[${i}].${field}: out of range`);
}

function checkEnum(v, section, i, row, field, allowed) {
  const val = row[field];
  if (val === null || val === undefined || val === "") return;
  if (!allowed.includes(val)) v.add(`${section}[${i}].${field}: not one of ${allowed.join(", ")}`);
}

function checkDate(v, section, i, row, field, required) {
  if (row[field] === null || row[field] === undefined || row[field] === "") {
    if (required) v.add(`${section}[${i}].${field}: required date missing`);
    return;
  }
  if (!isoDate(row[field])) v.add(`${section}[${i}].${field}: not a date`);
}

function validateManifest(m, v) {
  const keys = ["family", "guides", "learners", "plans", "planMilestones", "planEnrollments", "events",
    "notes", "resources", "reports", "attendance", "assessments", "badges", "tutorThreads",
    "tutorMessages", "attempts", "completions", "reviewSchedule", "uploads"];
  for (const key of keys) {
    const val = m[key];
    if (key === "family") {
      if (!val || typeof val !== "object" || Array.isArray(val)) v.add("family.json: family object missing");
      continue;
    }
    if (!Array.isArray(val)) v.add(`family.json: ${key} section missing (not a wellofwisdom family export)`);
  }
  if (v.problems.length) return;

  // Sections whose ids other sections point at must carry them.
  const ided = [
    ["learners", [["name", "str"]]],
    ["uploads", [["kind", "str"], ["mime", "str"], ["bytes", "int"]]],
    ["plans", [["title", "str"], ["subject", "str"]]],
    ["notes", [["title", "str"]]],
    ["tutorThreads", [["learner_id", "int"]]],
  ];
  for (const [section, extra] of ided) {
    m[section].forEach((row, i) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) { v.add(`${section}[${i}]: not an object`); return; }
      reqFields(v, section, i, row, [["id", "int"], ...extra]);
    });
  }

  m.learners.forEach((row, i) => {
    const uname = isStr(row.username) ? row.username.trim().toLowerCase() : "";
    if (!uname || !USERNAME_RE.test(uname)) v.add(`learners[${i}].username: not a valid username`);
    checkInt(v, "learners", i, row, "grade_level", 1, 14);
    if (row.interests !== null && row.interests !== undefined && !Array.isArray(row.interests)) {
      v.add(`learners[${i}].interests: not a list`);
    }
    if (row.prefs !== null && row.prefs !== undefined && (typeof row.prefs !== "object" || Array.isArray(row.prefs))) {
      v.add(`learners[${i}].prefs: not an object`);
    }
  });
  const seen = new Set();
  for (const row of m.learners) {
    const uname = isStr(row.username) ? row.username.trim().toLowerCase() : "";
    if (uname) {
      if (seen.has(uname)) v.add(`learners: two rows share username ${uname}`);
      seen.add(uname);
    }
  }
  if (m.learners.length > MAX_LEARNERS) v.add(`learners: ${m.learners.length} rows over the cap of ${MAX_LEARNERS}`);

  m.uploads.forEach((row, i) => {
    checkEnum(v, "uploads", i, row, "kind", UPLOAD_KINDS);
    if (!Number.isInteger(asInt(row.bytes)) || asInt(row.bytes) <= 0) v.add(`uploads[${i}].bytes: must be a positive whole number`);
  });

  const checks = [
    ["plans", [["title", "str"], ["subject", "str"], ["start_date", "date"], ["end_date", "date"]]],
    ["planMilestones", [["plan_id", "int"], ["title", "str"]]],
    ["planEnrollments", [["plan_id", "int"], ["learner_id", "int"]]],
    ["events", [["title", "str"], ["on_date", "date"]]],
    ["resources", [["title", "str"]]],
    ["reports", [["learner_id", "int"], ["period_start", "date"], ["period_end", "date"], ["title", "str"]]],
    ["attendance", [["learner_id", "int"], ["day", "date"]]],
    ["assessments", [["learner_id", "int"], ["taken_on", "date"], ["title", "str"]]],
    ["badges", [["learner_id", "int"], ["badge", "str"]]],
    ["tutorMessages", [["thread_id", "int"], ["role", "str"], ["content", "str"]]],
    ["attempts", [["learner_id", "int"], ["item_id", "int"]]],
    ["completions", [["learner_id", "int"], ["course_id", "int"], ["lesson_id", "int"]]],
    ["reviewSchedule", [["learner_id", "int"], ["item_id", "int"]]],
  ];
  for (const [section, fields] of checks) {
    if (m[section].length > MAX_SECTION_ROWS) {
      v.add(`${section}: ${m[section].length} rows over the cap of ${MAX_SECTION_ROWS}`);
      continue;
    }
    m[section].forEach((row, i) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) { v.add(`${section}[${i}]: not an object`); return; }
      reqFields(v, section, i, row, fields);
      if (section === "plans") checkEnum(v, section, i, row, "status", PLAN_STATUS);
      if (section === "events") checkEnum(v, section, i, row, "kind", EVENT_KINDS);
      if (section === "resources") {
        checkEnum(v, section, i, row, "type", RESOURCE_TYPES);
        checkEnum(v, section, i, row, "status", RESOURCE_STATUS);
        checkInt(v, section, i, row, "rating", 0, 5);
      }
      if (section === "attendance") checkInt(v, section, i, row, "minutes", 0, 1440);
      if (section === "assessments") {
        checkEnum(v, section, i, row, "kind", ASSESSMENT_KINDS);
        if (isStr(row.title) && row.title.length > 160) v.add(`assessments[${i}].title: over 160 characters`);
        checkInt(v, section, i, row, "grade_level", 1, 14);
        if (row.scores !== null && row.scores !== undefined && !Array.isArray(row.scores)) v.add(`assessments[${i}].scores: not a list`);
      }
      if (section === "tutorMessages") checkEnum(v, section, i, row, "role", ["learner", "tutor"]);
    });
  }
}

// Parse + validate a family export zip. Throws (zip_invalid, zip_too_big or
// ShapeError with the full problem list) before any write can happen.
function parseFamilyZip(buffer) {
  const zip = zipread.parse(buffer);
  const manifest = zipread.json(zip, "family.json");
  if (manifest === null) throw new ShapeError(["family.json is missing from the zip"]);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new ShapeError(["family.json is not an object"]);
  }
  const v = makeValidator();
  validateManifest(manifest, v);
  if (v.problems.length) throw new ShapeError(v.problems);

  // Every course file must parse and carry the package marker, or the whole
  // zip is rejected: half a family is worse than none.
  const courses = [];
  const courseRe = /^courses\/(\d+)\.wow-course\.json$/;
  for (const name of zip.files.keys()) {
    const match = courseRe.exec(name);
    if (!match) continue;
    const payload = zipread.json(zip, name);
    if (!payload || typeof payload !== "object" || payload.format !== "wellofwisdom-course") {
      throw new ShapeError([`${name}: not a wellofwisdom-course package`]);
    }
    if (!isStr(payload.title) || !payload.title.trim()) throw new ShapeError([`${name}: course title missing`]);
    if (!Array.isArray(payload.units)) throw new ShapeError([`${name}: course has no units list`]);
    courses.push({ name, oldId: Number(match[1]), payload });
  }
  if (courses.length > MAX_COURSE_FILES) throw new ShapeError([`zip has ${courses.length} course files, over the cap of ${MAX_COURSE_FILES}`]);
  if (courses.length !== new Set(courses.map((c) => c.oldId)).size) throw new ShapeError(["two course files share an id"]);

  return { zip, manifest, courses };
}

// ---------------------------------------------------------------------------
// Duplicate keys. A second import of the same zip produces the same keys as
// the first, which is how the second run reports skips instead of doubling.

const dupKey = {
  learners: (row) => String(row.username || "").trim().toLowerCase(),
  uploads: (row) => `${optStr(row, "original_name", 255) || ""}|${asInt(row.bytes)}|${optStr(row, "title", 255) || ""}`,
  plans: (row) => `${optStr(row, "title", 200) || ""}|${isoDate(row.start_date)}|${isoDate(row.end_date)}`,
  events: (row) => `${optStr(row, "title", 200) || ""}|${isoDate(row.on_date)}|${optStr(row, "at_time", 8) || ""}`,
  notes: (row) => md5(`${optStr(row, "title", 200) || "Untitled"}\u0000${isStr(row.body) ? row.body : ""}`),
  resources: (row) => `${optStr(row, "title", 200) || ""}|${optStr(row, "url", 2000) || ""}|${row.type || "link"}`,
  // The learner id is the CURRENT family's id, not the manifest's old id:
  // a second import must match the first import's threads even though the
  // learners were renumbered. Callers resolve the id through the username.
  tutorThreads: (row, learnerId) => `${learnerId ?? "?"}|${optStr(row, "title", 200) || ""}|${isoTs(row.created_at) || ""}`,
};

async function loadExisting(familyId) {
  const rows = await Promise.all([
    db.query("select id, username from users where family_id = $1 and role = 'learner'", [familyId]),
    db.query("select id, username, role from users where family_id = $1", [familyId]),
    db.query("select id, title from courses where family_id = $1", [familyId]),
    db.query("select original_name, bytes, title from uploads where family_id = $1", [familyId]),
    db.query("select title, start_date, end_date from term_plans where family_id = $1", [familyId]),
    db.query("select title, on_date, at_time from events where family_id = $1", [familyId]),
    db.query("select title, body from workspace_pages where family_id = $1", [familyId]),
    db.query("select title, url, type from resources where family_id = $1", [familyId]),
    db.query("select learner_id, title, created_at from tutor_threads where family_id = $1", [familyId]),
  ]);
  return {
    learnerIdByUsername: new Map(rows[0].rows.map((r) => [String(r.username).toLowerCase(), Number(r.id)])),
    learnerUsernames: new Set(rows[1].rows.map((r) => String(r.username).toLowerCase())),
    courseTitles: new Map(rows[2].rows.map((r) => [String(r.title), Number(r.id)])),
    uploadKeys: new Set(rows[3].rows.map((r) => `${r.original_name || ""}|${Number(r.bytes)}|${r.title || ""}`)),
    planKeys: new Map(rows[4].rows.map((r) => [dupKey.plans(r), Number(r.id)])),
    eventKeys: new Set(rows[5].rows.map((r) => dupKey.events(r))),
    noteKeys: new Set(rows[6].rows.map((r) => dupKey.notes(r))),
    resourceKeys: new Set(rows[7].rows.map((r) => dupKey.resources(r))),
    threadKeys: new Set(rows[8].rows.map((r) => dupKey.tutorThreads(r, Number(r.learner_id)))),
  };
}

function newSection(key) {
  return { key, label: SECTION_LABELS[key] || key, create: 0, skipDuplicate: 0, skipOther: 0, notes: [], error: null };
}

function pushSection(list, s) {
  const i = SECTION_ORDER.indexOf(s.key);
  if (i < 0) list.push(s);
  else list.splice(Math.min(i, list.length), 0, s);
  return s;
}

const WORK_HISTORY_NOTE =
  "Not restorable: the export does not carry lesson item ids, so this history cannot be re-anchored to the imported courses.";

// Decide, for every section, what a confirm run would do. Shared by the dry
// run (no writes) and as the reference the confirm run reports against.
//   parentFate: old parent id -> "new" | "duplicate" | "unknown"
async function buildPlan(parsed, familyId) {
  const m = parsed.manifest;
  const existing = await loadExisting(familyId);

  // Fates: "new" (will be created), "duplicate" (already here, with the id
  // of the existing row so children can point at it), "created" (set by the
  // confirm run once the insert lands).
  const learnerFate = new Map();
  for (const row of m.learners) {
    learnerFate.set(asInt(row.id), existing.learnerUsernames.has(dupKey.learners(row)) ? { fate: "duplicate" } : { fate: "new" });
  }
  const courseFate = new Map(); // old course id -> { fate, courseId }
  for (const c of parsed.courses) {
    const at = existing.courseTitles.get(String(c.payload.title).trim());
    courseFate.set(c.oldId, at != null ? { fate: "duplicate", courseId: at } : { fate: "new" });
  }
  const planFate = new Map(); // old plan id -> { fate, planId }
  for (const row of m.plans) {
    const at = existing.planKeys.get(dupKey.plans(row));
    planFate.set(asInt(row.id), at != null ? { fate: "duplicate", planId: at } : { fate: "new" });
  }
  const threadFate = new Map(); // old thread id -> { fate }
  // Thread dup keys compare against CURRENT learner ids: on a second import
  // the manifest's old ids resolve through the username to the learners the
  // first import created.
  const oldLearnerUsername = new Map(m.learners.map((r) => [asInt(r.id), dupKey.learners(r)]));
  const resolveCurrentLearner = (oldId) => {
    const uname = oldLearnerUsername.get(oldId);
    return (uname && existing.learnerIdByUsername.get(uname)) || null;
  };
  for (const row of m.tutorThreads) {
    const key = dupKey.tutorThreads(row, resolveCurrentLearner(asInt(row.learner_id)));
    threadFate.set(asInt(row.id), existing.threadKeys.has(key) ? { fate: "duplicate" } : { fate: "new" });
  }

  const sections = [];

  {
    const s = newSection("learners");
    for (const row of m.learners) {
      if (learnerFate.get(asInt(row.id)).fate === "duplicate") s.skipDuplicate++;
      else s.create++;
    }
    if (s.create) s.notes.push("Restored learners get a fresh 4 digit PIN. The confirm step shows each PIN once.");
    sections.push(s);
  }

  {
    const s = newSection("courses");
    for (const c of parsed.courses) {
      if (courseFate.get(c.oldId).fate === "duplicate") s.skipDuplicate++;
      else s.create++;
    }
    if (s.create) s.notes.push("Courses come back as drafts. Learner assignment, publish state and trailers are not part of the export.");
    sections.push(s);
  }

  {
    const s = newSection("uploads");
    let missing = 0;
    for (const row of m.uploads) {
      const entryName = `uploads/${asInt(row.id)}.${extFor(row.mime)}`;
      if (existing.uploadKeys.has(dupKey.uploads(row))) s.skipDuplicate++;
      else if (!parsed.zip.files.has(entryName)) missing++;
      else s.create++;
    }
    if (missing) {
      s.skipOther = missing;
      s.notes.push(`${missing} file(s) have no bytes in the zip (they were already gone at export time).`);
    }
    sections.push(s);
  }

  {
    const s = newSection("guides");
    s.skipOther = (m.guides || []).length;
    s.notes.push("Guides keep their own accounts; this family's guide list is unchanged.");
    sections.push(s);
  }

  for (const [key, rows, keySet] of [
    ["plans", m.plans, existing.planKeys],
    ["events", m.events, existing.eventKeys],
    ["notes", m.notes, existing.noteKeys],
    ["resources", m.resources, existing.resourceKeys],
    ["tutorThreads", m.tutorThreads, existing.threadKeys],
  ]) {
    const s = newSection(key);
    for (const row of rows) {
      if (keySet.has(dupKey[key](row))) s.skipDuplicate++;
      else s.create++;
    }
    sections.push(s);
  }

  // Children: a row lands when its parent lands and nothing already has it.
  const child = (key) => newSection(key);
  const enroll = child("planEnrollments");
  for (const row of m.planEnrollments) {
    const pf = planFate.get(asInt(row.plan_id));
    const lf = learnerFate.get(asInt(row.learner_id));
    if (pf.fate === "duplicate" || lf.fate === "duplicate") enroll.skipDuplicate++;
    else if (pf.fate !== "new" || lf.fate !== "new") enroll.skipOther++;
    else enroll.create++;
  }
  sections.push(enroll);

  const mile = child("planMilestones");
  for (const row of m.planMilestones) {
    const pf = planFate.get(asInt(row.plan_id));
    if (pf.fate === "duplicate") mile.skipDuplicate++;
    else if (pf.fate !== "new") mile.skipOther++;
    else mile.create++;
  }
  sections.push(mile);

  const childByLearner = {
    reports: child("reports"),
    attendance: child("attendance"),
    assessments: child("assessments"),
    badges: child("badges"),
  };
  for (const key of Object.keys(childByLearner)) {
    for (const row of m[key]) {
      const lf = learnerFate.get(asInt(row.learner_id));
      if (lf.fate === "duplicate") childByLearner[key].skipDuplicate++;
      else if (lf.fate !== "new") childByLearner[key].skipOther++;
      else childByLearner[key].create++;
    }
    sections.push(childByLearner[key]);
  }

  const msgs = child("tutorMessages");
  for (const row of m.tutorMessages) {
    const tf = threadFate.get(asInt(row.thread_id));
    if (tf.fate === "duplicate") msgs.skipDuplicate++;
    else if (tf.fate !== "new") msgs.skipOther++;
    else msgs.create++;
  }
  sections.push(msgs);

  for (const key of WORK_HISTORY_KEYS) {
    const s = child(key);
    s.skipOther = m[key].length;
    s.notes.push(WORK_HISTORY_NOTE);
    sections.push(s);
  }

  sections.sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
  return { sections, learnerFate, courseFate, planFate, threadFate, existing };
}

// The dry run: read-only. Writes nothing.
async function planImport(parsed, familyId) {
  const plan = await buildPlan(parsed, familyId);
  return {
    dryRun: true,
    source: {
      familyName: (parsed.manifest.family && parsed.manifest.family.name) || null,
      exportedLearners: parsed.manifest.learners.length,
      exportedCourses: parsed.courses.length,
    },
    sections: plan.sections.map(({ key, label, create, skipDuplicate, skipOther, notes }) => ({ key, label, create, skipDuplicate, skipOther, notes })),
  };
}

// The confirm run: real inserts, one db.transaction per section, so a bad
// section rolls back alone and everything before it stays landed.
async function applyImport(parsed, user) {
  const familyId = Number(user.familyId);
  const userId = Number(user.id);
  const m = parsed.manifest;
  const plan = await buildPlan(parsed, familyId);
  const { learnerFate, courseFate, existing } = plan;

  const learnerMap = new Map(); // old learner id -> new user id
  const planMap = new Map(); // old plan id -> new plan id (existing or created)
  const threadMap = new Map(); // old thread id -> new thread id
  const sections = [];

  async function run(key, fn) {
    const s = newSection(key);
    try {
      await db.transaction(async (client) => {
        await fn(client, s);
      });
    } catch (err) {
      // The section's transaction rolled back: nothing landed, whatever the
      // counters picked up on the way down.
      s.error = err.message || String(err);
      s.create = 0;
      s.skipDuplicate = 0;
      s.skipOther = 0;
      s.pins = undefined;
    }
    sections.push(s);
    return s;
  }

  // Learners
  await run("learners", async (client, s) => {
    for (const row of m.learners) {
      if (learnerFate.get(asInt(row.id)).fate === "duplicate") { s.skipDuplicate++; continue; }
      const uname = dupKey.learners(row);
      const pin = String(crypto.randomInt(1000, 10000));
      const grade = asInt(row.grade_level);
      const interests = Array.isArray(row.interests)
        ? row.interests.slice(0, 12).map((x) => String(x).trim().slice(0, 40)).filter(Boolean)
        : [];
      const prefs = row.prefs && typeof row.prefs === "object" && !Array.isArray(row.prefs) ? row.prefs : {};
      const ins = await client.query(
        `insert into users (family_id, role, name, username, pin_hash, grade_level, interests, reading_level, ai_notes, email, tutor_mode, prefs, created_at)
         values ($1, 'learner', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
        [
          familyId,
          optStr(row, "name", 80).trim(),
          uname,
          auth.hashPin(pin),
          grade != null && grade >= 1 && grade <= 14 ? grade : null,
          interests,
          optStr(row, "reading_level", 20),
          optStr(row, "ai_notes", 2000),
          isStr(row.email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) ? row.email.toLowerCase() : null,
          optStr(row, "tutor_mode", 20) || "hints",
          JSON.stringify(prefs),
          isoTs(row.created_at) || new Date().toISOString(),
        ]
      );
      learnerMap.set(asInt(row.id), Number(ins.rows[0].id));
      existing.learnerUsernames.add(uname);
      s.pins = s.pins || [];
      s.pins.push({ name: optStr(row, "name", 80).trim(), username: uname, pin });
      s.create++;
    }
  });

  // Courses: through normalizeCourse (the same trust boundary as every other
  // course write), then persisted on this section's own client. The position
  // maps feed nothing today; item-linked history is reported as not
  // restorable, so only the course ids are needed by later sections.
  const { normalizeCourse } = require("./coursegen");
  await run("courses", async (client, s) => {
    for (const c of parsed.courses) {
      const fate = courseFate.get(c.oldId);
      if (fate.fate === "duplicate") { s.skipDuplicate++; continue; }
      const course = normalizeCourse(c.payload);
      if (!course) throw new Error(`${c.name}: course did not survive normalization`);
      const ins = await client.query(
        `insert into courses (family_id, title, topic, lens, grade_level, description, sources, created_by, license, author_name)
         values ($1, $2, $3, $4, $5, $6, '[]', $7, $8, $9) returning id`,
        [
          familyId,
          course.title,
          optStr(c.payload, "topic", 300) || course.title,
          optStr(c.payload, "lens", 100),
          Number.isInteger(asInt(c.payload.gradeLevel)) ? asInt(c.payload.gradeLevel) : null,
          optStr(c.payload, "description", 1000),
          userId,
          optStr(c.payload, "license", 100),
          optStr(c.payload, "author", 200),
        ]
      );
      const courseId = Number(ins.rows[0].id);
      let uPos = 0;
      for (const u of course.units) {
        const un = await client.query("insert into units (course_id, title, position) values ($1, $2, $3) returning id", [courseId, u.title, uPos++]);
        let lPos = 0;
        for (const l of u.lessons) {
          const standardsArr = l.standards ? require("./standards").normalizeStandards(l.standards) : [];
          const ln = await client.query(
            "insert into lessons (unit_id, title, summary, standards, position) values ($1, $2, $3, $4, $5) returning id",
            [Number(un.rows[0].id), l.title, l.summary || null, standardsArr, lPos++]
          );
          let iPos = 0;
          for (const item of l.items) {
            await client.query(
              "insert into lesson_items (lesson_id, type, position, content) values ($1, $2, $3, $4)",
              [Number(ln.rows[0].id), item.type, iPos++, JSON.stringify(item.content)]
            );
          }
        }
      }
      courseFate.set(c.oldId, { fate: "created", courseId });
      existing.courseTitles.set(String(course.title), courseId);
      s.create++;
    }
  });

  // Uploads: bytes from the zip land under a fresh storage key, then the
  // index row. Storage writes are not transactional: a failure here can leave
  // an unreferenced file behind, which is the same litter a deleted upload
  // already leaves and harmless.
  await run("uploads", async (client, s) => {
    const storage = require("./storage");
    for (const row of m.uploads) {
      if (existing.uploadKeys.has(dupKey.uploads(row))) { s.skipDuplicate++; continue; }
      const entryName = `uploads/${asInt(row.id)}.${extFor(row.mime)}`;
      const bytes = parsed.zip.files.get(entryName);
      if (!bytes) { s.skipOther++; continue; }
      const put = await storage.put(familyId, String(row.mime), bytes);
      await client.query(
        `insert into uploads (family_id, kind, mime, bytes, storage_key, original_name, title, is_public, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          familyId,
          String(row.kind),
          String(row.mime),
          put.bytes,
          put.key,
          optStr(row, "original_name", 255),
          optStr(row, "title", 255),
          Boolean(row.is_public),
          userId,
          isoTs(row.created_at) || new Date().toISOString(),
        ]
      );
      s.create++;
    }
  });

  // Guides: never created here.
  {
    const s = newSection("guides");
    s.skipOther = (m.guides || []).length;
    s.notes.push("Guides keep their own accounts; this family's guide list is unchanged.");
    sections.push(s);
  }

  // Child sections resolve a parent reference to the id it will have after
  // this import: the new id when the parent was created, the existing id
  // when it was a duplicate, null when there is nothing to point at.
  const resolvePlan = (oldId) => {
    const pf = plan.planFate.get(asInt(oldId));
    if (!pf) return null;
    if (pf.fate === "created") return planMap.get(asInt(oldId)) || null;
    if (pf.fate === "duplicate") return pf.planId || null;
    return null;
  };
  const resolveCourse = (oldId) => {
    const cf = courseFate.get(asInt(oldId));
    return cf && cf.courseId ? cf.courseId : null;
  };

  // Plans
  await run("plans", async (client, s) => {
    for (const row of m.plans) {
      if (plan.planFate.get(asInt(row.id)).fate === "duplicate") { s.skipDuplicate++; continue; }
      const ins = await client.query(
        `insert into term_plans (family_id, title, subject, goal, start_date, end_date, sessions_per_week, minutes_per_session, status, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
        [
          familyId,
          optStr(row, "title", 200).trim(),
          optStr(row, "subject", 200).trim(),
          optStr(row, "goal", 2000),
          isoDate(row.start_date),
          isoDate(row.end_date),
          Number.isInteger(asInt(row.sessions_per_week)) ? asInt(row.sessions_per_week) : 3,
          Number.isInteger(asInt(row.minutes_per_session)) ? asInt(row.minutes_per_session) : 30,
          PLAN_STATUS.includes(row.status) ? row.status : "active",
          userId,
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
      planMap.set(asInt(row.id), Number(ins.rows[0].id));
      plan.planFate.set(asInt(row.id), { fate: "created" });
      s.create++;
    }
  });

  // Plan enrollments (unique on plan + learner: the conflict guard is the
  // backstop, the fate check is the report).
  await run("planEnrollments", async (client, s) => {
    for (const row of m.planEnrollments) {
      const pf = plan.planFate.get(asInt(row.plan_id));
      const lf = learnerFate.get(asInt(row.learner_id));
      if (pf.fate === "duplicate" || lf.fate === "duplicate") { s.skipDuplicate++; continue; }
      const targetPlan = planMap.get(asInt(row.plan_id));
      const targetLearner = learnerMap.get(asInt(row.learner_id));
      if (pf.fate !== "created" || lf.fate !== "new" || !targetPlan || !targetLearner) { s.skipOther++; continue; }
      const ins = await client.query(
        `insert into plan_enrollments (plan_id, learner_id, lens_override, personal_note)
         values ($1, $2, $3, $4)
         on conflict (plan_id, learner_id) do nothing returning id`,
        [targetPlan, targetLearner, optStr(row, "lens_override", 100), optStr(row, "personal_note", 2000)]
      );
      if (ins.rows[0]) s.create++;
      else s.skipDuplicate++;
    }
  });

  // Plan milestones
  await run("planMilestones", async (client, s) => {
    for (const row of m.planMilestones) {
      const pf = plan.planFate.get(asInt(row.plan_id));
      if (pf.fate === "duplicate") { s.skipDuplicate++; continue; }
      const targetPlan = planMap.get(asInt(row.plan_id));
      if (pf.fate !== "created" || !targetPlan) { s.skipOther++; continue; }
      const sourceCourse = courseFate.get(asInt(row.course_id));
      await client.query(
        `insert into plan_milestones (plan_id, title, description, position, target_date, course_id, project_ideas, resources, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          targetPlan,
          optStr(row, "title", 200).trim(),
          optStr(row, "description", 2000),
          Number.isInteger(asInt(row.position)) ? asInt(row.position) : 0,
          isoDate(row.target_date),
          resolveCourse(row.course_id),
          JSON.stringify(Array.isArray(row.project_ideas) ? row.project_ideas : []),
          JSON.stringify(Array.isArray(row.resources) ? row.resources : []),
          isoTs(row.created_at) || new Date().toISOString(),
        ]
      );
      s.create++;
    }
  });

  // Calendar events (notified_at resets so reminders re-arm cleanly)
  await run("events", async (client, s) => {
    for (const row of m.events) {
      if (existing.eventKeys.has(dupKey.events(row))) { s.skipDuplicate++; continue; }
      const sourcePlan = resolvePlan(row.plan_id);
      const sourceCourse = resolveCourse(row.course_id);
      await client.query(
        `insert into events (family_id, title, description, on_date, at_time, kind, plan_id, course_id, created_by, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          familyId,
          optStr(row, "title", 200).trim(),
          optStr(row, "description", 2000),
          isoDate(row.on_date),
          optStr(row, "at_time", 8),
          EVENT_KINDS.includes(row.kind) ? row.kind : "other",
          sourcePlan || null,
          sourceCourse ? sourceCourse.courseId : null,
          userId,
          isoTs(row.created_at) || new Date().toISOString(),
        ]
      );
      s.create++;
    }
  });

  // Notes: workspace pages nest, so parents insert before children. A chain
  // whose parent never appears keeps the page with the link cut and a note.
  await run("notes", async (client, s) => {
    const noteMap = new Map(); // old id -> new id
    const rows = m.notes.slice();
    let progress = true;
    while (rows.length && progress) {
      progress = false;
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const parentOld = asInt(row.parent_id);
        if (parentOld !== null && !noteMap.has(parentOld)) continue;
        if (existing.noteKeys.has(dupKey.notes(row))) {
          s.skipDuplicate++;
          rows.splice(i, 1);
          progress = true;
          continue;
        }
        const ins = await client.query(
          `insert into workspace_pages (family_id, parent_id, title, icon, body, position, created_by, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
          [
            familyId,
            parentOld !== null ? noteMap.get(parentOld) : null,
            optStr(row, "title", 200) || "Untitled",
            optStr(row, "icon", 40),
            isStr(row.body) ? row.body : "",
            Number.isInteger(asInt(row.position)) ? asInt(row.position) : 0,
            userId,
            isoTs(row.created_at) || new Date().toISOString(),
            isoTs(row.updated_at) || new Date().toISOString(),
          ]
        );
        noteMap.set(asInt(row.id), Number(ins.rows[0].id));
        existing.noteKeys.add(dupKey.notes(row));
        rows.splice(i, 1);
        progress = true;
        s.create++;
      }
    }
    if (rows.length) {
      s.skipOther = rows.length;
      s.notes.push(`${rows.length} note(s) were skipped: they sit under a parent this zip does not contain.`);
    }
  });

  // Resources
  await run("resources", async (client, s) => {
    for (const row of m.resources) {
      if (existing.resourceKeys.has(dupKey.resources(row))) { s.skipDuplicate++; continue; }
      const sourceCourse = courseFate.get(asInt(row.course_id));
      const sourcePlan = planMap.get(asInt(row.plan_id));
      await client.query(
        `insert into resources (family_id, title, url, type, subject, status, rating, date_for, notes, course_id, plan_id, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          familyId,
          optStr(row, "title", 200).trim(),
          optStr(row, "url", 2000),
          RESOURCE_TYPES.includes(row.type) ? row.type : "link",
          optStr(row, "subject", 100),
          RESOURCE_STATUS.includes(row.status) ? row.status : "inbox",
          Number.isInteger(asInt(row.rating)) ? Math.max(0, Math.min(5, asInt(row.rating))) : 0,
          isoDate(row.date_for),
          optStr(row, "notes", 5000),
          resolveCourse(row.course_id),
          resolvePlan(row.plan_id),
          userId,
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
      s.create++;
    }
  });

  // Per-learner sections: a duplicate learner already has these rows from
  // the first import; unique-key conflicts are the backstop.
  const learnerSections = [
    ["reports", async (client, row, lid) => {
      await client.query(
        `insert into reports (family_id, learner_id, period_start, period_end, title, stats, narrative, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          familyId, lid, isoDate(row.period_start), isoDate(row.period_end),
          optStr(row, "title", 200).trim(),
          JSON.stringify(row.stats && typeof row.stats === "object" && !Array.isArray(row.stats) ? row.stats : {}),
          isStr(row.narrative) ? row.narrative : "",
          userId,
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
    }],
    ["attendance", async (client, row, lid) => {
      const minutes = asInt(row.minutes);
      await client.query(
        `insert into attendance_days (family_id, learner_id, day, counted, minutes, note, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (learner_id, day) do nothing returning id`,
        [
          familyId, lid, isoDate(row.day), row.counted === false ? false : true,
          minutes != null && minutes >= 0 && minutes <= 1440 ? minutes : null,
          optStr(row, "note", 500), userId,
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
    }],
    ["assessments", async (client, row, lid) => {
      const grade = asInt(row.grade_level);
      await client.query(
        `insert into assessments (family_id, learner_id, taken_on, kind, title, given_by, grade_level, scores, summary, created_by, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          familyId, lid, isoDate(row.taken_on),
          ASSESSMENT_KINDS.includes(row.kind) ? row.kind : "test",
          optStr(row, "title", 160).trim(),
          optStr(row, "given_by", 200),
          grade != null && grade >= 1 && grade <= 14 ? grade : null,
          JSON.stringify(Array.isArray(row.scores) ? row.scores : []),
          optStr(row, "summary", 5000), userId,
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
    }],
    ["badges", async (client, row, lid) => {
      await client.query(
        `insert into badges (family_id, learner_id, badge, earned_at)
         values ($1, $2, $3, $4)
         on conflict (learner_id, badge) do nothing returning id`,
        [familyId, lid, optStr(row, "badge", 100).trim(), isoTs(row.earned_at) || new Date().toISOString()]
      );
    }],
  ];
  for (const [key, insertRow] of learnerSections) {
    await run(key, async (client, s) => {
      for (const row of m[key]) {
        const lf = learnerFate.get(asInt(row.learner_id));
        if (lf.fate === "duplicate") { s.skipDuplicate++; continue; }
        const lid = learnerMap.get(asInt(row.learner_id));
        if (lf.fate !== "new" || !lid) { s.skipOther++; continue; }
        const ins = await insertRow(client, row, lid);
        if (ins && ins.rows && ins.rows[0]) s.create++;
        else if (ins && ins.rowCount === 0) s.skipDuplicate++;
        else s.create++;
      }
    });
  }

  // Tutor threads: the thread and its messages are self-contained, but the
  // lesson/item links pointed at the old courses, so they are cut (nullable
  // columns) and the section says so.
  await run("tutorThreads", async (client, s) => {
    for (const row of m.tutorThreads) {
      if (plan.threadFate.get(asInt(row.id)).fate === "duplicate") { s.skipDuplicate++; continue; }
      const lid = learnerMap.get(asInt(row.learner_id));
      if (!lid) { s.skipOther++; continue; }
      const ins = await client.query(
        `insert into tutor_threads (family_id, learner_id, lesson_id, item_id, title, created_at, updated_at)
         values ($1, $2, null, null, $3, $4, $5) returning id`,
        [
          familyId, lid,
          optStr(row, "title", 200),
          isoTs(row.created_at) || new Date().toISOString(),
          isoTs(row.updated_at) || new Date().toISOString(),
        ]
      );
      threadMap.set(asInt(row.id), Number(ins.rows[0].id));
      plan.threadFate.set(asInt(row.id), { fate: "created" });
      s.create++;
    }
    if (m.tutorThreads.length) s.notes.push("Thread links to a specific lesson or item are cut: those rows belong to the imported courses' new ids.");
  });

  await run("tutorMessages", async (client, s) => {
    for (const row of m.tutorMessages) {
      const tf = plan.threadFate.get(asInt(row.thread_id));
      if (tf.fate === "duplicate") { s.skipDuplicate++; continue; }
      const tid = threadMap.get(asInt(row.thread_id));
      if (tf.fate !== "created" || !tid) { s.skipOther++; continue; }
      await client.query(
        `insert into tutor_messages (thread_id, role, content, refused, created_at)
         values ($1, $2, $3, $4, $5)`,
        [
          tid,
          row.role === "tutor" ? "tutor" : "learner",
          isStr(row.content) ? row.content : "",
          Boolean(row.refused),
          isoTs(row.created_at) || new Date().toISOString(),
        ]
      );
      s.create++;
    }
  });

  // Work history: not restorable from this zip shape, by design. Reported,
  // never guessed.
  for (const key of WORK_HISTORY_KEYS) {
    const s = newSection(key);
    s.skipOther = m[key].length;
    s.notes.push(WORK_HISTORY_NOTE);
    sections.push(s);
  }

  sections.sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
  const pins = sections.find((s) => s.key === "learners" && s.pins);
  const anyError = sections.some((s) => s.error);
  const totalCreated = sections.reduce((n, s) => n + s.create, 0);
  return {
    dryRun: false,
    ok: !anyError,
    totalCreated,
    source: {
      familyName: (m.family && m.family.name) || null,
      exportedLearners: m.learners.length,
      exportedCourses: parsed.courses.length,
    },
    sections: sections.map(({ key, label, create, skipDuplicate, skipOther, notes, error, pins: p }) => ({
      key, label, create, skipDuplicate, skipOther, notes, error, pins: p || undefined,
    })),
    learners: pins ? pins.pins : [],
  };
}

module.exports = {
  parseFamilyZip, planImport, applyImport, extFor, dupKey,
  SECTION_ORDER, SECTION_LABELS, ShapeError,
};
