// SPDX-License-Identifier: AGPL-3.0-or-later
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const cg = require("./coursegen");

const mcq = (over = {}) => ({
  type: "exercise",
  content: {
    kind: "mcq",
    prompt: "Pick one",
    choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }, { id: "c3", text: "C" }],
    answer: "c2",
    ...over,
  },
});

test("an inequality survives the normalizer, which it did not before", () => {
  const out = cg.normalizeItem(mcq({
    prompt: "Which is bigger: 3 < 5 or 7 > 4?",
    choices: [{ id: "c1", text: "x < y" }, { id: "c2", text: "$a<b$ and $c>d$" }],
    answer: "c1",
  }));
  assert.equal(out.content.prompt, "Which is bigger: 3 < 5 or 7 > 4?");
  assert.equal(out.content.choices[0].text, "x < y");
  assert.equal(out.content.choices[1].text, "$a<b$ and $c>d$");
});

test("a real tag a model wrapped round a word is still stripped", () => {
  const out = cg.normalizeItem(mcq({ prompt: "Is <b>this</b> <span class=\"x\">bold</span>?<br/>" }));
  assert.equal(out.content.prompt, "Is this bold?");
});

test("the declared length limits now actually apply", () => {
  const out = cg.normalizeItem({ type: "project", content: { title: "t".repeat(900), description: "d" } });
  assert.equal(out.content.title.length, 300);
});

test("itemProblem: a well-formed edit of every type passes", () => {
  assert.equal(cg.itemProblem(mcq()), null);
  assert.equal(cg.itemProblem({ type: "exercise", content: { kind: "numeric", prompt: "2+2", answer: "4" } }), null);
  assert.equal(cg.itemProblem({ type: "exercise", content: { kind: "text", prompt: "Why?", answer: "Because" } }), null);
  assert.equal(cg.itemProblem({ type: "article", content: { title: "", body: "Hello" } }), null);
  assert.equal(cg.itemProblem({ type: "project", content: { title: "Build", description: "A bridge" } }), null);
  assert.equal(cg.itemProblem({ type: "video", content: { uploadId: 7, questions: [] } }), null);
});

test("itemProblem: blanking out a required field is refused by name", () => {
  assert.equal(cg.itemProblem({ type: "article", content: { body: "  " } }), "body_required");
  assert.equal(cg.itemProblem(mcq({ prompt: "" })), "prompt_required");
  assert.equal(cg.itemProblem({ type: "exercise", content: { kind: "text", prompt: "Why?", answer: "" } }), "answer_required");
  assert.equal(cg.itemProblem({ type: "exercise", content: { kind: "numeric", prompt: "2+2", answer: "" } }), "answer_required");
  assert.equal(cg.itemProblem({ type: "project", content: { title: "", description: "x" } }), "title_required");
  assert.equal(cg.itemProblem({ type: "project", content: { title: "x", description: "" } }), "description_required");
  assert.equal(cg.itemProblem({ type: "video", content: { title: "No source" } }), "video_source_required");
});

test("itemProblem: a sixth choice is refused rather than dropped", () => {
  const six = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `c${n}`, text: `Choice ${n}` }));
  assert.equal(cg.itemProblem(mcq({ choices: six, answer: "c6" })), "too_many_choices");
  // What the normalizer alone would have done: kept five and quietly moved the
  // answer key to choice one. That is the loss this check exists to stop.
  assert.equal(cg.normalizeItem(mcq({ choices: six, answer: "c6" })).content.answer, "c1");
});

test("itemProblem: an answer that would silently move is refused", () => {
  // A blank line above the answer: after renumbering, "c3" would be the wrong choice.
  const withBlank = [{ id: "c1", text: "A" }, { id: "c2", text: "" }, { id: "c3", text: "C" }];
  assert.equal(cg.itemProblem(mcq({ choices: withBlank, answer: "c3" })), "answer_invalid");
  assert.equal(cg.itemProblem(mcq({ answer: "c9" })), "answer_invalid");
  // Ids that were never c1..cN are renumbered too, so the key would move.
  const lettered = [{ id: "a", text: "A" }, { id: "b", text: "B" }];
  assert.equal(cg.itemProblem(mcq({ choices: lettered, answer: "b" })), "answer_invalid");
});

test("itemProblem: answers the normalizer maps correctly are accepted", () => {
  assert.equal(cg.itemProblem(mcq({ answer: "B" })), null, "by text");
  const noIds = [{ text: "A" }, { text: "B" }];
  assert.equal(cg.itemProblem(mcq({ choices: noIds, answer: "c2" })), null, "by position");
  assert.equal(cg.normalizeItem(mcq({ choices: noIds, answer: "c2" })).content.answer, "c2");
});

test("itemProblem: a fifth video question is refused rather than dropped", () => {
  const q = { prompt: "What?", choices: [{ id: "c1", text: "a" }, { id: "c2", text: "b" }], answer: "c1" };
  const content = { youtubeId: "dQw4w9WgXcQ", questions: [q, q, q, q, q] };
  assert.equal(cg.itemProblem({ type: "video", content }), "too_many_questions");
  assert.equal(cg.itemProblem({ type: "video", content: { ...content, questions: [q, q, q, q] } }), null);
  assert.equal(cg.itemProblem({ type: "video", content: { ...content, questions: [{ ...q, prompt: "" }] } }), "question_incomplete");
});

test("itemProblem: an unknown type or no content is refused", () => {
  assert.equal(cg.itemProblem({ type: "hologram", content: {} }), "type_invalid");
  assert.equal(cg.itemProblem({ type: "article" }), "content_required");
  assert.equal(cg.itemProblem(null), "content_required");
});

test("a pasted YouTube URL in the editor is stored as the id, not the URL", () => {
  const out = cg.normalizeItem({ type: "video", content: { youtubeId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
  assert.equal(out.content.youtubeId, "dQw4w9WgXcQ");
});

// The edit route, asserted from the source: it must cross the same boundary
// as every other way an item is made.
const routeSrc = fs.readFileSync(path.join(__dirname, "..", "routes", "courses.js"), "utf8");

test("the item edit route checks, normalizes and stores only the clean content", () => {
  const start = routeSrc.indexOf('router.patch("/items/:itemId"');
  assert.ok(start > 0, "the edit route exists");
  const body = routeSrc.slice(start, routeSrc.indexOf("\n});", start));
  assert.match(body, /requirePerm\("edit_course"\)/);
  assert.match(body, /itemProblem\(\{ type, content \}\)/);
  assert.match(body, /normalizeItem\(\{ type, content \}\)/);
  assert.match(body, /JSON\.stringify\(clean\.content\)/, "only the normalized content is written");
  assert.ok(!/JSON\.stringify\(content\)/.test(body), "the raw request body must never be stored");
  assert.match(body, /from uploads where id = \$1 and family_id = \$2/, "an upload reference is family-checked");
});
