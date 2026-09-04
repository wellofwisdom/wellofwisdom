// SPDX-License-Identifier: AGPL-3.0-or-later
// Course sharing: slugs, the public projection, and the portable package.
//
// The model is deliberately platform-free. An instance publishes a course at
// /c/<slug>; any other instance imports it straight from that URL. There is no
// registry to join and nothing to sign up for, so a fork keeps working. Which
// is the point: the network grows by people running their own copies, not by
// everyone depending on one server.
//
// Two different shapes, on purpose:
//   publicItem(), what a browser sees on the public page. NEVER answers.
//   packageItem(), what another instance downloads to teach from. Answers
//                   included only when the publisher opted in.
const db = require("./db");

const LICENSES = ["CC-BY-4.0", "CC-BY-SA-4.0", "CC0-1.0", "all-rights-reserved"];
const DEFAULT_LICENSE = "CC-BY-4.0";

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics left by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "course";
}

/** A slug no other course on this instance is using. */
async function uniqueSlug(title, courseId) {
  const base = slugify(title);
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const { rows } = await db.query(
      "select id from courses where public_slug = $1 and id <> $2",
      [candidate, courseId || 0]
    );
    if (!rows.length) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Strip answer keys for the public browse page. Allowlist, not blocklist
 *  a new field on an exercise must be opted in, never leak by default. */
function publicItem(item) {
  const c = (item && item.content) || {};
  if (item.type === "exercise") {
    const out = { prompt: c.prompt, kind: c.kind };
    if (c.choices) out.choices = c.choices;
    return { type: item.type, position: item.position, content: out };
  }
  if (item.type === "video") {
    const out = {
      youtubeId: c.youtubeId, uploadId: c.uploadId, vimeoId: c.vimeoId,
      fileUrl: c.fileUrl, peertubeHost: c.peertubeHost, peertubeId: c.peertubeId,
      title: c.title, note: c.note,
    };
    if (c.questions) out.questions = c.questions.map((q) => ({ prompt: q.prompt, choices: q.choices }));
    return { type: item.type, position: item.position, content: out };
  }
  // Articles and projects are the teaching material. That is what sharing is for.
  return { type: item.type, position: item.position, content: c };
}

/** The full item, for another instance to import and teach from. */
function packageItem(item, withAnswers) {
  if (withAnswers) return { type: item.type, content: item.content };
  return { type: item.type, content: publicItem(item).content };
}

function courseMeta(c) {
  return {
    slug: c.public_slug,
    title: c.title,
    topic: c.topic,
    lens: c.lens,
    gradeLevel: c.grade_level,
    description: c.description,
    license: c.license || DEFAULT_LICENSE,
    author: c.author_name || null,
    publishedAt: c.published_at,
    // A trailer is only playable publicly if the upload itself is public;
    // the publish flow marks it so when the guide sets one.
    trailerUploadId: c.trailer_upload_id ? Number(c.trailer_upload_id) : null,
  };
}

/** Shape a course tree for the public page (no answers, no ids). */
function publicCourse(tree) {
  return {
    ...courseMeta(tree),
    units: (tree.units || []).map((u) => ({
      title: u.title,
      lessons: (u.lessons || []).map((l) => ({
        title: l.title,
        summary: l.summary,
        items: (l.items || []).map(publicItem),
      })),
    })),
  };
}

/** The portable package. The same format /import already accepts. */
function coursePackage(tree) {
  const withAnswers = tree.share_answers !== false;
  return {
    format: "wellofwisdom-course",
    version: 1,
    title: tree.title,
    topic: tree.topic,
    lens: tree.lens,
    gradeLevel: tree.grade_level,
    description: tree.description,
    license: tree.license || DEFAULT_LICENSE,
    author: tree.author_name || null,
    includesAnswers: withAnswers,
    units: (tree.units || []).map((u) => ({
      title: u.title,
      lessons: (u.lessons || []).map((l) => ({
        title: l.title,
        summary: l.summary,
        items: (l.items || []).map((i) => packageItem(i, withAnswers)),
      })),
    })),
  };
}

const LICENSE_LABEL = {
  "CC-BY-4.0": "CC BY 4.0",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "CC0-1.0": "CC0 1.0 (public domain)",
  "all-rights-reserved": "All rights reserved",
};

/** Render a published course as plain text for research tools and readers with
 *  no JavaScript. Built from publicCourse(), never the raw tree, so it can only
 *  ever see the answer-stripped projection: a new content field cannot leak into
 *  the text any more than it can into the page. */
function courseText(tree, opts = {}) {
  const pub = publicCourse(tree);
  const stats = courseStats(tree);
  const L = [];
  const push = (s = "") => L.push(s);

  push(pub.title);
  push("A free course from Well of Wisdom");
  if (opts.url) push(opts.url);
  push();

  const facts = [];
  if (pub.author) facts.push(`By ${pub.author}`);
  facts.push(`License: ${LICENSE_LABEL[pub.license] || pub.license}`);
  if (pub.gradeLevel) facts.push(`Grade ${pub.gradeLevel}`);
  if (pub.lens) facts.push(`Lens: ${pub.lens}`);
  facts.forEach(push);
  push();

  if (pub.description) { push(pub.description); push(); }

  const counts = [`${stats.units} units`, `${stats.lessons} lessons`, `${stats.exercises} exercises`];
  if (stats.videos) counts.push(`${stats.videos} videos`);
  push(counts.join(" | "));
  push();
  push("=".repeat(72));

  pub.units.forEach((u, ui) => {
    push();
    push(`UNIT ${ui + 1}. ${u.title}`);
    (u.lessons || []).forEach((l, li) => {
      push();
      push(`Lesson ${ui + 1}.${li + 1}  ${l.title}`);
      if (l.summary) push(l.summary);
      (l.items || []).forEach((it) => {
        const c = it.content || {};
        push();
        if (it.type === "article") {
          push(`ARTICLE: ${c.title || "Lesson"}`);
          if (c.body) push(c.body);
        } else if (it.type === "exercise") {
          push(`EXERCISE (${c.kind || "mcq"}): ${c.prompt || ""}`);
          (c.choices || []).forEach((ch) => push(`  - ${ch.text}`));
        } else if (it.type === "video") {
          let where = "Uploaded video";
          if (c.youtubeId) where = `https://www.youtube.com/watch?v=${c.youtubeId}`;
          else if (c.vimeoId) where = `https://vimeo.com/${c.vimeoId}`;
          else if (c.peertubeHost && c.peertubeId) where = `https://${c.peertubeHost}/w/${c.peertubeId}`;
          else if (c.fileUrl) where = c.fileUrl;
          push(`VIDEO: ${c.title || "Video"}  [${where}]`);
          if (c.note) push(c.note);
          (c.questions || []).forEach((q) => {
            push(`  Question: ${q.prompt}`);
            (q.choices || []).forEach((ch) => push(`    - ${ch.text}`));
          });
        } else if (it.type === "project") {
          push(`PROJECT: ${c.title || ""}`);
          if (c.description) push(c.description);
          if (c.rubric) { push("Rubric:"); push(c.rubric); }
        }
      });
    });
  });

  push();
  push("=".repeat(72));
  push("Published with Well of Wisdom, an open-source learning platform.");
  return L.join("\n") + "\n";
}

/** Counts for the public card: "3 units · 9 lessons · 27 exercises". */
function courseStats(tree) {
  let lessons = 0;
  let exercises = 0;
  let videos = 0;
  for (const u of tree.units || []) {
    for (const l of u.lessons || []) {
      lessons++;
      for (const i of l.items || []) {
        if (i.type === "exercise") exercises++;
        if (i.type === "video") videos++;
      }
    }
  }
  return { units: (tree.units || []).length, lessons, exercises, videos };
}

module.exports = {
  LICENSES, DEFAULT_LICENSE, slugify, uniqueSlug,
  publicItem, packageItem, publicCourse, coursePackage, courseMeta, courseStats,
  courseText,
};
