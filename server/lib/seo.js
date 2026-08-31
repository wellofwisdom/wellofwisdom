// SPDX-License-Identifier: AGPL-3.0-or-later
// Server-rendered metadata for public course pages.
//
// The app is a SPA, so a crawler, a link unfurler, or a research tool that
// reads HTML without running JavaScript would otherwise see an empty shell.
// For /c/<slug> we inject a real title, description, Open Graph tags and
// schema.org JSON-LD into index.html before sending it — which is what makes a
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
  const title = `${meta.title} — a free course from Well of Wisdom`;
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

/** Replace the shell's <title> with real metadata. */
function injectHead(html, headBlock) {
  // Drop the shell's generic tags first — shipping two descriptions or two
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

/** robots.txt — public course pages are crawlable, the app itself is not. */
function robotsTxt(base) {
  return [
    "User-agent: *",
    "Allow: /c/",
    "Allow: /api/public/",
    "Disallow: /api/",
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
  const urls = [
    `<url><loc>${esc(base)}/c</loc><changefreq>daily</changefreq></url>`,
    ...rows.map((r) =>
      `<url><loc>${esc(base)}/c/${esc(r.public_slug)}</loc>` +
      `<lastmod>${new Date(r.published_at).toISOString().slice(0, 10)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

module.exports = { esc, origin, publishedMeta, courseHead, injectHead, robotsTxt, sitemapXml };
