// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const share = require("./share");

const exercise = {
  id: 1, type: "exercise", position: 0,
  content: {
    prompt: "What is 1/2 + 1/4?",
    kind: "mcq",
    choices: [{ id: "c1", text: "3/4" }, { id: "c2", text: "2/6" }],
    answer: "c1",
    explanation: "Common denominator of 4.",
    hint: "Make the denominators match.",
  },
};

const video = {
  id: 2, type: "video", position: 1,
  content: {
    youtubeId: "abc12345678", title: "Fractions", note: "Watch first",
    questions: [{ prompt: "How many quarters in a half?", choices: [{ id: "c1", text: "2" }], answer: "c1" }],
  },
};

const article = { id: 3, type: "article", position: 2, content: { title: "Halves", body: "A half is..." } };

test("publicItem: an exercise NEVER carries its answer, explanation or hint", () => {
  const out = share.publicItem(exercise);
  const json = JSON.stringify(out);
  assert.ok(!("answer" in out.content), "answer leaked");
  assert.ok(!("explanation" in out.content), "explanation leaked");
  assert.ok(!("hint" in out.content), "hint leaked");
  assert.doesNotMatch(json, /Common denominator/);
  assert.doesNotMatch(json, /denominators match/);
  // but the teaching material survives
  assert.equal(out.content.prompt, "What is 1/2 + 1/4?");
  assert.equal(out.content.choices.length, 2);
});

test("publicItem: video sub-questions lose their answers too", () => {
  const out = share.publicItem(video);
  assert.ok(!("answer" in out.content.questions[0]), "video answer leaked");
  assert.equal(out.content.questions[0].prompt, "How many quarters in a half?");
  assert.equal(out.content.youtubeId, "abc12345678");
});

test("publicItem: unknown future fields on an exercise do not leak by default", () => {
  // Allowlist, not blocklist: adding a field to the content must not publish it.
  const withSecret = {
    ...exercise,
    content: { ...exercise.content, teacherOnlyNote: "Isabella struggles here", solutionSteps: "1. ..." },
  };
  const json = JSON.stringify(share.publicItem(withSecret));
  assert.doesNotMatch(json, /Isabella/);
  assert.doesNotMatch(json, /solutionSteps/);
});

test("publicCourse: strips answers through the whole tree", () => {
  const tree = {
    title: "Fractions through Sewing", topic: "fractions", lens: "sewing",
    grade_level: 5, description: "d", public_slug: "frac", license: "CC-BY-4.0",
    author_name: "Kevin", published_at: new Date(),
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [article, exercise, video] }] }],
  };
  const json = JSON.stringify(share.publicCourse(tree));
  assert.doesNotMatch(json, /"answer"/);
  assert.doesNotMatch(json, /Common denominator/);
  assert.match(json, /A half is/); // article body is the point of sharing
});

test("coursePackage: includes answers when the publisher opted in", () => {
  const tree = {
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    share_answers: true, license: "CC-BY-4.0", author_name: null,
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [exercise] }] }],
  };
  const pkg = share.coursePackage(tree);
  assert.equal(pkg.format, "wellofwisdom-course");
  assert.equal(pkg.includesAnswers, true);
  assert.equal(pkg.units[0].lessons[0].items[0].content.answer, "c1");
});

test("coursePackage: honours opting OUT of shipping answers", () => {
  const tree = {
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    share_answers: false,
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [exercise] }] }],
  };
  const pkg = share.coursePackage(tree);
  assert.equal(pkg.includesAnswers, false);
  assert.ok(!("answer" in pkg.units[0].lessons[0].items[0].content));
});

test("coursePackage: is the format /import already accepts", () => {
  const tree = {
    title: "T", topic: "t", lens: null, grade_level: null, description: null,
    units: [{ title: "U1", lessons: [{ title: "L1", summary: null, items: [article] }] }],
  };
  const pkg = share.coursePackage(tree);
  // Round-trip through the importer's own validator.
  const { normalizeCourse } = require("./coursegen");
  const normalized = normalizeCourse(pkg);
  assert.ok(normalized, "the exported package must import cleanly");
  assert.equal(normalized.units.length, 1);
});

test("slugify: url-safe, deduped by uniqueSlug's caller", () => {
  assert.equal(share.slugify("Fractions through Sewing! (Grade 5)"), "fractions-through-sewing-grade-5");
  assert.equal(share.slugify("Café Niño: Español"), "cafe-nino-espanol");
  assert.equal(share.slugify("   "), "course");
  assert.ok(share.slugify("x".repeat(200)).length <= 60);
});

test("courseStats: counts what the card promises", () => {
  const tree = {
    units: [
      { lessons: [{ items: [article, exercise, video] }, { items: [exercise] }] },
      { lessons: [{ items: [article] }] },
    ],
  };
  assert.deepEqual(share.courseStats(tree), { units: 2, lessons: 3, exercises: 2, videos: 1 });
});

test("LICENSES: the publish route's allowlist is closed", () => {
  assert.ok(share.LICENSES.includes(share.DEFAULT_LICENSE));
  assert.ok(!share.LICENSES.includes("whatever-i-typed"));
});

// --- seo: what a crawler or research tool actually receives ---
const seo = require("./seo");

const SHELL = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>Well of Wisdom</title><meta name="description" content="generic">' +
  '<meta property="og:title" content="generic"></head><body></body></html>';

const META = {
  title: "Fractions through Sewing", topic: "fractions", lens: "sewing",
  grade_level: 5, description: "Halves and quarters at the cutting table.",
  public_slug: "fractions-through-sewing", published_at: new Date("2026-08-31"),
  license: "CC-BY-4.0", author_name: "Kevin", cover_url: null, lessons: 9,
};

test("seo: the shell's generic tags are replaced, not duplicated", () => {
  const out = seo.injectHead(SHELL, seo.courseHead(META, "https://wellofwisdom.app"));
  assert.equal((out.match(/name="description"/g) || []).length, 1);
  assert.equal((out.match(/property="og:title"/g) || []).length, 1);
  assert.match(out, /<title>Fractions through Sewing/);
  assert.doesNotMatch(out, /content="generic"/);
});

test("seo: emits schema.org Course JSON-LD a research tool can read", () => {
  const head = seo.courseHead(META, "https://wellofwisdom.app");
  const json = JSON.parse(head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json["@type"], "Course");
  assert.equal(json.name, "Fractions through Sewing");
  assert.equal(json.isAccessibleForFree, true);
  assert.equal(json.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(json.url, "https://wellofwisdom.app/c/fractions-through-sewing");
});

test("seo: escapes a course title that contains markup", () => {
  const head = seo.courseHead({ ...META, title: '<script>alert(1)</script>' }, "https://x.test");
  assert.doesNotMatch(head, /<script>alert/);
  assert.match(head, /&lt;script&gt;/);
});

test("seo: robots keeps the app private and the shared courses crawlable", () => {
  const txt = seo.robotsTxt("https://wellofwisdom.app");
  assert.match(txt, /Allow: \/c\//);
  assert.match(txt, /Disallow: \/learners/);
  assert.match(txt, /Disallow: \/records/);
  assert.match(txt, /Sitemap: https:\/\/wellofwisdom\.app\/sitemap\.xml/);
});
