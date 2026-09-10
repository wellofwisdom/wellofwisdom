// SPDX-License-Identifier: AGPL-3.0-or-later
// Text tidying shared by the normalizers.

// An HTML tag a model wrapped round a word (<b>, <br/>, <span class=..>), and
// nothing else. The pattern this replaced took everything from any "<" to the
// next ">", so "Is 3 < 5 or 7 > 4?" was stored as "Is 3  4?": every inequality
// in a generated or imported course lost its maths. A tag has to start with a
// letter straight after the bracket, which "3 < 5" and "$a<b$" do not.
//
// This is tidying, not a security layer: the app renders text through React
// (escaped) and maths through KaTeX, which escapes its own input.
const TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;

function stripTags(s) {
  return String(s == null ? "" : s).replace(TAG, "");
}

module.exports = { stripTags };
