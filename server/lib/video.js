// SPDX-License-Identifier: AGPL-3.0-or-later
// Does this YouTube video actually exist, and may it be embedded?
//
// The generator is told to only use ids it is certain of. That is a request,
// not a guarantee: a model asked for "a real eleven-character id" will happily
// produce a plausible-looking string that points at nothing, or at something
// unrelated. A dead embed in the middle of a lesson is worse than no video,
// because a child assumes they broke it.
//
// oEmbed answers both questions in one unauthenticated request: 200 means the
// video exists AND the owner allows embedding. 401 and 404 mean it does not.
const { fetchT } = require("./http");

const OEMBED = "https://www.youtube.com/oembed";

/** Verify one id. Returns { ok, title, reason }. Never throws.
 *
 *  A network failure returns ok:true. Refusing to save a real video because
 *  our server briefly could not reach YouTube would be the worse error: the
 *  guide can always delete a bad one, but a silently dropped lesson video is
 *  invisible.
 */
async function checkYouTube(id, { timeoutMs = 8000 } = {}) {
  const clean = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(clean)) return { ok: false, reason: "malformed_id" };
  const url = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${clean}`)}&format=json`;
  try {
    const res = await fetchT(url, { headers: { accept: "application/json" } }, { timeoutMs, retries: 1 });
    // YouTube's oEmbed answers 400 for "no such video", not 404. Since the id
    // shape is validated above, a 400 here means the id is invented rather
    // than that we built a bad URL. Missing this was the whole bug: every
    // hallucinated id sailed through as "unverified, keep it".
    if ([400, 401, 403, 404].includes(res.status)) {
      return { ok: false, reason: `not_embeddable_${res.status}` };
    }
    if (!res.ok) return { ok: true, reason: `unverified_${res.status}` };
    const data = await res.json().catch(() => null);
    return { ok: true, title: (data && data.title) || null };
  } catch (err) {
    return { ok: true, reason: `unverified_${err.message.slice(0, 40)}` };
  }
}

/** Walk a normalized course and drop video items whose id does not resolve.
 *  Returns { dropped, checked, kept } and mutates the tree in place. */
async function pruneDeadVideos(course, { log = console.log } = {}) {
  let checked = 0;
  let dropped = 0;
  const seen = new Map(); // one request per distinct id, not per item

  for (const unit of (course && course.units) || []) {
    for (const lesson of unit.lessons || []) {
      const keep = [];
      for (const item of lesson.items || []) {
        const ytId = item.type === "video" && item.content && item.content.youtubeId;
        if (!ytId) {
          keep.push(item);
          continue;
        }
        if (!seen.has(ytId)) {
          checked++;
          seen.set(ytId, await checkYouTube(ytId));
        }
        const verdict = seen.get(ytId);
        if (verdict.ok) {
          // Prefer the real title over whatever the model imagined it was.
          if (verdict.title) item.content.title = verdict.title;
          keep.push(item);
        } else {
          dropped++;
          log(`[video] dropped invented video ${ytId} from "${lesson.title}" (${verdict.reason})`);
        }
      }
      lesson.items = keep;
    }
  }
  return { checked, dropped, kept: checked - dropped };
}

module.exports = { checkYouTube, pruneDeadVideos, OEMBED };
