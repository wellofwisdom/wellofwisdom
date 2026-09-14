// SPDX-License-Identifier: AGPL-3.0-or-later
// Who may change the settings that belong to the whole server rather than to
// one family: the AI vault, the email provider, the media keys, and the hosted
// waitlist.
//
// Before this, those routes only asked "is this a guide?". On a server that
// offers a public demo, every visitor who clicks Try the demo becomes a guide,
// so any stranger could repoint every family's AI traffic (tutor chats
// included) at their own endpoint, swap the email provider, overwrite the keys,
// or read every waitlist address. Family permissions (lib/perm.js) are the
// wrong tool: they answer what someone may do inside their own family.
//
// The rule:
//   - Never a learner, never anyone but a family owner, never a demo family.
//   - INSTANCE_ADMIN_EMAILS set: only owners whose email is on that list.
//   - Not set: the owners of the first real family on the server, which is
//     the person who installed it on a self-host. A hosted instance should set
//     the list explicitly.
const db = require("./db");

function adminEmails() {
  return String(process.env.INSTANCE_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Pure decision over the facts, so every branch is testable without a database. */
function decide({ role, guideRole, isDemo, email, familyId, firstRealFamilyId }, emails = adminEmails()) {
  if (role !== "parent") return false;
  if ((guideRole || "owner") !== "owner") return false;
  if (isDemo) return false;
  if (emails.length) return Boolean(email) && emails.includes(String(email).trim().toLowerCase());
  return firstRealFamilyId != null && Number(familyId) === Number(firstRealFamilyId);
}

async function isInstanceAdmin(user) {
  if (!user || user.role !== "parent") return false;
  if (!db.configured()) return false;
  const { rows } = await db.query(
    `select u.email, u.family_id, coalesce(f.is_demo, false) as is_demo,
            (select min(id) from families where coalesce(is_demo, false) = false) as first_real_family_id
       from users u join families f on f.id = u.family_id
      where u.id = $1`,
    [user.id]
  );
  const row = rows[0];
  if (!row) return false;
  return decide({
    role: user.role,
    guideRole: user.guideRole,
    isDemo: row.is_demo,
    email: row.email,
    familyId: row.family_id,
    firstRealFamilyId: row.first_real_family_id,
  });
}

/** Once per request: several guards and /api/me may ask. */
async function forRequest(req) {
  if (req._instanceAdmin === undefined) {
    req._instanceAdmin = await isInstanceAdmin(req.user).catch(() => false);
  }
  return req._instanceAdmin;
}

function requireInstanceAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth_required" });
  forRequest(req)
    .then((ok) => (ok ? next() : res.status(403).json({ error: "instance_admin_only" })))
    .catch(next);
}

module.exports = { decide, isInstanceAdmin, forRequest, requireInstanceAdmin, adminEmails };
