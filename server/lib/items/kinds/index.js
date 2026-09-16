// SPDX-License-Identifier: AGPL-3.0-or-later
const mcq = require("./mcq");
const numeric = require("./numeric");
const text = require("./text");
const multi = require("./multi");
const cloze = require("./cloze");
const numberline = require("./numberline");
const fraction = require("./fraction");
const common = require("./common");

const REGISTRY = {
  mcq,
  numeric,
  text,
  multi,
  cloze,
  numberline,
  fraction,
};

function forKind(kind) {
  return REGISTRY[kind] || null;
}

function kinds() {
  return REGISTRY;
}

module.exports = { REGISTRY, forKind, kinds, common };
