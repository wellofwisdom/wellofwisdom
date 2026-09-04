// SPDX-License-Identifier: AGPL-3.0-or-later
// WCAG contrast maths, and the colour pairs this app actually puts together.
//
// The theme offers 8 accents and 12 background washes. Nobody had ever checked
// what those combinations do to legibility, and "it looks fine to me" is not a
// measurement: the people most affected are the ones least likely to be in the
// room.
//
// The washes are low-opacity radial gradients painted OVER the base background
// rather than replacing it, so the honest test composites each wash at its
// strongest alpha and measures against that, not against the raw swatch.
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "..", "..", "web", "src");

function hexToRgb(hex) {
  const h = String(hex || "").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, WCAG 2.1 definition. */
function luminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio between two colours, 1 to 21. */
function ratio(a, b) {
  const ca = typeof a === "string" ? hexToRgb(a) : a;
  const cb = typeof b === "string" ? hexToRgb(b) : b;
  if (!ca || !cb) return 0;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Paint `over` at alpha on top of `base`. This is what a wash actually does. */
function composite(base, over, alpha) {
  const b = typeof base === "string" ? hexToRgb(base) : base;
  const o = typeof over === "string" ? hexToRgb(over) : over;
  if (!b || !o) return b;
  return {
    r: Math.round(o.r * alpha + b.r * (1 - alpha)),
    g: Math.round(o.g * alpha + b.g * (1 - alpha)),
    b: Math.round(o.b * alpha + b.b * (1 - alpha)),
  };
}

/** Accents, read from the source of truth rather than duplicated here. */
function readAccents() {
  const src = fs.readFileSync(path.join(WEB, "theme.ts"), "utf8");
  const block = src.slice(src.indexOf("export const ACCENTS"));
  const out = [];
  const re = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*base:\s*"([^"]+)",\s*dark:\s*"([^"]+)",\s*soft:\s*"([^"]+)",\s*softDark:\s*"([^"]+)",\s*contrast:\s*"([^"]+)",\s*contrastDark:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    out.push({
      id: m[1], name: m[2], base: m[3], dark: m[4],
      soft: m[5], softDark: m[6], contrast: m[7], contrastDark: m[8],
    });
  }
  return out;
}

/** Every rgba() used in a background wash, with its alpha. */
function readWashes() {
  const css = fs.readFileSync(path.join(WEB, "styles.css"), "utf8");
  const out = [];
  const blockRe = /\[data-bg="([^"]+)"\]\s*body::before\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const id = m[1];
    const colours = [];
    const rgbaRe = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g;
    let c;
    while ((c = rgbaRe.exec(m[2])) !== null) {
      if (Number(c[4]) === 0) continue; // the transparent stop of a gradient
      colours.push({
        rgb: { r: Number(c[1]), g: Number(c[2]), b: Number(c[3]) },
        alpha: Number(c[4]),
      });
    }
    if (colours.length) out.push({ id, colours });
  }
  return out;
}

/** Core tokens for one theme, read from the stylesheet. */
function readTokens(theme) {
  const css = fs.readFileSync(path.join(WEB, "styles.css"), "utf8");
  const start = theme === "dark"
    ? css.indexOf('[data-theme="dark"] {')
    : css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const grab = (name) => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
    return m ? m[1] : null;
  };
  return {
    bg: grab("bg"), panel: grab("panel"), text: grab("text"),
    muted: grab("muted"), border: grab("border"),
  };
}

/**
 * Every pair worth measuring, with the WCAG level each must meet.
 * 4.5 is normal text. 3.0 is large text and non-text UI (a button's own
 * background against the page, an icon, a focus ring).
 */
function audit() {
  const accents = readAccents();
  const washes = readWashes();
  const results = [];

  for (const theme of ["light", "dark"]) {
    const t = readTokens(theme);
    if (!t.bg) continue;
    const dark = theme === "dark";

    // The worst background a wash can produce, per theme.
    const backgrounds = [{ id: "none", rgb: hexToRgb(t.bg) }];
    for (const w of washes) {
      for (const c of w.colours) {
        backgrounds.push({ id: w.id, rgb: composite(t.bg, c.rgb, c.alpha) });
      }
    }

    for (const a of accents) {
      const accent = dark ? a.dark : a.base;
      const onAccent = dark ? a.contrastDark : a.contrast;
      const soft = dark ? a.softDark : a.soft;

      results.push({
        theme, accent: a.id, bg: "n/a", pair: "label on accent button",
        need: 4.5, got: ratio(onAccent, accent),
      });
      results.push({
        theme, accent: a.id, bg: "panel", pair: "accent text on panel",
        need: 4.5, got: ratio(accent, t.panel),
      });
      results.push({
        theme, accent: a.id, bg: "soft", pair: "body text on soft accent",
        need: 4.5, got: ratio(t.text, soft),
      });

      // Accent against every background a wash can make.
      for (const b of backgrounds) {
        results.push({
          theme, accent: a.id, bg: b.id, pair: "accent text on background",
          need: 4.5, got: ratio(accent, b.rgb),
        });
      }
    }

    // Theme text, independent of accent.
    for (const b of backgrounds) {
      results.push({ theme, accent: "n/a", bg: b.id, pair: "body text on background", need: 4.5, got: ratio(t.text, b.rgb) });
      results.push({ theme, accent: "n/a", bg: b.id, pair: "muted text on background", need: 4.5, got: ratio(t.muted, b.rgb) });
    }
    results.push({ theme, accent: "n/a", bg: "panel", pair: "muted text on panel", need: 4.5, got: ratio(t.muted, t.panel) });
  }

  return results;
}

function failures(results, slack = 0) {
  return results.filter((r) => r.got < r.need - slack);
}

module.exports = {
  hexToRgb, luminance, ratio, composite,
  readAccents, readWashes, readTokens, audit, failures,
};
