// SPDX-License-Identifier: AGPL-3.0-or-later
// server/lib/site.json is the one list of public pages, features and audiences.
// These tests fail when a page exists in one place and not another: the
// sitemap, robots.txt, llms.txt, the server's head rendering, or the web routes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SITE = require("./site.json");
const seo = require("./seo");

const BASE = "https://example.org";
const paths = SITE.pages.map((p) => p.path);

test("every page has a unique path, a known section, a title and a description", () => {
  assert.equal(new Set(paths).size, paths.length, "duplicate page path");
  for (const p of SITE.pages) {
    assert.ok(["home", "product", "audience", "legal"].includes(p.section), `${p.path}: section ${p.section}`);
    assert.ok(p.title && p.title.length <= 90, `${p.path}: title missing or too long for search results`);
    assert.ok(p.description && p.description.length >= 60 && p.description.length <= 300, `${p.path}: description length`);
  }
  assert.ok(paths.includes(""), "home page listed");
});

test("audiences and audience pages match one to one", () => {
  const audiencePages = SITE.pages.filter((p) => p.section === "audience").map((p) => p.path).sort();
  const audiences = SITE.audiences.map((a) => a.slug).sort();
  assert.deepEqual(audiences, audiencePages);
  for (const a of SITE.audiences) {
    assert.equal(a.steps.length, 4, `${a.slug}: four getting-started steps`);
    assert.ok(a.needs.length >= 3, `${a.slug}: needs`);
    for (const n of a.needs) assert.ok(SITE.pillars.some((p) => p.id === n.pillar), `${a.slug}: unknown pillar ${n.pillar}`);
  }
});

test("there are exactly nine hazels, numbered in order, each with features", () => {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  assert.deepEqual(SITE.pillars.map((p) => p.numeral), numerals);
  for (const p of SITE.pillars) assert.ok(p.features.length >= 3, `${p.id}: features`);
});

test("the sitemap lists every page", async () => {
  const xml = await seo.sitemapXml(BASE);
  for (const p of paths) assert.ok(xml.includes(`<loc>${BASE}/${p}</loc>`), `sitemap misses /${p}`);
});

test("robots.txt allows every page and still hides the app", () => {
  const txt = seo.robotsTxt(BASE);
  for (const p of paths.filter(Boolean)) assert.ok(txt.includes(`Allow: /${p}\n`), `robots misses /${p}`);
  assert.ok(txt.includes("Disallow: /settings"));
  assert.ok(txt.includes(`Sitemap: ${BASE}/sitemap.xml`));
});

test("llms.txt links every page and names every feature", () => {
  const txt = seo.llmsTxt(BASE);
  for (const p of SITE.pages) assert.ok(txt.includes(`](${BASE}/${p.path})`), `llms.txt misses /${p.path}`);
  for (const pl of SITE.pillars) for (const f of pl.features) assert.ok(txt.includes(f.name), `llms.txt misses ${f.name}`);
});

test("every page gets a server-rendered head", () => {
  for (const p of SITE.pages.filter((x) => x.path)) {
    const head = seo.staticHead(p.path, BASE);
    assert.ok(head.includes(`<title>`), `/${p.path} head`);
    assert.ok(head.includes(`${BASE}/og.png`), `/${p.path} share image`);
  }
  assert.ok(seo.staticHead("", BASE).includes(`<link rel="canonical" href="${BASE}/">`));
});

test("the web app routes every page in site.json", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "App.tsx"), "utf8");
  assert.ok(app.includes("SITE.audiences.map"), "audience pages are routed from site.json");
  for (const p of SITE.pages.filter((x) => x.section !== "audience" && x.path && x.path !== "c")) {
    const key = /^[a-z]+$/.test(p.path) ? new RegExp(`\\b${p.path}:`) : new RegExp(`"${p.path}":`);
    assert.ok(key.test(app), `App.tsx has no public route for /${p.path}`);
  }
  assert.ok(app.includes('route === "c"'), "the open course gallery is routed");
});

test("the site copy follows house style", () => {
  const raw = fs.readFileSync(path.join(__dirname, "site.json"), "utf8");
  assert.ok(!raw.includes(String.fromCharCode(0x2014)), "no em dashes");
  assert.ok(!raw.includes(String.fromCharCode(0x2013)), "no en dashes");
});
