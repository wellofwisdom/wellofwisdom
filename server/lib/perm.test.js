// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const perm = require("./perm");

const owner = { id: 1, role: "parent", guideRole: "owner" };
const guide = { id: 2, role: "parent", guideRole: "guide" };
const assistant = { id: 3, role: "parent", guideRole: "assistant" };
const observer = { id: 4, role: "parent", guideRole: "observer" };
const learner = { id: 5, role: "learner" };

test("an unknown or missing role gets nothing", () => {
  // A typo in the database must fail closed, not open.
  for (const u of [
    null, undefined, {},
    { role: "parent" },
    { role: "parent", guideRole: "" },
    { role: "parent", guideRole: "admin" },
    { role: "parent", guideRole: "OWNER" },
  ]) {
    assert.equal(perm.can(u, "view_progress"), false, JSON.stringify(u));
    assert.equal(perm.can(u, "edit_course"), false);
  }
});

test("an unknown ACTION denies, so a misspelt check never grants access", () => {
  assert.equal(perm.can(owner, "obliterate_everything"), false);
  assert.equal(perm.can(owner, ""), false);
  assert.equal(perm.can(owner, undefined), false);
});

test("a learner is never granted guide permissions", () => {
  for (const a of Object.keys(perm.ACTIONS)) {
    assert.equal(perm.can(learner, a), false, `learner got ${a}`);
  }
});

test("owner can do everything listed", () => {
  for (const a of Object.keys(perm.ACTIONS)) {
    assert.equal(perm.can(owner, a), true, `owner denied ${a}`);
  }
});

test("only an owner administers the family", () => {
  for (const a of ["manage_family", "manage_guides", "delete_family", "manage_billing", "delete_learner"]) {
    assert.equal(perm.can(owner, a), true);
    assert.equal(perm.can(guide, a), false, `guide should not ${a}`);
    assert.equal(perm.can(assistant, a), false);
    assert.equal(perm.can(observer, a), false);
  }
});

test("an assistant teaches but does not publish, share, or hand out rewards", () => {
  assert.equal(perm.can(assistant, "edit_course"), true);
  assert.equal(perm.can(assistant, "grade"), true);
  assert.equal(perm.can(assistant, "build_world"), true);
  assert.equal(perm.can(assistant, "publish_course"), false);
  assert.equal(perm.can(assistant, "share_course"), false);
  assert.equal(perm.can(assistant, "grant_reward"), false);
  assert.equal(perm.can(assistant, "edit_learner"), false);
});

test("an observer can read and cannot write anything", () => {
  assert.equal(perm.isReadOnly(observer), true);
  assert.equal(perm.can(observer, "view_progress"), true);
  assert.equal(perm.can(observer, "view_reports"), true);
  for (const a of ["edit_course", "create_course", "grade", "build_world",
    "edit_learner", "grant_reward", "spend_ai", "spend_media", "set_tutor_mode"]) {
    assert.equal(perm.can(observer, a), false, `observer got write action ${a}`);
  }
});

test("nobody but an observer is read-only", () => {
  assert.equal(perm.isReadOnly(owner), false);
  assert.equal(perm.isReadOnly(guide), false);
  assert.equal(perm.isReadOnly(assistant), false);
  assert.equal(perm.isReadOnly(learner), false);
  assert.equal(perm.isReadOnly(null), false);
});

test("an assistant sees only their assigned learners", () => {
  assert.deepEqual(perm.visibleLearnerIds(assistant, [11, 12]), [11, 12]);
  assert.equal(perm.canSeeLearner(assistant, 11, [11, 12]), true);
  assert.equal(perm.canSeeLearner(assistant, 99, [11, 12]), false);
  // An assistant with no assignment sees nobody, rather than everybody.
  assert.deepEqual(perm.visibleLearnerIds(assistant, []), []);
  assert.equal(perm.canSeeLearner(assistant, 11, []), false);
});

test("owner, guide and observer see every learner", () => {
  for (const u of [owner, guide, observer]) {
    assert.equal(perm.visibleLearnerIds(u, []), null, "null means no extra filter");
    assert.equal(perm.canSeeLearner(u, 999, []), true);
  }
});

test("a learner sees only themselves", () => {
  assert.deepEqual(perm.visibleLearnerIds(learner, []), [5]);
  assert.equal(perm.canSeeLearner(learner, 5, []), true);
  assert.equal(perm.canSeeLearner(learner, 6, []), false);
});

test("ownership is never handed out by invite", () => {
  assert.deepEqual(perm.invitableRoles(owner), ["guide", "assistant", "observer"]);
  assert.ok(!perm.invitableRoles(owner).includes("owner"));
  assert.deepEqual(perm.invitableRoles(guide), []);
  assert.deepEqual(perm.invitableRoles(observer), []);
});

test("the last owner cannot be removed, or the family is unadministrable", () => {
  const other = { id: 9, guideRole: "owner" };
  assert.deepEqual(perm.canRemoveGuide(owner, other, 1), { ok: false, reason: "last_owner" });
  assert.deepEqual(perm.canRemoveGuide(owner, other, 2), { ok: true });
});

test("you cannot remove yourself, and a non-owner cannot remove anyone", () => {
  assert.deepEqual(
    perm.canRemoveGuide(owner, { id: 1, guideRole: "owner" }, 3),
    { ok: false, reason: "cannot_remove_yourself" }
  );
  assert.deepEqual(
    perm.canRemoveGuide(guide, { id: 9, guideRole: "guide" }, 3),
    { ok: false, reason: "not_allowed" }
  );
});

test("every role in GUIDE_ROLES appears in at least one action", () => {
  // A role nobody can use is a bug, not a feature.
  const used = new Set(Object.values(perm.ACTIONS).flat());
  for (const id of Object.keys(perm.GUIDE_ROLES)) {
    assert.ok(used.has(id), `role ${id} grants nothing`);
  }
});

test("every action lists only real roles", () => {
  for (const [action, roles] of Object.entries(perm.ACTIONS)) {
    for (const r of roles) {
      assert.ok(perm.GUIDE_ROLES[r], `action ${action} references unknown role ${r}`);
    }
  }
});
