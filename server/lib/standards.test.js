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
