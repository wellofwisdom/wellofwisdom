// SPDX-License-Identifier: AGPL-3.0-or-later
const mcq = require("./mcq");
const numeric = require("./numeric");
const text = require("./text");
const multi = require("./multi");
const order = require("./order");
const match = require("./match");
const categorize = require("./categorize");
const common = require("./common");

const REGISTRY = {
  mcq,
  numeric,
  text,
  multi,
  order,
  match,
  categorize,
};

function forKind(kind) {
  return REGISTRY[kind] || null;
}

function kinds() {
  return REGISTRY;
}

module.exports = { REGISTRY, forKind, kinds, common };
