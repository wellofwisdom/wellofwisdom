// SPDX-License-Identifier: AGPL-3.0-or-later
// One shape for a learner, wherever the API hands one to the browser.
//
// Two things this exists to stop:
//  1. node-pg returns bigint as a *string*, so an id arrives as "13". The
//     Learner type says `number`, and `learners.find(l => l.id === 13)`
//     silently misses. Which is how the profile page used to bounce straight
//     back to the list.
//  2. Endpoints picking their own column lists. /api/me used to omit ai_notes
//     and email, so the profile form loaded them blank and saving wrote that
//     blank back over real data.
const FIELDS = "id, name, username, grade_level, interests, reading_level, ai_notes, email, tutor_mode, created_at";

/** Normalize one learner row for the API. */
function shape(row) {
  if (!row) return null;
  return { ...row, id: Number(row.id) };
}

/** Every learner in a family, in the order they were added. Pass `visibleIds`
 *  (an array) to narrow to a scoped assistant's assigned learners; omit it (or
 *  pass null) for the whole family. An empty array narrows to nobody, which is
 *  the correct answer for an assistant with no assignments yet. */
async function listForFamily(db, familyId, visibleIds) {
  const params = [familyId];
  let scope = "";
  if (Array.isArray(visibleIds)) {
    params.push(visibleIds);
    scope = ` and id = any($${params.length}::bigint[])`;
  }
  const { rows } = await db.query(
    `select ${FIELDS} from users where family_id = $1 and role = 'learner'${scope} order by created_at`,
    params
  );
  return rows.map(shape);
}

module.exports = { FIELDS, shape, listForFamily };
