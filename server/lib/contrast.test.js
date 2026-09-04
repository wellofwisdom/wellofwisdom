// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const contrast = require("./contrast");

test("the contrast maths matches known WCAG values", () => {
  // If these drift, every other assertion in this file is worthless.
  assert.equal(contrast.ratio("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrast.ratio("#ffffff", "#ffffff").toFixed(2), "1.00");
  // The canonical "just passes AA on white" grey.
  assert.ok(contrast.ratio("#767676", "#ffffff") >= 4.5);
  assert.ok(contrast.ratio("#777777", "#ffffff") < 4.6);
});

test("hexToRgb handles the forms the stylesheet actually uses", () => {
  assert.deepEqual(contrast.hexToRgb("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(contrast.hexToRgb("#0e7254"), { r: 14, g: 114, b: 84 });
  assert.equal(contrast.hexToRgb("nonsense"), null);
  assert.equal(contrast.hexToRgb(""), null);
});

test("composite paints a wash over a base, which is what a gradient does", () => {
  // Full alpha is the wash colour, zero alpha is the base, half is between.
  assert.deepEqual(contrast.composite("#000000", "#ffffff", 1), { r: 255, g: 255, b: 255 });
  assert.deepEqual(contrast.composite("#000000", "#ffffff", 0), { r: 0, g: 0, b: 0 });
  const half = contrast.composite("#000000", "#ffffff", 0.5);
  assert.ok(half.r > 120 && half.r < 135);
});

test("the theme is parsed from source, not duplicated here", () => {
  const accents = contrast.readAccents();
  assert.ok(accents.length >= 8, `expected the full accent set, got ${accents.length}`);
  for (const a of accents) {
    assert.match(a.base, /^#[0-9a-f]{6}$/i, `${a.id} base`);
    assert.match(a.dark, /^#[0-9a-f]{6}$/i, `${a.id} dark`);
  }
  assert.ok(contrast.readWashes().length >= 10, "background washes should be found");
  assert.match(contrast.readTokens("light").bg, /^#/);
  assert.match(contrast.readTokens("dark").bg, /^#/);
});

test("EVERY accent and background combination meets WCAG AA", () => {
  // 410 pairs: each accent as text on every background a wash can produce, in
  // both themes, plus button labels, soft surfaces and body/muted text.
  //
  // This started at 77 failures. The fix was to soften the decorative washes
  // to 65% and nudge five light accents, because decoration carries no meaning
  // and an accent palette does. If this test fails after a colour change, do
  // not lower the threshold: soften the wash or darken the accent.
  const results = contrast.audit();
  assert.ok(results.length > 300, `expected a real sweep, got ${results.length} pairs`);
  const bad = contrast.failures(results);
  const detail = bad
    .slice(0, 10)
    .map((f) => `${f.theme} ${f.pair}: accent=${f.accent} bg=${f.bg} ${f.got.toFixed(2)} < ${f.need}`)
    .join("\n  ");
  assert.equal(bad.length, 0, `${bad.length} colour pairs below AA:\n  ${detail}`);
});

test("a button label never disappears into its own button", () => {
  // The pair with no escape: if this fails the control is unreadable and
  // there is no background wash to blame.
  const bad = contrast
    .audit()
    .filter((r) => r.pair === "label on accent button" && r.got < 4.5);
  assert.equal(bad.length, 0, JSON.stringify(bad));
});

test("body text keeps a wide margin, not a passing grade", () => {
  // Body text is read for hours. AA is the floor, not the target.
  const body = contrast.audit().filter((r) => r.pair === "body text on background");
  assert.ok(body.length > 0);
  for (const r of body) {
    assert.ok(r.got >= 7, `body text at ${r.got.toFixed(2)} on ${r.theme}/${r.bg} is only AA, aim for AAA`);
  }
});
