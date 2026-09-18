// SPDX-License-Identifier: AGPL-3.0-or-later
// One definition per item type: normalize, problem, strip, grade.
// coursegen, grade, share, learn, and coursecheck all go through here so a
// new type is one file plus one line here and one dispatch elsewhere.
const article = require("./article");
const exercise = require("./exercise");
const video = require("./video");
const audio = require("./audio");
const project = require("./project");
const figure = require("./figure");
const steps = require("./steps");
const predict = require("./predict");
const flashcards = require("./flashcards");

const graded_reader = require("./graded_reader");
const REGISTRY = {
  article,
  graded_reader,
  exercise,
  video,
  audio,
  project,
  figure,
  steps,
  predict,
  flashcards,
};

function registry() { return REGISTRY; }
function forType(type) { return REGISTRY[type] || null; }

module.exports = { REGISTRY, registry, forType };
