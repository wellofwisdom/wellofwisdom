// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const standards = require("./standards");

test("normalizeStandards: trims, uppercases framework prefix, dedupes, caps 12", () => {
  const input = [
    "  ccss.math.content.4.nf.a.1  ",
    "CCSS.MATH.CONTENT.4.NF.A.1",
    "ngss.ess1.a",
    "   ",
    "TX-TEKS-4.2B",
    " tx-teks-4.2b ",
  ];
  const out = standards.normalizeStandards(input);
  assert.deepEqual(out, ["CCSS.MATH.CONTENT.4.NF.A.1", "NGSS.ESS1.A", "TX-TEKS-4.2B"]);
});

test("normalizeStandards: max 12 per lesson", () => {
  const many = Array.from({ length: 20 }, (_, i) => `CCSS.MATH.${i}`);
  const out = standards.normalizeStandards(many);
  assert.equal(out.length, 12);
});

test("normalizeStandards: max 40 chars each", () => {
  const long = "A".repeat(100);
  const out = standards.normalizeStandards([long]);
  assert.ok(out[0].length <= 40);
});

test("normalizeStandards: accepts string or array, empty input", () => {
  assert.deepEqual(standards.normalizeStandards(null), []);
  assert.deepEqual(standards.normalizeStandards([]), []);
  assert.deepEqual(standards.normalizeStandards("CCSS.MATH.1"), ["CCSS.MATH.1"]);
});

test("frameworkOf: CCSS Math, CCSS ELA, NGSS, State", () => {
  assert.equal(standards.frameworkOf("CCSS.MATH.CONTENT.4.NF.A.1"), "CCSS Math");
  assert.equal(standards.frameworkOf("ccss.math.content.4.nf.a.1"), "CCSS Math");
  assert.equal(standards.frameworkOf("CCSS.ELA-LITERACY.RL.4.1"), "CCSS ELA");
  assert.equal(standards.frameworkOf("CCSS.SOMETHING"), "CCSS");
  assert.equal(standards.frameworkOf("NGSS.ESS1.A"), "NGSS");
  assert.equal(standards.frameworkOf("TX-TEKS-4.2B"), "State");
  assert.equal(standards.frameworkOf("VA-SOL-4.5"), "State");
  assert.equal(standards.labelFor("NGSS.ESS1.A"), "NGSS");
});

test("normalizeCode: normalizes to uppercase for CCSS NGSS", () => {
  assert.equal(standards.normalizeCode("ccss.math.content.4.nf.a.1"), "CCSS.MATH.CONTENT.4.NF.A.1");
  assert.equal(standards.normalizeCode("CCSS.MATH.CONTENT.4.NF.A.1"), "CCSS.MATH.CONTENT.4.NF.A.1");
});

test("normalizeCefr: A1 to C2, case insensitive, rejects others", () => {
  assert.equal(standards.normalizeCefr("A1"), "A1");
  assert.equal(standards.normalizeCefr("a1"), "A1");
  assert.equal(standards.normalizeCefr(" b2 "), "B2");
  assert.equal(standards.normalizeCefr("C2"), "C2");
  assert.equal(standards.normalizeCefr("Z9"), null);
  assert.equal(standards.normalizeCefr(""), null);
  assert.equal(standards.normalizeCefr(null), null);
});

test("normalizeLanguage: 2 or 3 letters, optional region", () => {
  assert.equal(standards.normalizeLanguage("es"), "es");
  assert.equal(standards.normalizeLanguage("ES"), "es");
  assert.equal(standards.normalizeLanguage("fr"), "fr");
  assert.equal(standards.normalizeLanguage("en-US"), "en-us");
  assert.equal(standards.normalizeLanguage("xx"), "xx");
  assert.equal(standards.normalizeLanguage("!!"), null);
  assert.equal(standards.normalizeLanguage(""), null);
  assert.equal(standards.normalizeLanguage(null), null);
});

test("CEFR descriptors: A1 present and labelFor carries descriptor", () => {
  const d = standards.descriptorFor("A1");
  assert.ok(d && d.length > 20);
  assert.match(d, /familiar everyday/i);
  const lab = standards.labelFor("A1");
  assert.match(lab, /CEFR A1/i);
  assert.match(lab, /familiar/i);
  assert.equal(standards.frameworkOf("A1"), "CEFR");
  assert.equal(standards.frameworkOf("CEFR A1"), "CEFR");
  assert.equal(standards.frameworkOf("cefr.a1"), "CEFR");
});

test("CEFR descriptors: all levels have one", () => {
  for (const lvl of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    const d = standards.descriptorFor(lvl);
    assert.ok(d && d.length > 20, lvl + " missing descriptor");
  }
});

test("groupByLanguage: groups by target_language and cefr", () => {
  const rows = [
    { target_language: "es", cefr: "A1" },
    { target_language: "es", cefr: "A1" },
    { target_language: "fr", cefr: "A1" },
    { target_language: "es", cefr: "A2" },
  ];
  const g = standards.groupByLanguage(rows);
  assert.equal(g.length, 3);
  const esA1 = g.find((x) => x.target_language === "es" && x.cefr === "A1");
  assert.equal(esA1.count, 2);
});

test("groupByCefr: groups by cefr in order", () => {
  const rows = [{ cefr: "B1" }, { cefr: "A1" }, { cefr: "A1" }, { cefr: "C1" }];
  const g = standards.groupByCefr(rows);
  assert.equal(g[0].cefr, "A1");
  assert.equal(g[0].count, 2);
  assert.equal(g[1].cefr, "B1");
  assert.equal(g[2].cefr, "C1");
});

test("frameworkOf still handles non-CEFR codes", () => {
  assert.equal(standards.frameworkOf("CCSS.MATH.CONTENT.4.NF.A.1"), "CCSS Math");
  assert.equal(standards.frameworkOf("NGSS.ESS1.A"), "NGSS");
});

test("normalizeCode handles CEFR bare level", () => {
  assert.equal(standards.normalizeCode("a1"), "A1");
  assert.equal(standards.normalizeCode("CEFR A1"), "A1");
  assert.equal(standards.normalizeCode("cefr.a2"), "A2");
});
