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
const { safeSourceUrl, youtubeId } = require("./grade");

const OEMBED = "https://www.youtube.com/oembed";
const VIMEO_OEMBED = "https://vimeo.com/api/oembed.json";
const FILE_EXT = /\.(mp4|webm|ogg|ogv|m4v|mov)$/i;

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

// ---- other sources, alongside YouTube and an uploaded file ----
// A guide may paste a Vimeo link, a PeerTube link, or a direct file URL. Each
// is parsed to a structured reference (never a free-form embed URL we would
// then trust), and any server-side fetch is guarded by safeSourceUrl so a
// pasted link cannot make us reach a private address. The player rebuilds the
// embed from the structured pieces, so nothing attacker-shaped reaches an
// iframe src by surprise.

/** A Vimeo id from a vimeo.com / player.vimeo.com URL, else null. A bare number
 *  is rejected: it is too ambiguous to trust as a video id. */
function vimeoIdFrom(input) {
  const s = String(input || "").trim();
  const m =
    s.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{5,12})/i) ||
    s.match(/player\.vimeo\.com\/video\/(\d{5,12})/i);
  return m ? m[1] : null;
}

/** A safe, plausibly-a-video direct URL (public host, video extension), else
 *  null. No request is made: the browser fetches it at play time, so we never
 *  turn a pasted link into a server-side fetch here at all. */
function fileVideoUrl(input) {
  const u = safeSourceUrl(input);
  if (!u) return null;
  if (!FILE_EXT.test(u.pathname)) return null;
  return u.href;
}

/** Validate a stored PeerTube host + id (the trust-boundary shape check). */
function peerTubeHostId(host, id) {
  const h = String(host || "").trim().toLowerCase();
  const i = String(id || "").trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(h)) return null;
  if (!safeSourceUrl(`https://${h}`)) return null;   // no private hosts
  if (!/^[A-Za-z0-9-]{1,60}$/.test(i)) return null;
  return { host: h, id: i };
}

/** Pull {host, id} out of a PeerTube watch/embed URL path. Pure, no request. */
function peerTubeRefFromUrl(u) {
  const m = u.pathname.match(/\/(?:videos\/(?:watch|embed)|w)\/([A-Za-z0-9-]{1,60})/);
  return m ? { host: u.host.toLowerCase(), id: m[1] } : null;
}

/** Does this Vimeo video exist and allow embedding? oEmbed, like YouTube. */
async function checkVimeo(url, { timeoutMs = 8000 } = {}) {
  const vid = vimeoIdFrom(url);
  if (!vid) return { ok: false, reason: "malformed_id" };
  const q = `${VIMEO_OEMBED}?url=${encodeURIComponent(`https://vimeo.com/${vid}`)}`;
  try {
    const res = await fetchT(q, { headers: { accept: "application/json" } }, { timeoutMs, retries: 1 });
    if ([400, 401, 403, 404].includes(res.status)) return { ok: false, reason: `not_embeddable_${res.status}` };
    if (!res.ok) return { ok: true, vimeoId: vid, reason: `unverified_${res.status}` };
    const data = await res.json().catch(() => null);
    return { ok: true, vimeoId: String((data && data.video_id) || vid), title: (data && data.title) || null };
  } catch (err) {
    return { ok: true, vimeoId: vid, reason: `unverified_${err.message.slice(0, 40)}` };
  }
}

/** Does this PeerTube video exist and allow embedding? Each instance exposes
 *  its own oEmbed endpoint, so the host is arbitrary: it is guarded by
 *  safeSourceUrl, and the resulting embed id is constrained to the pasted host
 *  and a plain id, never taken as a free-form URL. Fails open on a network
 *  blip (a real video is not rejected because an instance was briefly down),
 *  fails closed on an explicit refusal or when no id can be found. */
async function checkPeerTube(raw, { timeoutMs = 8000 } = {}) {
  const u = safeSourceUrl(raw);
  if (!u) return { ok: false, reason: "blocked_or_bad_url" };
  const ref = peerTubeRefFromUrl(u);
  const oembedUrl = `${u.protocol}//${u.host}/services/oembed?format=json&url=${encodeURIComponent(u.href)}`;
  try {
    const res = await fetchT(oembedUrl, { headers: { accept: "application/json" } }, { timeoutMs, retries: 1 });
    if ([400, 401, 403, 404].includes(res.status)) return { ok: false, reason: `not_embeddable_${res.status}` };
    if (!res.ok) {
      return ref ? { ok: true, host: ref.host, id: ref.id, reason: `unverified_${res.status}` }
        : { ok: false, reason: `no_ref_${res.status}` };
    }
    const data = await res.json().catch(() => null);
    // The embed iframe in the oEmbed html is authoritative, but only if it
    // points at the same host we were given. Otherwise fall back to the url.
    let host = ref && ref.host;
    let id = ref && ref.id;
    const srcMatch = data && data.html &&
      String(data.html).match(/src="https?:\/\/([^/"]+)\/videos\/embed\/([A-Za-z0-9-]{1,60})/i);
    if (srcMatch && srcMatch[1].toLowerCase() === u.host.toLowerCase()) { host = srcMatch[1].toLowerCase(); id = srcMatch[2]; }
    if (!host || !id) return { ok: false, reason: "no_video_id" };
    return { ok: true, host, id, title: (data && data.title) || null };
  } catch (err) {
    return ref ? { ok: true, host: ref.host, id: ref.id, reason: `unverified_${err.message.slice(0, 30)}` }
      : { ok: false, reason: "unreachable" };
  }
}

/** Turn one pasted link into structured, verified video content, or an error
 *  code the UI already knows how to phrase. This is the single place a guide's
 *  pasted URL is resolved; the route calls it and then re-shapes through the
 *  normalizer, so there is still exactly one trust boundary. */
async function resolveVideoUrl(raw, opts = {}) {
  const s = String(raw || "").trim();
  if (!s) return { error: "content_invalid" };

  const yt = youtubeId(s);
  if (yt) {
    const v = await checkYouTube(yt, opts);
    return v.ok ? { content: { youtubeId: yt }, title: v.title } : { error: "video_unavailable" };
  }
  if (vimeoIdFrom(s)) {
    const v = await checkVimeo(s, opts);
    return v.ok ? { content: { vimeoId: v.vimeoId }, title: v.title } : { error: "video_unavailable" };
  }
  const f = fileVideoUrl(s);
  if (f) return { content: { fileUrl: f }, title: null };

  // Anything else that is a safe URL: try it as a PeerTube (or oEmbed) instance.
  if (safeSourceUrl(s)) {
    const v = await checkPeerTube(s, opts);
    if (v.ok) return { content: { peertubeHost: v.host, peertubeId: v.id }, title: v.title };
  }
  return { error: "video_unavailable" };
}

module.exports = {
  checkYouTube, pruneDeadVideos, OEMBED,
  checkVimeo, checkPeerTube, resolveVideoUrl,
  vimeoIdFrom, fileVideoUrl, peerTubeHostId, peerTubeRefFromUrl,
};
