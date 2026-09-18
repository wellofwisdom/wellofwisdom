// SPDX-License-Identifier: AGPL-3.0-or-later
const mcq = require("./mcq");
const numeric = require("./numeric");
const text = require("./text");
const multi = require("./multi");
const cloze = require("./cloze");
const numberline = require("./numberline");
const fraction = require("./fraction");
const order = require("./order");
const match = require("./match");
const categorize = require("./categorize");
const hotspot = require("./hotspot");
const plot = require("./plot");
const scenario = require("./scenario");
const vocab_card = require("./vocab_card");
const listen_choice = require("./listen_choice");
const listen_repeat = require("./listen_repeat");
const translate = require("./translate");
const dialogue = require("./dialogue");
const common = require("./common");

const REGISTRY = {
  mcq,
  numeric,
  text,
  multi,
  cloze,
  numberline,
  fraction,
  order,
  match,
  categorize,
  hotspot,
  plot,
  scenario,
  vocab_card,
  listen_choice,
  listen_repeat,
  translate,
  dialogue,
};

function forKind(kind) {
  return REGISTRY[kind] || null;
}

function kinds() {
  return REGISTRY;
}

module.exports = { REGISTRY, forKind, kinds, common };
