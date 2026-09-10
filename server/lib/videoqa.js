// SPDX-License-Identifier: AGPL-3.0-or-later
// Comprehension questions anchored to a moment in the video.
//
// Khan has fixed videos with fixed questions. A family's video is whatever they
// found or recorded, so the questions have to be written for it. The caption
// track is already on the upload (migration 022), which means the transcript is
// sitting there with timings on it: enough to ask about a specific moment and,
// when the answer is wrong, to send the learner back to the ten seconds that
// explain it rather than to the top of a twenty minute video.
//
// The parsing is pure and tested, the model's output crosses a normalizer, and
// every atSec is clamped into the video: a question pointing past the end would
// scrub a learner into blackness.
const ai = require("./ai");

const MAX_QUESTIONS = 4;
// How far before the answer to drop the learner back in. Long enough to carry
// the sentence that sets it up, short enough not to feel like a re-watch.
const REWIND_SEC = 10;

function clean(s, max) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
}

/** "00:01:02.500" or "01:02.500" to seconds. Returns null when it is not a
 *  timestamp, which is how a cue line is told apart from body text. */
function tsToSec(stamp) {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(stamp || "").trim());
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = Number((m[4] || "0").padEnd(3, "0"));
  if (min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec + ms / 1000;
}

function secToClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** WebVTT to cues. Tolerant on purpose: the track may have been typed by a
 *  guide, exported by a tool, or written by our own STT pass, and a stray
 *  header block or cue id must not lose the rest of the file. */
function parseVtt(text) {
  const t = String(text == null ? "" : text)
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n");
  const cues = [];
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at === -1) continue; // WEBVTT header, NOTE, STYLE: no timings, no cue
    const [rawStart, rawEnd] = lines[at].split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const start = tsToSec(rawStart);
    if (start === null) continue;
    const body = lines
      .slice(at + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "") // inline karaoke and styling tags
      .replace(/\s+/g, " ")
      .trim();
    if (!body) continue;
    cues.push({ start, end: tsToSec(rawEnd) ?? start, text: body });
  }
  return cues;
}

/** Cues to a transcript the model can point at: one line per chunk, stamped.
 *  Cues are merged up to `groupSec` so a per-word STT track does not arrive as
 *  three thousand one-word lines. */
function transcriptFrom(cues, { groupSec = 15, maxChars = 14000 } = {}) {
  const lines = [];
  let bucket = null;
  for (const c of cues || []) {
    if (!bucket || c.start - bucket.start >= groupSec) {
      bucket = { start: c.start, text: c.text };
      lines.push(bucket);
    } else {
      bucket.text = `${bucket.text} ${c.text}`.trim();
    }
  }
  let out = "";
  for (const l of lines) {
    const next = `[${secToClock(l.start)}] ${l.text}\n`;
    if (out.length + next.length > maxChars) break;
    out += next;
  }
  return out.trim();
}

/** The last moment the transcript covers, which is the ceiling for an anchor
 *  when we do not know the video's duration. */
function transcriptEnd(cues) {
  let last = 0;
  for (const c of cues || []) last = Math.max(last, c.end || c.start || 0);
  return Math.round(last);
}

const SYSTEM =
  "You write comprehension questions about a video, for a young learner who has just watched it. " +
  "You are given the transcript with timestamps. " +
  "Every question must be answerable FROM THE VIDEO and from nothing else: no outside knowledge, no " +
  "guessing from the wording. Ask about what was said, shown, explained or concluded. " +
  "Anchor each question with atSec: the moment in the video where the answer is actually given, in " +
  "seconds. Take it from the timestamps you were given, and never point past the end of the transcript. " +
  "Write exactly one clearly correct choice and two or three wrong ones that a learner who half-watched " +
  "would genuinely consider. No trick questions, no 'all of the above', no choices that are jokes. " +
  "Never mention the transcript, the timestamps or the word 'video' in the prompt itself. " +
  'Respond with ONLY a JSON object: {"questions":[{"prompt":string,"choices":[string,string,string],' +
  '"answerIndex":number,"atSec":number}]}. At most ' + MAX_QUESTIONS + " questions, in the order they " +
  "arise in the video.";

function buildMessages({ title, transcript, gradeLevel, count }) {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        video: clean(title, 200) || "a lesson video",
        learnerGradeLevel: gradeLevel || null,
        howMany: Math.max(1, Math.min(MAX_QUESTIONS, Number(count) || MAX_QUESTIONS)),
        transcript,
      }),
    },
  ];
}

/** Trust boundary. Produces the SAME question shape the course generator makes
 *  (prompt, choices with ids, answer id) plus atSec, so a drafted question is
 *  an ordinary video question that the player, the exporter and the grader all
 *  already understand. An anchor outside the video is clamped, never dropped:
 *  the question is still worth asking, it just rewinds to a sane place. */
function normalizeQuestions(raw, { endSec = 0 } = {}) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(obj.questions) ? obj.questions : Array.isArray(obj) ? obj : [];
  const ceiling = Math.max(0, Math.round(Number(endSec) || 0));
  const out = [];
  for (const q of list.slice(0, MAX_QUESTIONS)) {
    const prompt = clean(q && q.prompt, 500);
    const choices = (Array.isArray(q && q.choices) ? q.choices : [])
      .map((c) => clean(typeof c === "string" ? c : c && c.text, 200))
      .filter(Boolean)
      .slice(0, 5)
      .map((text, i) => ({ id: `c${i + 1}`, text }));
    if (!prompt || choices.length < 2) continue;
    const idx = Number.isInteger(q && q.answerIndex) ? q.answerIndex : 0;
    const answer = choices[Math.max(0, Math.min(choices.length - 1, idx))].id;
    const item = { prompt, choices, answer };
    const at = Number(q && q.atSec);
    if (Number.isFinite(at) && at >= 0) {
      item.atSec = ceiling ? Math.min(Math.round(at), ceiling) : Math.round(at);
    }
    out.push(item);
  }
  return out;
}

/** Where to put the play head so the learner hears the answer explained,
 *  rather than landing on the sentence after it. */
function rewindTo(atSec) {
  return Math.max(0, Math.round(Number(atSec) || 0) - REWIND_SEC);
}

/** Draft comprehension questions from a caption track. Returns
 *  { questions, note? }. note "no_transcript" means the track had no usable
 *  cues, and no AI call was made. */
async function draftQuestions({ vtt, title, gradeLevel, count, familyId }) {
  const cues = parseVtt(vtt);
  const transcript = transcriptFrom(cues);
  if (!transcript || transcript.length < 120) return { questions: [], note: "no_transcript" };
  const out = await ai.chatJson("exercise-gen", buildMessages({ title, transcript, gradeLevel, count }), {
    maxTokens: 1400,
    temperature: 0.5,
    usage: { familyId, note: "video questions" },
  });
  return { questions: normalizeQuestions(out.json, { endSec: transcriptEnd(cues) }) };
}

module.exports = {
  MAX_QUESTIONS, REWIND_SEC, SYSTEM,
  tsToSec, secToClock, parseVtt, transcriptFrom, transcriptEnd,
  buildMessages, normalizeQuestions, rewindTo, draftQuestions,
};
