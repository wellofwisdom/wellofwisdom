// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);
async function app() {
  return require("../../server/index");
}
async function http(a, path, opts = {}) {
  const m = require("node:http");
  const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) };
  if (body != null) h["content-type"] = "application/json";
  if (opts.cookie) h["cookie"] = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a);
    s.listen(0, () => {
      const { port } = s.address();
      const req = m.request(
        { method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h },
        (res) => {
          let d = "";
          res.on("data", (x) => {
            d += x;
          });
          res.on("end", () => {
            s.close();
            let j = null;
            try {
              j = JSON.parse(d || "");
            } catch {}
            const sc = res.headers["set-cookie"] || [];
            const c = Array.isArray(sc) ? sc : sc ? [String(sc)] : [];
            resolve({
              status: res.statusCode,
              headers: res.headers,
              setCookie: c,
              text: d || "",
              json: j,
            });
          });
        }
      );
      req.on("error", (e) => {
        s.close();
        reject(e);
      });
      if (body != null) req.write(body);
      req.end();
    });
  });
}
function jar(r) {
  return r.setCookie.map((c) => c.split(";")[0]).join("; ");
}
async function signup(a, tag) {
  const email = `course_${tag}_${Date.now()}@example.com`;
  const r = await http(a, "/api/auth/signup", {
    body: { familyName: `Fam ${tag}`, name: "Parent", email, password: "s3cur3Pass" },
  });
  assert.equal(r.status, 200, r.text);
  const db = require("../lib/db");
  const row = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
  assert.ok(row.rows[0], `signup row missing for ${email}: ${r.text}`);
  return { jar: jar(r), userId: Number(row.rows[0].id), familyId: Number(row.rows[0].family_id) };
}
async function seedDraftCourse(db, familyId, ownerId, title) {
  const c = await db.query(
    "insert into courses (family_id, title, topic, status, created_by) values ($1,$2,$3,'draft',$4) returning id",
    [familyId, title || `Seed ${Date.now()}`, "fractions", ownerId]
  );
  const courseId = Number(c.rows[0].id);
  const un = await db.query("insert into units (course_id, title, position) values ($1,$2,0) returning id", [
    courseId,
    "Unit 1",
  ]);
  const uid = Number(un.rows[0].id);
  const ls = await db.query("insert into lessons (unit_id, title, position) values ($1,$2,0) returning id", [
    uid,
    "Lesson 1",
  ]);
  const lid = Number(ls.rows[0].id);
  await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2)",
    [lid, JSON.stringify({ title: "Intro", body: "Hello world" })]
  );
  await db.query(
    "insert into lesson_items (lesson_id, type, position, content) values ($1,'exercise',1,$2)",
    [
      lid,
      JSON.stringify({
        prompt: "2+2?",
        kind: "mcq",
        choices: [
          { id: "c1", text: "3" },
          { id: "c2", text: "4" },
        ],
        answer: "c2",
      }),
    ]
  );
  return { courseId, unitId: uid, lessonId: lid };
}
describe("courses integration", () => {
  before(ctx.setup);
  after(ctx.teardown);
  it("export round-trips through import, family scoped", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "A");
    const famB = await signup(a, "B");
    const { courseId } = await seedDraftCourse(db, famA.familyId, famA.userId, "Seed Course");
    const listA = await http(a, "/api/courses", { method: "GET", cookie: famA.jar });
    assert.equal(listA.status, 200, listA.text);
    assert.ok(listA.json.courses.some((x) => Number(x.id) === courseId));
    const listB = await http(a, "/api/courses", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200, listB.text);
    assert.ok(!listB.json.courses.some((x) => Number(x.id) === courseId));
    const ex = await http(a, `/api/courses/${courseId}/export`, { method: "GET", cookie: famA.jar });
    assert.equal(ex.status, 200, ex.text);
    assert.equal(ex.json.format, "wellofwisdom-course");
    const imp = await http(a, "/api/courses/import", { cookie: famB.jar, body: ex.json });
    assert.equal(imp.status, 201, imp.text);
    const importedId = Number(imp.json.courseId);
    assert.ok(importedId > 0);
    const got = await http(a, `/api/courses/${importedId}`, { method: "GET", cookie: famB.jar });
    assert.equal(got.status, 200, got.text);
    assert.equal(got.json.course.title, "Seed Course");
    const ex2 = await http(a, `/api/courses/${importedId}/export`, { method: "GET", cookie: famB.jar });
    assert.equal(ex2.status, 200);
    assert.equal(ex2.json.title, "Seed Course");
  });
  it("courses CRUD is family scoped, patch validates, answer-key and export 404 on foreign id", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "crudA");
    const famB = await signup(a, "crudB");
    const { courseId, lessonId } = await seedDraftCourse(db, famA.familyId, famA.userId, "Crud Course");
    const getOwn = await http(a, `/api/courses/${courseId}`, { method: "GET", cookie: famA.jar });
    assert.equal(getOwn.status, 200, getOwn.text);
    assert.equal(getOwn.json.course.title, "Crud Course");
    assert.ok(Array.isArray(getOwn.json.course.units));
    const getForeign = await http(a, `/api/courses/${courseId}`, { method: "GET", cookie: famB.jar });
    assert.equal(getForeign.status, 404, getForeign.text);
    const getMissing = await http(a, "/api/courses/999999", { method: "GET", cookie: famA.jar });
    assert.equal(getMissing.status, 404, getMissing.text);
    const emptyPatch = await http(a, `/api/courses/${courseId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: {},
    });
    assert.equal(emptyPatch.status, 400, emptyPatch.text);
    assert.match(emptyPatch.text, /nothing_to_update/);
    const badTitle = await http(a, `/api/courses/${courseId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: { title: " " },
    });
    assert.equal(badTitle.status, 400, badTitle.text);
    assert.match(badTitle.text, /title_required/);
    const badStatus = await http(a, `/api/courses/${courseId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: { status: "nope" },
    });
    assert.equal(badStatus.status, 400, badStatus.text);
    assert.match(badStatus.text, /status_invalid/);
    const rename = await http(a, `/api/courses/${courseId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: { title: "Renamed", description: "new desc" },
    });
    assert.equal(rename.status, 200, rename.text);
    assert.equal(rename.json.ok, true);
    const checkRenamed = await http(a, `/api/courses/${courseId}`, { method: "GET", cookie: famA.jar });
    assert.equal(checkRenamed.status, 200);
    assert.equal(checkRenamed.json.course.title, "Renamed");
    const foreignPatch = await http(a, `/api/courses/${courseId}`, {
      method: "PATCH",
      cookie: famB.jar,
      body: { title: "Hijacked" },
    });
    assert.equal(foreignPatch.status, 404, foreignPatch.text);
    const ownAnswerKey = await http(a, `/api/courses/${courseId}/answer-key`, {
      method: "GET",
      cookie: famA.jar,
    });
    assert.equal(ownAnswerKey.status, 200, ownAnswerKey.text);
    assert.ok(ownAnswerKey.json.course && Array.isArray(ownAnswerKey.json.units));
    assert.ok(typeof ownAnswerKey.json.stats === "object" && "exercises" in ownAnswerKey.json.stats);
    const foreignAnswerKey = await http(a, `/api/courses/${courseId}/answer-key`, {
      method: "GET",
      cookie: famB.jar,
    });
    assert.equal(foreignAnswerKey.status, 404, foreignAnswerKey.text);
    const foreignExport = await http(a, `/api/courses/${courseId}/export`, {
      method: "GET",
      cookie: famB.jar,
    });
    assert.equal(foreignExport.status, 404, foreignExport.text);
    const lessonGetOwn = await http(a, `/api/courses/lessons/${lessonId}`, {
      method: "GET",
      cookie: famA.jar,
    });
    assert.equal(lessonGetOwn.status, 200, lessonGetOwn.text);
    assert.ok(lessonGetOwn.json.lesson && Array.isArray(lessonGetOwn.json.items), lessonGetOwn.text);
    const lessonGetForeign = await http(a, `/api/courses/lessons/${lessonId}`, {
      method: "GET",
      cookie: famB.jar,
    });
    assert.equal(lessonGetForeign.status, 404, lessonGetForeign.text);
    const badImport = await http(a, "/api/courses/import", {
      cookie: famA.jar,
      body: { nope: true },
    });
    assert.equal(badImport.status, 400, badImport.text);
    assert.match(badImport.text, /format_invalid/);
    const deleteOwn = await http(a, `/api/courses/${courseId}`, {
      method: "DELETE",
      cookie: famA.jar,
    });
    assert.equal(deleteOwn.status, 200, deleteOwn.text);
    assert.equal(deleteOwn.json.ok, true);
    const afterDelete = await http(a, `/api/courses/${courseId}`, { method: "GET", cookie: famA.jar });
    assert.equal(afterDelete.status, 404, afterDelete.text);
    const deleteMissing = await http(a, "/api/courses/999999", {
      method: "DELETE",
      cookie: famA.jar,
    });
    assert.equal(deleteMissing.status, 404, deleteMissing.text);
  });
  it("course item edit validates via trust boundary and is family scoped", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "itemA");
    const famB = await signup(a, "itemB");
    const { lessonId } = await seedDraftCourse(db, famA.familyId, famA.userId, "Item Course");
    const lesson = await http(a, `/api/courses/lessons/${lessonId}`, { method: "GET", cookie: famA.jar });
    assert.equal(lesson.status, 200, lesson.text);
    const exercise = lesson.json.items.find((x) => x.type === "exercise");
    assert.ok(exercise, lesson.text);
    const itemId = Number(exercise.id);
    const noContent = await http(a, `/api/courses/items/${itemId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: {},
    });
    assert.equal(noContent.status, 400, noContent.text);
    assert.match(noContent.text, /content_required/);
    const badId = await http(a, "/api/courses/items/notanid", {
      method: "PATCH",
      cookie: famA.jar,
      body: { content: { prompt: "hi", kind: "mcq", choices: [{ id: "a", text: "x" }], answer: "a" } },
    });
    assert.equal(badId.status, 400, badId.text);
    const foreignEdit = await http(a, `/api/courses/items/${itemId}`, {
      method: "PATCH",
      cookie: famB.jar,
      body: {
        content: { prompt: "hijacked", kind: "mcq", choices: [{ id: "a", text: "x" }], answer: "a" },
      },
    });
    assert.equal(foreignEdit.status, 404, foreignEdit.text);
    const edit = await http(a, `/api/courses/items/${itemId}`, {
      method: "PATCH",
      cookie: famA.jar,
      body: {
        content: {
          prompt: "Edited?",
          kind: "mcq",
          choices: [
            { id: "a", text: "yes" },
            { id: "b", text: "no" },
          ],
          answer: "a",
          explanation: "because",
        },
      },
    });
    assert.equal(edit.status, 200, edit.text);
    assert.equal(edit.json.ok, true);
    assert.ok(edit.json.item && edit.json.item.content.prompt === "Edited?", edit.text);
    const afterEdit = await http(a, `/api/courses/lessons/${lessonId}`, {
      method: "GET",
      cookie: famA.jar,
    });
    assert.equal(afterEdit.status, 200, afterEdit.text);
    const found = afterEdit.json.items.find((x) => Number(x.id) === itemId);
    assert.ok(found && found.content.prompt === "Edited?", afterEdit.text);
  });
  it("courses list excludes archived and is family scoped", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "listA");
    const famB = await signup(a, "listB");
    const { courseId } = await seedDraftCourse(db, famA.familyId, famA.userId, "List Course");
    await db.query("update courses set status='archived' where id=$1", [courseId]);
    const activeB = await seedDraftCourse(db, famB.familyId, famB.userId, "Other Course");
    const listA = await http(a, "/api/courses", { method: "GET", cookie: famA.jar });
    assert.equal(listA.status, 200, listA.text);
    assert.ok(!listA.json.courses.some((c) => Number(c.id) === courseId), "archived should be excluded");
    const listB = await http(a, "/api/courses", { method: "GET", cookie: famB.jar });
    assert.equal(listB.status, 200, listB.text);
    assert.ok(listB.json.courses.some((c) => Number(c.id) === Number(activeB.courseId)));
    assert.ok(!listB.json.courses.some((c) => Number(c.id) === courseId), "other family should not leak");
  });
  it("structural editor: units, lessons, and item moves are family scoped", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const famA = await signup(a, "structA");
    const famB = await signup(a, "structB");
    const { courseId, unitId, lessonId } = await seedDraftCourse(db, famA.familyId, famA.userId, "Struct Course");
    const lesson = await http(a, `/api/courses/lessons/${lessonId}`, { method: "GET", cookie: famA.jar });
    assert.equal(lesson.status, 200, lesson.text);
    const itemId = Number(lesson.json.items[0].id);

    const addUnit = await http(a, `/api/courses/${courseId}/units`, { cookie: famA.jar, body: { title: "Unit 2" } });
    assert.equal(addUnit.status, 201, addUnit.text);
    const unitId2 = Number(addUnit.json.unit.id);
    assert.ok(unitId2 > 0);
    const crossAddUnit = await http(a, `/api/courses/${courseId}/units`, { cookie: famB.jar, body: { title: "Hijacked" } });
    assert.equal(crossAddUnit.status, 404, crossAddUnit.text);
    const renameUnit = await http(a, `/api/courses/units/${unitId}`, { method: "PATCH", cookie: famA.jar, body: { title: "Renamed Unit" } });
    assert.equal(renameUnit.status, 200, renameUnit.text);
    const emptyUnitPatch = await http(a, `/api/courses/units/${unitId}`, { method: "PATCH", cookie: famA.jar, body: {} });
    assert.equal(emptyUnitPatch.status, 400, emptyUnitPatch.text);
    assert.match(emptyUnitPatch.text, /nothing_to_update/);
    const crossPatchUnit = await http(a, `/api/courses/units/${unitId}`, { method: "PATCH", cookie: famB.jar, body: { title: "Hijacked" } });
    assert.equal(crossPatchUnit.status, 404, crossPatchUnit.text);

    const moveUnit = await http(a, `/api/courses/units/${unitId2}/move`, { cookie: famA.jar, body: { direction: "up" } });
    assert.equal(moveUnit.status, 200, moveUnit.text);
    const badDirUnit = await http(a, `/api/courses/units/${unitId}/move`, { cookie: famA.jar, body: { direction: "sideways" } });
    assert.equal(badDirUnit.status, 400, badDirUnit.text);

    const addLesson = await http(a, `/api/courses/units/${unitId}/lessons`, { cookie: famA.jar, body: { title: "Lesson 2" } });
    assert.equal(addLesson.status, 201, addLesson.text);
    const lessonId2 = Number(addLesson.json.lesson.id);
    const crossAddLesson = await http(a, `/api/courses/units/${unitId}/lessons`, { cookie: famB.jar, body: { title: "Hijacked" } });
    assert.equal(crossAddLesson.status, 404, crossAddLesson.text);
    const moveLesson = await http(a, `/api/courses/lessons/${lessonId2}/move`, { cookie: famA.jar, body: { direction: "up" } });
    assert.equal(moveLesson.status, 200, moveLesson.text);
    const moveLessonCross = await http(a, `/api/courses/lessons/${lessonId2}/move`, { cookie: famA.jar, body: { unitId: unitId2 } });
    assert.equal(moveLessonCross.status, 200, moveLessonCross.text);

    const lessonPatch = await http(a, `/api/courses/lessons/${lessonId}`, { method: "PATCH", cookie: famA.jar, body: { title: "Renamed Lesson" } });
    assert.equal(lessonPatch.status, 200, lessonPatch.text);

    const addItem = await http(a, `/api/courses/lessons/${lessonId}/items`, { cookie: famA.jar, body: { type: "article", content: { title: "Extra", body: "More text here." } } });
    assert.equal(addItem.status, 201, addItem.text);
    const addedItemId = Number(addItem.json.item.id);
    const badItemType = await http(a, `/api/courses/lessons/${lessonId}/items`, { cookie: famA.jar, body: { type: "nope", content: {} } });
    assert.equal(badItemType.status, 400, badItemType.text);
    const crossAddItem = await http(a, `/api/courses/lessons/${lessonId}/items`, { cookie: famB.jar, body: { type: "article", content: { title: "Hijacked", body: "x" } } });
    assert.equal(crossAddItem.status, 404, crossAddItem.text);

    const moveItem = await http(a, `/api/courses/items/${addedItemId}/move`, { cookie: famA.jar, body: { direction: "up" } });
    assert.equal(moveItem.status, 200, moveItem.text);
    const badDirItem = await http(a, `/api/courses/items/${addedItemId}/move`, { cookie: famA.jar, body: { direction: "bad" } });
    assert.equal(badDirItem.status, 400, badDirItem.text);
    const crossMoveItem = await http(a, `/api/courses/items/${addedItemId}/move`, { cookie: famB.jar, body: { direction: "up" } });
    assert.equal(crossMoveItem.status, 404, crossMoveItem.text);

    const delItem = await http(a, `/api/courses/items/${addedItemId}`, { method: "DELETE", cookie: famA.jar });
    assert.equal(delItem.status, 200, delItem.text);
    const delItemAgain = await http(a, `/api/courses/items/${addedItemId}`, { method: "DELETE", cookie: famA.jar });
    assert.equal(delItemAgain.status, 404, delItemAgain.text);
    const crossDelItem = await http(a, `/api/courses/items/${itemId}`, { method: "DELETE", cookie: famB.jar });
    assert.equal(crossDelItem.status, 404, crossDelItem.text);
  });
  it("courses: reorder, versions, drafts, preview, verification, and publish flow", async () => {
    if (ctx.skip) {
      console.log("# skip: TEST_DATABASE_URL not set");
      return;
    }
    const a = await app();
    const db = require("../lib/db");
    const fam = await signup(a, "courseExt");
    const { courseId, unitId, lessonId } = await seedDraftCourse(db, fam.familyId, fam.userId, "Ext Course");
    const otherFamily = await signup(a, "courseExtB");
    const addUnit = await http(a, `/api/courses/${courseId}/units`, { cookie: fam.jar, body: { title: "Second Unit" } });
    assert.equal(addUnit.status, 201, addUnit.text);
    const unitId2 = Number(addUnit.json.unit.id);
    const reorderUnits = await http(a, `/api/courses/${courseId}/reorder`, { cookie: fam.jar, body: { type: "unit", order: [unitId2, unitId] } });
    assert.equal(reorderUnits.status, 200, reorderUnits.text);
    const badReorderType = await http(a, `/api/courses/${courseId}/reorder`, { cookie: fam.jar, body: { type: "nope", order: [unitId] } });
    assert.equal(badReorderType.status, 400, badReorderType.text);
    const crossReorder = await http(a, `/api/courses/${courseId}/reorder`, { cookie: otherFamily.jar, body: { type: "unit", order: [unitId, unitId2] } });
    assert.equal(crossReorder.status, 404, crossReorder.text);

    const versionsEmpty = await http(a, `/api/courses/${courseId}/versions`, { method: "GET", cookie: fam.jar });
    assert.equal(versionsEmpty.status, 200, versionsEmpty.text);
    assert.ok(Array.isArray(versionsEmpty.json.versions));
    const crossVersions = await http(a, `/api/courses/${courseId}/versions`, { method: "GET", cookie: otherFamily.jar });
    assert.equal(crossVersions.status, 404, crossVersions.text);

    const lessonDetail = await http(a, `/api/courses/lessons/${lessonId}`, { method: "GET", cookie: fam.jar });
    assert.equal(lessonDetail.status, 200, lessonDetail.text);
    assert.ok(lessonDetail.json.lesson && Array.isArray(lessonDetail.json.lesson.items));
    const crossLessonDetail = await http(a, `/api/courses/lessons/${lessonId}`, { method: "GET", cookie: otherFamily.jar });
    assert.equal(crossLessonDetail.status, 404, crossLessonDetail.text);
    const preview = await http(a, `/api/courses/lessons/${lessonId}/preview`, { method: "GET", cookie: fam.jar });
    assert.equal(preview.status, 200, preview.text);
    assert.ok(preview.json.lesson && Array.isArray(preview.json.lesson.items));
    const previewBody = JSON.stringify(preview.json.lesson);
    assert.ok(!previewBody.includes('"answer":"c2"'), "preview leaked answer");
    const crossPreview = await http(a, `/api/courses/lessons/${lessonId}/preview`, { method: "GET", cookie: otherFamily.jar });
    assert.equal(crossPreview.status, 404, crossPreview.text);

    const draftList = await http(a, `/api/courses/lessons/${lessonId}/draft`, { method: "GET", cookie: fam.jar });
    assert.equal(draftList.status, 200, draftList.text);
    assert.ok(Array.isArray(draftList.json.lesson.items));
    const crossDraft = await http(a, `/api/courses/lessons/${lessonId}/draft`, { method: "GET", cookie: otherFamily.jar });
    assert.equal(crossDraft.status, 404, crossDraft.text);

    const lessonForNeeds = await http(a, `/api/courses/lessons/${lessonId}`, { method: "GET", cookie: fam.jar });
    const exerciseItem = lessonForNeeds.json.items.find((x) => x.type === "exercise");
    if (exerciseItem) {
      const badInstruction = await http(a, `/api/courses/lessons/${lessonId}/regenerate`, { cookie: fam.jar, body: {} });
      assert.equal(badInstruction.status, 400, badInstruction.text);
      assert.match(badInstruction.text, /instruction_required/);
      const badItemInstruction = await http(a, `/api/courses/items/${exerciseItem.id}/regenerate`, { cookie: fam.jar, body: {} });
      assert.equal(badItemInstruction.status, 400, badItemInstruction.text);
      const crossRegen = await http(a, `/api/courses/items/${exerciseItem.id}/regenerate`, { cookie: otherFamily.jar, body: { instruction: "make it harder" } });
      assert.equal(crossRegen.status, 404, crossRegen.text);
      const flagged = await db.query("update lesson_items set content = jsonb_set(content, '{verification}', '{\"flag\":\"check_this_answer\"}') where id=$1 returning id", [exerciseItem.id]);
      void flagged;
      const dismissMissing = await http(a, `/api/courses/items/999999/verification/dismiss`, { cookie: fam.jar });
      assert.equal(dismissMissing.status, 404, dismissMissing.text);
      const dismissOk = await http(a, `/api/courses/items/${exerciseItem.id}/verification/dismiss`, { cookie: fam.jar });
      assert.equal(dismissOk.status, 200, dismissOk.text);
      const dismissAgain = await http(a, `/api/courses/items/${exerciseItem.id}/verification/dismiss`, { cookie: fam.jar });
      assert.equal(dismissAgain.status, 404, dismissAgain.text);
      const crossDismiss = await http(a, `/api/courses/items/${exerciseItem.id}/verification/dismiss`, { cookie: otherFamily.jar });
      assert.equal(crossDismiss.status, 404, crossDismiss.text);
    }

    const makeInteractiveBad = await http(a, `/api/courses/lessons/999999/make-interactive`, { cookie: fam.jar });
    assert.equal(makeInteractiveBad.status, 404, makeInteractiveBad.text);
    const makeInteractive = await http(a, `/api/courses/lessons/${lessonId}/make-interactive`, { cookie: fam.jar });
    assert.equal(makeInteractive.status, 202, makeInteractive.text);
    assert.ok(makeInteractive.json.jobId);

    const rewriteBad = await http(a, "/api/courses/rewrite", { cookie: fam.jar, body: {} });
    assert.equal(rewriteBad.status, 400, rewriteBad.text);
    assert.match(rewriteBad.text, /text_required/);
    const rewriteBadLevel = await http(a, "/api/courses/rewrite", { cookie: fam.jar, body: { text: "Hello world, this is a long article body for the lesson.", level: "nope" } });
    assert.equal(rewriteBadLevel.status, 400, rewriteBadLevel.text);
    const rewriteNoAi = await http(a, "/api/courses/rewrite", { cookie: fam.jar, body: { text: "Hello world, this is a long article body for the lesson.", level: "grade-5" } });
    assert.equal(rewriteNoAi.status, 503, rewriteNoAi.text);

    const badVideoQ = await http(a, "/api/courses/items/999999/video-questions", { cookie: fam.jar });
    assert.equal(badVideoQ.status, 404, badVideoQ.text);

    const wsBad = await http(a, "/api/courses/worksheet-import", { cookie: fam.jar, body: {} });
    assert.equal(wsBad.status, 400, wsBad.text);
    assert.match(wsBad.text, /text_required/);
    const ocrBad = await http(a, "/api/courses/worksheet-ocr", { cookie: fam.jar, body: {} });
    assert.equal(ocrBad.status, 400, ocrBad.text);

    const importUrlBad = await http(a, "/api/courses/import-url", { cookie: fam.jar, body: { url: "not-a-url" } });
    assert.equal(importUrlBad.status, 400, importUrlBad.text);

    const delLesson = await http(a, `/api/courses/lessons/${lessonId}`, { method: "DELETE", cookie: otherFamily.jar });
    assert.equal(delLesson.status, 404, delLesson.text);
    const delUnit = await http(a, `/api/courses/units/${unitId}`, { method: "DELETE", cookie: otherFamily.jar });
    assert.equal(delUnit.status, 404, delUnit.text);
  });
});
