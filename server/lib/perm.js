// SPDX-License-Identifier: AGPL-3.0-or-later
// Who may do what.
//
// Pure functions over a user shape, so every rule is testable without a
// database and readable without tracing a request. The routes ask; this
// decides.
//
// Two principles the tests pin down:
//   1. An unknown role gets nothing. A typo in the database must not grant
//      access, and a new role added later must be listed here to work.
//   2. Family scoping still applies underneath all of this. These rules narrow
//      what a family member may do; they never widen it across families.

const GUIDE_ROLES = {
  owner: {
    id: "owner",
    label: "Owner",
    blurb: "Everything, including billing, invites and deleting the family.",
    rank: 4,
  },
  guide: {
    id: "guide",
    label: "Guide",
    blurb: "Teaches everyone: courses, plans, grading, learner profiles.",
    rank: 3,
  },
  assistant: {
    id: "assistant",
    label: "Assistant",
    blurb: "Teaches only the learners they are assigned. A tutor.",
    rank: 2,
  },
  observer: {
    id: "observer",
    label: "Observer",
    blurb: "Sees progress and reports. Changes nothing.",
    rank: 1,
  },
};

// What each action needs. Anything not listed is denied, on purpose.
const ACTIONS = {
  // family administration
  manage_family: ["owner"],
  manage_guides: ["owner"],
  delete_family: ["owner"],
  manage_billing: ["owner"],
  // teaching
  edit_course: ["owner", "guide", "assistant"],
  create_course: ["owner", "guide", "assistant"],
  delete_course: ["owner", "guide"],
  publish_course: ["owner", "guide"],
  share_course: ["owner", "guide"],
  edit_learner: ["owner", "guide"],
  create_learner: ["owner", "guide"],
  delete_learner: ["owner"],
  grade: ["owner", "guide", "assistant"],
  build_world: ["owner", "guide", "assistant"],
  grant_reward: ["owner", "guide"],
  set_tutor_mode: ["owner", "guide"],
  // reading
  view_progress: ["owner", "guide", "assistant", "observer"],
  view_reports: ["owner", "guide", "assistant", "observer"],
  view_tutor_log: ["owner", "guide", "observer"],
  view_courses: ["owner", "guide", "assistant", "observer"],
  // spending
  spend_ai: ["owner", "guide", "assistant"],
  spend_media: ["owner", "guide"],
};

function role(user) {
  if (!user || user.role !== "parent") return null;
  return GUIDE_ROLES[user.guideRole] || null;
}

/** May this user take this action? Learners never can: their permissions are
 *  a different model entirely (their own work, and nothing else). */
function can(user, action) {
  const r = role(user);
  if (!r) return false;
  const allowed = ACTIONS[action];
  if (!allowed) return false; // unknown action denies, so a typo fails closed
  return allowed.includes(r.id);
}

/** Anything that changes state. An observer fails all of these. */
function isReadOnly(user) {
  const r = role(user);
  return Boolean(r) && r.id === "observer";
}

/**
 * Which learners this user may see.
 * `assigned` is the assistant's list, loaded by the caller.
 * Returns null to mean "all learners in the family", which callers treat as
 * no extra filter rather than as an empty set.
 */
function visibleLearnerIds(user, assigned) {
  if (!user) return [];
  if (user.role === "learner") return [Number(user.id)];
  const r = role(user);
  if (!r) return [];
  if (r.id === "assistant") return (assigned || []).map(Number);
  return null; // owner, guide, observer: everyone
}

/** May this user act on this specific learner? */
function canSeeLearner(user, learnerId, assigned) {
  const ids = visibleLearnerIds(user, assigned);
  if (ids === null) return true;
  return ids.includes(Number(learnerId));
}

/** Roles a given user is allowed to hand out. An owner cannot be created by
 *  invite: ownership is transferred deliberately, not mailed to someone. */
function invitableRoles(user) {
  return can(user, "manage_guides") ? ["guide", "assistant", "observer"] : [];
}

/** Refuse to remove the last owner, or a family becomes unadministrable. */
function canRemoveGuide(user, target, ownerCount) {
  if (!can(user, "manage_guides")) return { ok: false, reason: "not_allowed" };
  if (Number(target.id) === Number(user.id)) return { ok: false, reason: "cannot_remove_yourself" };
  if (target.guideRole === "owner" && ownerCount <= 1) {
    return { ok: false, reason: "last_owner" };
  }
  return { ok: true };
}

module.exports = {
  GUIDE_ROLES, ACTIONS, role, can, isReadOnly,
  visibleLearnerIds, canSeeLearner, invitableRoles, canRemoveGuide,
};
