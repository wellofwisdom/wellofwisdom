// SPDX-License-Identifier: AGPL-3.0-or-later
// Server-rendered metadata for public course pages.
//
// The app is a SPA, so a crawler, a link unfurler, or a research tool that
// reads HTML without running JavaScript would otherwise see an empty shell.
// For /c/<slug> we inject a real title, description, Open Graph tags and
// schema.org JSON-LD into index.html before sending it. Which is what makes a
// shared course quotable, linkable, and ingestible by tools like NotebookLM.
const db = require("./db");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function origin(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

/** Course meta for a published slug, or null. */
async function publishedMeta(slug) {
  const { rows } = await db.query(
    `select c.title, c.topic, c.lens, c.grade_level, c.description, c.public_slug,
            c.published_at, c.license, c.author_name, c.cover_url,
            (select count(*) from lessons l join units u on u.id = l.unit_id where u.course_id = c.id)::int as lessons
       from courses c where c.public_slug = $1 and c.published_at is not null`,
    [slug]
  );
  return rows[0] || null;
}

const LICENSE_URL = {
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
};

/** The <head> block for one published course. */
function courseHead(meta, base) {
  const url = `${base}/c/${meta.public_slug}`;
  const title = `${meta.title}. A free course from Well of Wisdom`;
  const desc = (meta.description
    || `A ${meta.lens ? `${meta.lens}-flavoured ` : ""}course on ${meta.topic}`
       + `${meta.grade_level ? ` for grade ${meta.grade_level}` : ""}, `
       + `${meta.lessons} lessons. Free to download and teach.`).slice(0, 300);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: meta.title,
    description: desc,
    url,
    inLanguage: "en",
    isAccessibleForFree: true,
    license: LICENSE_URL[meta.license] || meta.license || undefined,
    datePublished: meta.published_at ? new Date(meta.published_at).toISOString() : undefined,
    about: meta.topic,
    educationalLevel: meta.grade_level ? `Grade ${meta.grade_level}` : undefined,
    creator: meta.author_name ? { "@type": "Person", name: meta.author_name } : undefined,
    provider: { "@type": "Organization", name: "Well of Wisdom", url: base },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: `PT${Math.max(1, meta.lessons) * 30}M`,
    },
  };

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    meta.cover_url ? `<meta property="og:image" content="${esc(meta.cover_url)}">` : "",
    `<meta name="twitter:card" content="${meta.cover_url ? "summary_large_image" : "summary"}">`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n    ");
}

/** The public site's pages, features and audiences: one file, server/lib/site.json,
 *  read here for heads, robots, the sitemap and llms.txt, and by the web app to
 *  render the pages. Add a page there and every surface knows about it. */
const SITE = require("./site.json");
const STATIC_PAGES = Object.fromEntries(SITE.pages.filter((p) => p.path).map((p) => [p.path, p]));

function staticHead(id, base) {
  const meta = id === "" ? SITE.pages.find((p) => p.path === "") : STATIC_PAGES[id];
  if (!meta) return "";
  const url = id ? `${base}/${id}` : `${base}/`;
  const image = `${base}/og.png`;
  return [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Well of Wisdom">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
  ].join("\n    ");
}

/** Replace the shell's <title> with real metadata. */
function injectHead(html, headBlock) {
  // Drop the shell's generic tags first: shipping two descriptions or two
  // og:titles is ambiguous, and the generic one wins in some parsers.
  const out = html
    .replace(/\s*<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/\s*<meta\s+property=["']og:[^"']*["'][^>]*>/gi, "")
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "");
  if (/<title>[\s\S]*?<\/title>/.test(out)) {
    return out.replace(/<title>[\s\S]*?<\/title>/, headBlock);
  }
  return out.replace(/<\/head>/i, `    ${headBlock}
  </head>`);
}

/** robots.txt: the public site and open courses are crawlable, the app is not. */
function robotsTxt(base) {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /c/",
    "Allow: /api/public/",
    "Allow: /llms.txt",
    ...SITE.pages.filter((p) => p.path).map((p) => `Allow: /${p.path}`),
    "Disallow: /api/",
    "Disallow: /join",
    "Disallow: /learners",
    "Disallow: /settings",
    "Disallow: /records",
    "Disallow: /notes",
    "Disallow: /library",
    "Disallow: /calendar",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

async function sitemapXml(base) {
  const { rows } = await db.query(
    `select public_slug, published_at from courses
      where published_at is not null order by published_at desc limit 5000`
  ).catch(() => ({ rows: [] }));
  const pageUrls = SITE.pages.map((p) =>
    `<url><loc>${esc(base)}/${esc(p.path)}</loc><changefreq>${p.section === "legal" ? "monthly" : "weekly"}</changefreq><priority>${esc(p.priority || "0.5")}</priority></url>`);
  const urls = [
    ...pageUrls,
    ...rows.map((r) =>
      `<url><loc>${esc(base)}/c/${esc(r.public_slug)}</loc>` +
      `<lastmod>${new Date(r.published_at).toISOString().slice(0, 10)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function llmsTxt(base) {
  const link = (p) => `- [${p.title}](${base}/${p.path}): ${p.description}`;
  const bySection = (s) => SITE.pages.filter((p) => p.section === s).map(link);
  return [
    "# Well of Wisdom",
    "",
    `> ${SITE.summary}`,
    "",
    "## Product",
    "",
    ...bySection("home"),
    ...bySection("product"),
    "",
    "## Who it is for",
    "",
    ...bySection("audience"),
    "",
    "## Features",
    "",
    ...SITE.pillars.flatMap((pl) => [
      `### ${pl.title}`,
      "",
      pl.line,
      "",
      ...pl.features.map((ft) => `- ${ft.name}: ${ft.detail}`),
      "",
    ]),
    "## On the roadmap",
    "",
    ...SITE.roadmap.map((r) => `- ${r.name}: ${r.detail}`),
    "",
    "## Machine-readable courses",
    "",
    `- [Open course gallery](${base}/c)`,
    `- [Plain-text courses](${base}/c/<slug>.txt) (answer keys stripped)`,
    `- [Course packages](${base}/api/public/courses/<slug>/export) (portable JSON)`,
    `- [Public course list](${base}/api/public/courses) (JSON)`,
    "",
    "Each published course at /c/<slug> has a plain-text sibling at /c/<slug>.txt with answer keys stripped, and a .wow-course.json download at /api/public/courses/<slug>/export. Import the JSON in any running Well of Wisdom at Courses then Import, or paste the /c/ URL.",
    "",
    "## Legal",
    "",
    ...bySection("legal"),
    "",
    `- [Source code](${SITE.repo}) (AGPL-3.0)`,
    `- [Roadmap](${SITE.repo}/blob/main/docs/ROADMAP.md)`,
    "",
  ].join("\n");
}

module.exports = { esc, origin, publishedMeta, courseHead, injectHead, robotsTxt, sitemapXml, llmsTxt, staticHead, STATIC_PAGES, SITE };
