// SPDX-License-Identifier: AGPL-3.0-or-later
const { clean, str } = require("./common");

const MAX_NODES = 20;
const MAX_CHOICES = 4;
const MAX_GOOD = 8;

function normalizeNodes(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const ids = Object.keys(raw);
  if (!ids.length) return null;
  const out = {};
  for (const id of ids.slice(0, MAX_NODES)) {
    const n = raw[id];
    if (!n || typeof n !== "object") continue;
    const nid = String(id).trim().slice(0, 40);
    if (!nid) continue;
    const text = clean(n.text, 2000);
    if (!text) continue;
    const choicesRaw = Array.isArray(n.choices) ? n.choices : [];
    const choices = [];
    for (const ch of choicesRaw) {
      if (!ch || typeof ch !== "object") continue;
      const ct = clean(ch.text, 500);
      if (!ct) continue;
      const next = String(ch.next ?? "").trim().slice(0, 40);
      if (!next) continue;
      const c = { text: ct, next };
      const fb = str(ch.feedback, 1000).trim();
      if (fb) c.feedback = fb;
      choices.push(c);
      if (choices.length >= MAX_CHOICES) break;
    }
    out[nid] = { text, choices };
  }
  return Object.keys(out).length ? out : null;
}

function normalize(content) {
  const start = String(content.start ?? "").trim().slice(0, 40);
  if (!start) return null;
  const nodes = normalizeNodes(content.nodes);
  if (!nodes) return null;
  if (!nodes[start]) return null;
  // good endings are node ids that exist
  let good = null;
  if (Array.isArray(content.good) && content.good.length) {
    const filtered = content.good.map((v) => String(v ?? "").trim()).filter(Boolean).filter((id) => nodes[id] != null);
    if (filtered.length) good = [...new Set(filtered)].slice(0, MAX_GOOD);
  }
  // also accept content.goodEndings or content.answer alias
  if (!good && Array.isArray(content.goodEndings) && content.goodEndings.length) {
    const filtered = content.goodEndings.map((v) => String(v ?? "").trim()).filter(Boolean).filter((id) => nodes[id] != null);
    if (filtered.length) good = [...new Set(filtered)].slice(0, MAX_GOOD);
  }
  if (!good || !good.length) return null;
  // validate that every choice next points to a known node
  for (const nid of Object.keys(nodes)) {
    for (const ch of nodes[nid].choices) {
      if (!nodes[ch.next]) return null;
    }
  }
  return { prompt: clean(content.prompt, 2000) || "Choose your path", kind: "scenario", start, nodes, good };
}

function problem(content) {
  if (!content || typeof content !== "object") return "content_required";
  const start = String(content.start ?? "").trim();
  if (!start) return "start_required";
  const nodes = content.nodes;
  if (!nodes || typeof nodes !== "object" || Array.isArray(nodes) || !Object.keys(nodes).length) return "nodes_required";
  if (Object.keys(nodes).length > MAX_NODES) return "too_many_nodes";
  if (!nodes[start]) return "start_invalid";
  for (const [nid, n] of Object.entries(nodes)) {
    if (!n || typeof n !== "object") return "node_invalid";
    if (!clean(n.text, 2000)) return "node_text_required";
    if (n.choices != null && !Array.isArray(n.choices)) return "choices_invalid";
    const cs = Array.isArray(n.choices) ? n.choices : [];
    if (cs.length > MAX_CHOICES) return "too_many_choices";
    for (const ch of cs) {
      if (!ch || typeof ch !== "object" || !clean(ch.text, 500)) return "choice_text_required";
      const nxt = String(ch.next ?? "").trim();
      if (!nxt) return "choice_next_required";
      if (!nodes[nxt]) return "choice_next_invalid";
    }
  }
  const goodRaw = Array.isArray(content.good) ? content.good : Array.isArray(content.goodEndings) ? content.goodEndings : null;
  if (!goodRaw || !goodRaw.length) return "good_required";
  if (goodRaw.length > MAX_GOOD) return "too_many_good";
  for (const id of goodRaw) {
    const s = String(id ?? "").trim();
    if (!s) return "good_invalid";
    if (!nodes[s]) return "good_invalid";
  }
  if ([...new Set(goodRaw.map((v) => String(v).trim()))].length !== goodRaw.length) return "good_duplicate";
  return null;
}

function strip(content) {
  const out = { prompt: content.prompt, kind: "scenario", start: content.start, nodes: {} };
  const nodes = content.nodes || {};
  for (const [id, n] of Object.entries(nodes)) {
    out.nodes[id] = { text: n.text, choices: (n.choices || []).map((c) => ({ text: c.text, next: c.next })) };
  }
  return out;
}

function grade(item, learnerAnswer) {
  const nodes = item.nodes && typeof item.nodes === "object" ? item.nodes : null;
  const good = Array.isArray(item.good) ? item.good : [];
  if (!nodes || !good.length) return null;
  const goodSet = new Set(good.map((v) => String(v)));
  // learnerAnswer is path of node ids: e.g. ["start","a","good_end"] or the final node id
  let path = [];
  if (Array.isArray(learnerAnswer)) path = learnerAnswer.map((v) => String(v ?? "").trim()).filter(Boolean);
  else if (typeof learnerAnswer === "string" && learnerAnswer.trim()) path = [learnerAnswer.trim()];
  else if (learnerAnswer && typeof learnerAnswer === "object" && Array.isArray(learnerAnswer.path)) path = learnerAnswer.path.map((v) => String(v ?? "").trim()).filter(Boolean);
  else return false;
  if (!path.length) return false;
  const final = path[path.length - 1];
  const correct = goodSet.has(final);
  return { correct, score: correct ? 1 : 0, path };
}

module.exports = { kind: "scenario", normalize, problem, strip, grade, MAX_NODES, MAX_CHOICES, MAX_GOOD };
