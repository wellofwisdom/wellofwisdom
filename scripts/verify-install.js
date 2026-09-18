// SPDX-License-Identifier: AGPL-3.0-or-later
// Install verification: boots with DB_DRIVER=pglite against a fresh temp
// dir, runs migrations, then exercises the outline-then-per-lesson path
// end to end with mocked AI. Used by CI and by a fresh install check.
// Usage: node scripts/verify-install.js  (exits non-zero on failure)
// Also wired as: npm run verify:install
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wow-verify-"));
  console.log(`[verify-install] DATA_DIR=${dir} DB_DRIVER=pglite`);
  process.env.DB_DRIVER = "pglite";
  process.env.DATA_DIR = dir;
  // Make AI appear configured without a real provider
  const ai = require("../server/lib/ai");
  const origConfigured = ai.configured;
  const origChatJson = ai.chatJson;
  ai.configured = () => true;

  // Stub AI responses: outline returns 1 unit 2 lessons, each lesson returns a minimal valid shape
  let outlineCalls = 0;
  let lessonCalls = 0;
  ai.chatJson = async (task, messages, opts) => {
    if (task === "course-gen") {
      outlineCalls++;
      return {
        json: {
          title: "Verify Course",
          description: "Install verification course.",
          units: [{ title: "Unit 1: Hello", objective: "Say hello", lessons: [{ title: "Lesson 1: Greetings", objective: "Greet", plannedKind: "mcq", timeEstimateMin: 15 }, { title: "Lesson 2: Farewell", objective: "Say goodbye", plannedKind: "figure" }] }],
        },
        content: "{}", usage: null, model: "mock",
      };
    }
    if (task === "lesson-content") {
      lessonCalls++;
      const n = lessonCalls;
      return {
        json: {
          title: `Lesson ${n}`,
          summary: `Verify lesson ${n}`,
          items: [
            { type: "article", content: { title: `Article ${n}`, body: "This is a verification article with about one hundred and fifty words. ".repeat(10) } },
            { type: "exercise", content: { prompt: `What is ${n}+${n}?`, kind: "mcq", choices: [{ id: "c1", text: String(n + n - 1) }, { id: "c2", text: String(n + n) }], answer: "c2", explanation: "Addition.", hints: ["Add them."] } },
          ],
        },
        content: "{}", usage: null, model: "mock",
      };
    }
    return origChatJson(task, messages, opts);
  };

  try {
    const db = require("../server/lib/db");
    const { migrate } = require("../server/lib/migrate");
    const res = await migrate({ log: (m) => console.log(m) });
    console.log(`[verify-install] migrations: ${JSON.stringify(res)}`);
    const health = await db.health();
    console.log(`[verify-install] db health: ${JSON.stringify(health)}`);
    if (!health.ok) throw new Error("db health not ok: " + JSON.stringify(health));

    // Create a family + user to own the course (direct DB, no HTTP)
    const fam = await db.query("insert into families (name, join_code) values ($1,$2) returning id", ["Verify Fam", "VF" + Date.now().toString(36).slice(0, 6).toUpperCase()]);
    const familyId = Number(fam.rows[0].id);
    const usr = await db.query("insert into users (family_id, role, name, email, password_hash) values ($1,'parent','Verify','verify@example.com','x') returning id", [familyId]);
    const userId = Number(usr.rows[0].id);

    const v2 = require("../server/lib/coursegen.v2");
    // Plain (non-language) course must still produce 1-unit 1-lesson-per-unit shape when no language is set
    const spec = { topic: "Verify topic", learnerId: null, lens: null, gradeLevel: 4, interests: [], learnerNotes: null, notes: null, sources: [], openPublish: false, size: { units: 1, lessonsPerUnit: 2 } };
    const { outline } = await v2.generateOutline(spec, familyId);
    console.log(`[verify-install] outline: ${outline.title} units=${outline.units.length} lessons=${outline.units[0].lessons.length}`);
    if (outline.units.length !== 1 || outline.units[0].lessons.length !== 2) throw new Error("outline shape wrong");

    const skeleton = await v2.persistOutlineAsSkeleton(outline, spec, userId, familyId);
    console.log(`[verify-install] skeleton courseId=${skeleton.courseId} lessonIds=${skeleton.lessonIds.map((l) => l.lessonId).join(",")}`);

    // Language path: same shape, prompts carry target language (prove plumbing)
    const langSpec = { ...spec, language: "es", cefr: "A1" };
    const menuLang = v2.buildKindMenu("es");
    if (!/vocab_card/.test(menuLang) || !/listen_choice/.test(menuLang) || !/listen_repeat/.test(menuLang)) throw new Error("language kind menu missing");
    const menuPlain = v2.buildKindMenu(null);
    if (/vocab_card/.test(menuPlain)) throw new Error("non-language menu must not contain language kinds");
    const outlinePromptLang = v2.buildOutlinePrompt(langSpec, "", { units: 1, lessonsPerUnit: 1 });
    if (!/Target language: es/i.test(outlinePromptLang)) throw new Error("outline prompt missing language");
    console.log("[verify-install] language menu and prompt plumbing ok");

    for (const lid of skeleton.lessonIds) {
      const lp = outline.units.flatMap((u) => u.lessons).find((l) => l.title === lid.title) || { title: lid.title };
      const r = await v2.generateLesson({ courseId: skeleton.courseId, lessonId: lid.lessonId, spec, lessonPlan: lp, outlineContext: JSON.stringify(outline).slice(0, 4000), familyId });
      console.log(`[verify-install] lesson ${lid.lessonId}: ${r.title} items=${r.items}`);
    }

    const cnt = await db.query("select count(*)::int as c from lesson_items where lesson_id = any($1::bigint[])", [skeleton.lessonIds.map((l) => l.lessonId)]);
    const itemsCount = Number(cnt.rows[0].c);
    console.log(`[verify-install] total lesson_items=${itemsCount}`);
    if (itemsCount < 2) throw new Error("too few items persisted");

    console.log("[verify-install] OK: outline then per-lesson generation end to end (mocked AI) passed");
  } catch (err) {
    console.error("[verify-install] FAILED:", err.stack || err.message);
    process.exitCode = 1;
  } finally {
    ai.configured = origConfigured;
    ai.chatJson = origChatJson;
    // Close pglite if needed
    try { const db = require("../server/lib/db"); if (db.close) await db.close(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); console.log(`[verify-install] temp dir removed`); } catch {}
  }
}

if (require.main === module) main();
module.exports = { main };
