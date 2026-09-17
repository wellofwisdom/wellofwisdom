// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const exercise = require("./items/exercise");
const grade = require("./grade");
const share = require("./share");
const coursegen = require("./coursegen");

// Helpers
function hotspotContent(over = {}) {
  return {
    prompt: "Click the heart",
    kind: "hotspot",
    regions: [{ shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }],
    answer: ["r1"],
    ...over,
  };
}
function plotContent(over = {}) {
  return {
    prompt: "Plot the point",
    kind: "plot",
    grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 },
    answer: [{ x: 2, y: 3 }],
    tolerance: 0.5,
    ...over,
  };
}
function scenarioContent(over = {}) {
  return {
    prompt: "Choose your path",
    kind: "scenario",
    start: "a",
    nodes: {
      a: { text: "Start", choices: [{ text: "Go left", next: "b" }, { text: "Go right", next: "c" }] },
      b: { text: "Bad ending", choices: [] },
      c: { text: "Good ending", choices: [] },
    },
    good: ["c"],
    ...over,
  };
}

// ---- hotspot ----

test("hotspot normalize: valid content", () => {
  const n = exercise.normalize(hotspotContent());
  assert.ok(n);
  assert.equal(n.kind, "hotspot");
  assert.equal(n.regions.length, 1);
  assert.deepEqual(n.answer, ["r1"]);
});

test("hotspot normalize: needs prompt", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }], answer: ["r1"] }), null);
});

test("hotspot normalize: needs at least one region", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "hotspot", regions: [], answer: ["r1"] }), null);
});

test("hotspot normalize: rect needs 2 points", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: 10, y: 10 }] }], answer: ["r1"] }), null);
});

test("hotspot normalize: poly needs 3 points", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "hotspot", regions: [{ shape: "poly", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }], answer: ["r1"] }), null);
});

test("hotspot normalize: empty answer leaves answer absent", () => {
  const n = exercise.normalize({ prompt: "p", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: [] });
  assert.ok(n);
  assert.equal(n.answer, undefined);
});

test("hotspot normalize: unknown answer id filtered out", () => {
  const n = exercise.normalize({ prompt: "p", kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r99"] });
  assert.ok(n);
  assert.equal(n.answer, undefined);
});

test("hotspot normalize: clamps percent coords", () => {
  const n = exercise.normalize({ prompt: "p", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: -5, y: 200 }, { x: 50, y: 50 }] }], answer: ["r1"] });
  assert.ok(n);
  assert.equal(n.regions[0].points[0].x, 0);
  assert.equal(n.regions[0].points[0].y, 100);
});

test("hotspot problem: prompt and regions checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"] }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "hotspot", regions: [], answer: ["r1"] }), "regions_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "hotspot", regions: [{ shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: [] }), "answer_required");
  assert.equal(exercise.problem(hotspotContent()), null);
});

test("hotspot problem: answer invalid when id not in regions", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r99"] }), "answer_invalid");
});

test("hotspot grading: point inside correct region", () => {
  const item = { kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"] };
  const hit = grade.gradeExercise(item, { x: 20, y: 20 });
  assert.equal(hit.correct, true);
  assert.equal(hit.score, 1);
  const miss = grade.gradeExercise(item, { x: 80, y: 80 });
  assert.equal(miss.correct, false);
  assert.equal(miss.score, 0);
});

test("hotspot grading: boundary is inside", () => {
  const item = { kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"] };
  assert.equal(grade.gradeExercise(item, { x: 10, y: 10 }).correct, true);
  assert.equal(grade.gradeExercise(item, { x: 30, y: 30 }).correct, true);
});

test("hotspot grading: poly region", () => {
  const diamond = { kind: "hotspot", regions: [{ id: "r1", shape: "poly", points: [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }] }], answer: ["r1"] };
  assert.equal(grade.gradeExercise(diamond, { x: 50, y: 50 }).correct, true);
  assert.equal(grade.gradeExercise(diamond, { x: 5, y: 5 }).correct, false);
});

test("hotspot grading: keyboard region ids", () => {
  const item = { kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }, { id: "r2", shape: "rect", points: [{ x: 60, y: 60 }, { x: 90, y: 90 }] }], answer: ["r1"] };
  assert.equal(grade.gradeExercise(item, ["r1"]).correct, true);
  assert.equal(grade.gradeExercise(item, ["r2"]).correct, false);
  assert.equal(grade.gradeExercise(item, "r1").correct, true);
});

test("hotspot grading: multiple correct regions", () => {
  const item = {
    kind: "hotspot",
    regions: [
      { id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] },
      { id: "r2", shape: "rect", points: [{ x: 60, y: 60 }, { x: 90, y: 90 }] },
    ],
    answer: ["r1", "r2"],
  };
  // point in one of two is not fully correct for multi? spec says point inside a correct region is correct.
  // For point input, any correct region hit is correct.
  assert.equal(grade.gradeExercise(item, { x: 20, y: 20 }).correct, true);
  assert.equal(grade.gradeExercise(item, { x: 70, y: 70 }).correct, true);
  assert.equal(grade.gradeExercise(item, { x: 50, y: 50 }).correct, false);
});

test("hotspot grading: no key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: [] }, { x: 20, y: 20 }), null);
});

test("hotspot grading: invalid point is false not null", () => {
  const item = { kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"] };
  assert.equal(grade.gradeExercise(item, { x: "bad", y: 20 }), false);
  assert.equal(grade.gradeExercise(item, null), false);
});

// ---- plot ----

test("plot normalize: valid", () => {
  const n = exercise.normalize(plotContent());
  assert.ok(n);
  assert.equal(n.kind, "plot");
  assert.equal(n.answer.length, 1);
  assert.equal(n.tolerance, 0.5);
});

test("plot normalize: needs prompt", () => {
  assert.equal(exercise.normalize({ prompt: "", kind: "plot", answer: [{ x: 1, y: 2 }] }), null);
});

test("plot normalize: needs at least one point", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "plot", answer: [] }), null);
});

test("plot normalize: default tolerance and grid", () => {
  const n = exercise.normalize({ prompt: "p", kind: "plot", answer: [{ x: 1, y: 2 }] });
  assert.ok(n);
  assert.ok(n.grid);
  assert.equal(n.tolerance, 0.5);
});

test("plot normalize: clamps tolerance", () => {
  const n = exercise.normalize({ prompt: "p", kind: "plot", answer: [{ x: 1, y: 2 }], tolerance: 100 });
  assert.ok(n);
  assert.equal(n.tolerance, 5);
});

test("plot problem: prompt and answer checks", () => {
  assert.equal(exercise.problem({ prompt: "", kind: "plot", answer: [{ x: 1, y: 2 }] }), "prompt_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "plot", answer: [] }), "answer_required");
  assert.equal(exercise.problem(plotContent()), null);
});

test("plot problem: too many points", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ x: i, y: i }));
  assert.equal(exercise.problem({ prompt: "p", kind: "plot", answer: many }), "too_many_points");
});

test("plot problem: tolerance invalid", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "plot", answer: [{ x: 1, y: 2 }], tolerance: -1 }), "tolerance_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "plot", answer: [{ x: 1, y: 2 }], tolerance: 0 }), "tolerance_invalid");
});

test("plot grading: within tolerance correct", () => {
  const item = { kind: "plot", answer: [{ x: 1, y: 2 }], tolerance: 0.5, grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 } };
  assert.equal(grade.gradeExercise(item, [{ x: 1.2, y: 2.1 }]).correct, true);
  assert.equal(grade.gradeExercise(item, [{ x: 2, y: 3 }]).correct, false);
});

test("plot grading: every required point needed and no extras", () => {
  const item = { kind: "plot", answer: [{ x: 0, y: 0 }, { x: 5, y: 5 }], tolerance: 0.5, grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 } };
  assert.equal(grade.gradeExercise(item, [{ x: 0, y: 0 }, { x: 5, y: 5 }]).correct, true);
  assert.equal(grade.gradeExercise(item, [{ x: 0, y: 0 }]).correct, false);
  const oneMissing = grade.gradeExercise(item, [{ x: 0, y: 0 }]);
  assert.equal(oneMissing.score, 0.5);
  // extras
  const withExtra = grade.gradeExercise(item, [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 1, y: 1 }]);
  assert.equal(withExtra.correct, false);
  assert.ok(withExtra.score < 1);
});

test("plot grading: score is share of matched points", () => {
  const item = { kind: "plot", answer: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }], tolerance: 0.5, grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 } };
  const twoOfThree = grade.gradeExercise(item, [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 99, y: 99 }]);
  assert.equal(twoOfThree.correct, false);
  assert.ok(twoOfThree.score > 0 && twoOfThree.score < 1);
});

test("plot grading: no key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "plot", answer: [], tolerance: 0.5, grid: {} }, [{ x: 1, y: 2 }]), null);
});

test("plot grading: empty learner answer is wrong", () => {
  const item = { kind: "plot", answer: [{ x: 1, y: 2 }], tolerance: 0.5, grid: {} };
  assert.equal(grade.gradeExercise(item, []).correct, false);
  assert.equal(grade.gradeExercise(item, null).correct, false);
});

// ---- scenario ----

test("scenario normalize: valid", () => {
  const n = exercise.normalize(scenarioContent());
  assert.ok(n);
  assert.equal(n.kind, "scenario");
  assert.equal(n.start, "a");
  assert.ok(n.nodes.a);
  assert.deepEqual(n.good, ["c"]);
});

test("scenario normalize: needs start", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "scenario", start: "", nodes: { a: { text: "hi", choices: [] } }, good: ["a"] }), null);
});

test("scenario normalize: needs nodes", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "scenario", start: "a", nodes: {}, good: ["a"] }), null);
});

test("scenario normalize: start must exist", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "scenario", start: "z", nodes: { a: { text: "hi", choices: [] } }, good: ["a"] }), null);
});

test("scenario normalize: needs good ending", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: [] }), null);
});

test("scenario normalize: next must exist", () => {
  assert.equal(exercise.normalize({ prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [{ text: "go", next: "z" }] }, b: { text: "end", choices: [] } }, good: ["b"] }), null);
});

test("scenario problem: checks", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "scenario", start: "", nodes: { a: { text: "hi", choices: [] } }, good: ["a"] }), "start_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "scenario", start: "a", nodes: {}, good: ["a"] }), "nodes_required");
  assert.equal(exercise.problem({ prompt: "p", kind: "scenario", start: "z", nodes: { a: { text: "hi", choices: [] } }, good: ["a"] }), "start_invalid");
  assert.equal(exercise.problem({ prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: [] }), "good_required");
  assert.equal(exercise.problem(scenarioContent()), null);
});

test("scenario problem: good id must exist", () => {
  assert.equal(exercise.problem({ prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: ["z"] }), "good_invalid");
});

test("scenario grading: good ending is correct", () => {
  const item = { kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [{ text: "go", next: "c" }] }, c: { text: "end", choices: [] }, b: { text: "bad", choices: [] } }, good: ["c"] };
  const win = grade.gradeExercise(item, ["a", "c"]);
  assert.equal(win.correct, true);
  assert.equal(win.score, 1);
  assert.deepEqual(win.path, ["a", "c"]);
  const lose = grade.gradeExercise(item, ["a", "b"]);
  assert.equal(lose.correct, false);
  assert.equal(lose.score, 0);
  assert.deepEqual(lose.path, ["a", "b"]);
});

test("scenario grading: multiple good endings", () => {
  const item = { kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] }, b: { text: "good1", choices: [] }, c: { text: "good2", choices: [] } }, good: ["b", "c"] };
  assert.equal(grade.gradeExercise(item, ["a", "b"]).correct, true);
  assert.equal(grade.gradeExercise(item, ["a", "c"]).correct, true);
  assert.equal(grade.gradeExercise(item, ["a", "a"]).correct, false);
});

test("scenario grading: path via string and object", () => {
  const item = { kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] }, b: { text: "end", choices: [] } }, good: ["b"] };
  assert.equal(grade.gradeExercise(item, "b").correct, true);
  assert.equal(grade.gradeExercise(item, { path: ["a", "b"] }).correct, true);
});

test("scenario grading: no key is ungraded", () => {
  assert.equal(grade.gradeExercise({ kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: [] }, ["a"]), null);
});

test("scenario grading: empty path is wrong", () => {
  const item = { kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] }, b: { text: "end", choices: [] } }, good: ["b"] };
  assert.equal(grade.gradeExercise(item, []), false);
  assert.equal(grade.gradeExercise(item, null), false);
});

// ---- strip ----

test("strip: no key field survives learner projection", () => {
  const cases = [
    { prompt: "p", kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"], alt: "img" },
    { prompt: "p", kind: "plot", grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 }, answer: [{ x: 1, y: 2 }], tolerance: 0.5 },
    { prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [{ text: "go", next: "b", feedback: "nice" }] }, b: { text: "end", choices: [] } }, good: ["b"] },
  ];
  for (const content of cases) {
    const normalized = exercise.normalize(content);
    assert.ok(normalized, `normalize failed for ${content.kind}`);
    const pub = share.publicItem({ type: "exercise", position: 0, content: normalized });
    const json = JSON.stringify(pub);
    assert.ok(!("answer" in pub.content), `answer leaked for ${content.kind}: ${json}`);
    assert.ok(!("tolerance" in pub.content), `tolerance leaked for ${content.kind}: ${json}`);
    assert.ok(!("good" in pub.content), `good leaked for ${content.kind}: ${json}`);
    assert.ok(!("goodEndings" in pub.content), `goodEndings leaked for ${content.kind}: ${json}`);
    // scenario feedback should not leak
    if (content.kind === "scenario") {
      assert.doesNotMatch(json, /nice/);
      for (const nid of Object.keys(pub.content.nodes)) {
        for (const ch of pub.content.nodes[nid].choices) assert.ok(!("feedback" in ch), `scenario choice feedback leaked for ${nid}`);
      }
    }
    // hotspot alt and regions survive, plot grid survives, scenario start and nodes survive
    if (content.kind === "hotspot") assert.ok(pub.content.regions, "regions must survive");
    if (content.kind === "plot") assert.ok(pub.content.grid, "grid must survive");
    if (content.kind === "scenario") {
      assert.ok(pub.content.start, "start must survive");
      assert.ok(pub.content.nodes, "nodes must survive");
    }
  }
});

test("strip: scenario keeps text paths but not feedback", () => {
  const n = exercise.normalize({ prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hello", choices: [{ text: "go", next: "b", feedback: "secret" }] }, b: { text: "end", choices: [] } }, good: ["b"] });
  assert.ok(n);
  assert.equal(n.nodes.a.choices[0].feedback, "secret");
  const pub = share.publicItem({ type: "exercise", position: 0, content: n });
  assert.ok(!("feedback" in pub.content.nodes.a.choices[0]));
  assert.ok(!("good" in pub.content));
});

test("publish gating: hps missing keys are counted", () => {
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: [] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "plot", grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 }, answer: [] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: [] } }]), 1);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "hotspot", regions: [{ id: "r1", shape: "rect", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }], answer: ["r1"] } }]), 0);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "plot", grid: { xmin: -10, xmax: 10, ymin: -10, ymax: 10, step: 1 }, answer: [{ x: 1, y: 2 }], tolerance: 0.5 } }]), 0);
  assert.equal(coursegen.missingAnswers([{ type: "exercise", content: { prompt: "p", kind: "scenario", start: "a", nodes: { a: { text: "hi", choices: [] } }, good: ["a"] } }]), 0);
});
