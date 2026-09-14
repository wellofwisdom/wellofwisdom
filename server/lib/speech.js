// SPDX-License-Identifier: AGPL-3.0-or-later
// Speech normalizer. A child says "three quarters" and the grader compares
// digits, so the transcript has to become the string they would have typed.
// "three quarters" becomes 3/4, "one and a half" becomes 1 1/2, "negative
// five" becomes -5, "the second one" becomes choice 2. Fillers go ("um",
// "uh"), everything else passes through as said.
//
// Pure functions only: no I/O, no config, no provider, so the rules are
// testable without a microphone. This is the one place where spoken words
// become an answer.
//
// Nothing here decides a verdict. The transcript lands in the answer box and
// the learner confirms it before grading, so a mishearing is always visible.

// Words that carry no answer. "er" and "ah" are here because transcription
// inserts them on purpose. "like" and "well" are not, because they are also
// ordinary words in a written answer.
const FILLERS = new Set([
  "um", "umm", "ummm", "uh", "uhh", "uhhh", "er", "err", "erm", "ah", "ahh",
  "eh", "hmm", "hmmm", "mmm", "mm", "ahem",
]);

// Openers that mean "here comes the answer". Stripped only at the start, so a
// sentence that happens to contain them keeps them.
const OPENERS = [
  "the answer would be", "i think the answer is", "the answer is", "my answer is",
  "i think it's", "i think its", "i think it is", "i think", "i believe it's",
  "i believe", "it's", "it is", "that's", "that is", "the answer",
];

const UNIT = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const SCALES = { hundred: 100, thousand: 1000, million: 1000000 };

// Denominator words: "three quarters" is a numerator and one of these.
const FRACTION_WORDS = {
  half: 2, halves: 2, quarter: 4, quarters: 4, fourth: 4, fourths: 4,
  third: 3, thirds: 3, fifth: 5, fifths: 5, sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9,
  tenth: 10, tenths: 10, eleventh: 11, elevenths: 11, twelfth: 12,
  twelfths: 12, thirteenth: 13, thirteenths: 13, fourteenth: 14,
  fourteenths: 14, fifteenth: 15, fifteenths: 15, sixteenth: 16,
  sixteenths: 16, seventeenth: 17, seventeenths: 17, eighteenth: 18,
  eighteenths: 18, nineteenth: 19, nineteenths: 19, twentieth: 20,
  twentieths: 20,
};

// Ordinal words, for "the second one". -1 means the last choice.
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, last: -1,
};

// The syllables a lone letter name turns into in a transcript. The value is
// the choice position, so "be" is B, the second choice.
const LETTER_SOUNDS = { be: 1, bee: 1, see: 2, sea: 2, dee: 3 };

// Position words that introduce a choice: "option two", "number 3", "letter B".
const POSITION_WORDS = ["option", "choice", "answer", "number", "letter"];

const NUMBER_TOKEN = /-?\d+\s+\d+\s*\/\s*\d+|-?\d+\s*\/\s*\d+|-?\d+(?:\.\d+)?\s*%?/g;

function tidy(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

function isNumberWord(w) {
  return w in UNIT || w in TENS || w in SCALES;
}

function stripWord(w) {
  return String(w || "").replace(/[.,!?;:]+/g, "").toLowerCase();
}

/** True when the words at j read as a fraction: "half", "a quarter", "three quarters". */
function isFractionPhrase(toks, j) {
  if (toks[j] in FRACTION_WORDS) return true;
  if ((toks[j] === "a" || toks[j] === "an") && toks[j + 1] in FRACTION_WORDS) return true;
  return Boolean(isNumberWord(toks[j]) && toks[j + 1] in FRACTION_WORDS);
}

/**
 * The transcript as a readable sentence: filler words gone, spacing tidy.
 * Used for the "Heard" line and for text answers, where the words themselves
 * are the answer, so nothing else is changed.
 */
function cleanSpeech(raw) {
  let s = tidy(raw);
  if (!s) return "";
  return tidy(s.split(" ").filter((w) => !FILLERS.has(stripWord(w))).join(" "))
    .replace(/^[,;:.\s]+/, "")
    .replace(/\s+([,.!?;:])/g, "$1");
}

/**
 * Drop a leading "the answer is" / "I think it's". Only the answer types that
 * want a value, never a text answer: there the opener is the child's own
 * wording and stays.
 */
function stripOpener(s) {
  const text = tidy(s);
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const opener of OPENERS) {
    if (lower === opener) return "";
    if (lower.startsWith(`${opener} `) || lower.startsWith(`${opener},`) || lower.startsWith(`${opener}'s`)) {
      return tidy(text.slice(opener.length)).replace(/^[,;:.\s]+/, "");
    }
  }
  return text;
}

/** Split into lowercase words, punctuation kept as its own token. */
function tokenize(s) {
  return tidy(s)
    .toLowerCase()
    .replace(/([.,!?;:])/g, " $1 ")
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Read one value from number words starting at i.
 * Returns { text, next } or null when there is no number there.
 * Handles whole numbers ("two hundred thirty four"), decimals ("three point
 * one four"), fractions ("three quarters", "a half"), mixed numbers
 * ("one and a half"), the word "over" ("three over four") and percent.
 */
function readNumber(toks, i) {
  // "point five" without a whole part is 0.5.
  if (toks[i] === "point" && toks[i + 1] in UNIT && UNIT[toks[i + 1]] < 10) {
    let digits = "";
    let j = i + 1;
    while (j < toks.length && toks[j] in UNIT && UNIT[toks[j]] < 10) {
      digits += String(UNIT[toks[j]]);
      j++;
    }
    if (digits) return { text: `0.${digits}`, next: j };
  }

  // "a half" and "an eighth" are one half and one eighth.
  if ((toks[i] === "a" || toks[i] === "an") && toks[i + 1] in FRACTION_WORDS) {
    return { text: `1/${FRACTION_WORDS[toks[i + 1]]}`, next: i + 2 };
  }

  let value = 0;
  let cur = 0;
  let seen = false;
  let mixed = false;
  while (i < toks.length) {
    const w = toks[i];
    if (w in UNIT) { cur += UNIT[w]; seen = true; i++; }
    else if (w in TENS) { cur += TENS[w]; seen = true; i++; }
    else if (w in SCALES) { cur = (cur || 1) * SCALES[w]; value += cur; cur = 0; seen = true; i++; }
    else if (w === "and") {
      // "one hundred and five" joins a number; "one and a half" starts a
      // fraction, so the whole part ends here.
      if (isFractionPhrase(toks, i + 1)) { mixed = true; i++; break; }
      if (isNumberWord(toks[i + 1])) { i++; continue; }
      break;
    } else break;
  }
  if (!seen) return null;
  const whole = value + cur;

  // Decimal: "three point one four".
  if (toks[i] === "point" && toks[i + 1] in UNIT && UNIT[toks[i + 1]] < 10) {
    let digits = "";
    let j = i + 1;
    while (j < toks.length && toks[j] in UNIT && UNIT[toks[j]] < 10) {
      digits += String(UNIT[toks[j]]);
      j++;
    }
    if (digits) return { text: `${whole}.${digits}`, next: j };
  }

  // Mixed number: "one and a half", "two and three quarters".
  if (mixed) {
    if ((toks[i] === "a" || toks[i] === "an") && toks[i + 1] in FRACTION_WORDS) {
      return { text: `${whole} 1/${FRACTION_WORDS[toks[i + 1]]}`, next: i + 2 };
    }
    const one = toks[i] in UNIT ? UNIT[toks[i]] : toks[i] in TENS ? TENS[toks[i]] : null;
    if (one != null && toks[i + 1] in FRACTION_WORDS) {
      return { text: `${whole} ${one}/${FRACTION_WORDS[toks[i + 1]]}`, next: i + 2 };
    }
    return { text: String(whole), next: i };
  }

  // Plain fraction: "three quarters", "two thirds".
  if (toks[i] in FRACTION_WORDS) {
    return { text: `${whole}/${FRACTION_WORDS[toks[i]]}`, next: i + 1 };
  }

  // "three over four" is three quarters.
  if (toks[i] === "over" && isNumberWord(toks[i + 1])) {
    const denom = readNumber(toks, i + 1);
    if (denom && /^\d+$/.test(denom.text)) return { text: `${whole}/${denom.text}`, next: denom.next };
  }
  if (toks[i] === "percent" || (toks[i] === "per" && toks[i + 1] === "cent")) {
    return { text: `${whole}%`, next: toks[i] === "percent" ? i + 1 : i + 2 };
  }
  return { text: String(whole), next: i };
}

/**
 * Turn number words into digits, fractions and decimals. Words that are not
 * numbers pass through untouched, so "the cat sat on the mat" is unchanged.
 */
function spokenToNumbers(raw) {
  const s = tidy(raw);
  if (!s) return "";
  const toks = tokenize(s);
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const w = toks[i];
    // A sign word belongs to the number after it: "negative five" is -5.
    if (w === "negative" || w === "minus") {
      const signed = readNumber(toks, i + 1);
      if (signed) { out.push(`-${signed.text}`); i = signed.next; continue; }
      if (/^\d/.test(toks[i + 1] || "")) { out.push(`-${toks[i + 1]}`); i += 2; continue; }
    }
    const num = isNumberWord(w) || w === "a" || w === "an" || w === "point" ? readNumber(toks, i) : null;
    if (num) { out.push(num.text); i = num.next; continue; }
    // A fraction word with no numerator in front of it: "half" on its own is
    // 1/2, "a quarter" is 1/4. Only numeric answers come through here, so the
    // reading is safe enough and the learner still confirms the box.
    if (w in FRACTION_WORDS) { out.push(`1/${FRACTION_WORDS[w]}`); i++; continue; }
    out.push(w);
    i++;
  }
  return tidy(out.join(" "));
}

/**
 * The one number in a converted sentence, or null when there is none, when
 * there is more than one, or when the words around it carry meaning of their
 * own. "x equals three quarters" has to land as 3/4 in a numeric box, but
 * "not zero" must not land as 0, so only the neutral words a number can sit
 * inside are ignored.
 */
const NEUTRAL_WORDS = new Set([
  "", "is", "are", "was", "were", "equals", "equal", "to", "the", "a", "an",
  "x", "y", "z", "answer", "it", "that", "so", "my", "about", "approximately",
  "roughly", "i", "get",
]);

function extractNumber(converted) {
  const s = String(converted || "");
  const nums = s.match(NUMBER_TOKEN);
  if (!nums || nums.length !== 1) return null;
  const rest = tidy(s.replace(nums[0], " ").replace(/[=.,!?;:]/g, " "));
  const words = rest ? rest.toLowerCase().split(" ").filter(Boolean) : [];
  if (words.some((w) => !NEUTRAL_WORDS.has(w))) return null;
  return nums[0].replace(/\s+/g, " ").trim() || null;
}

/**
 * Map a spoken choice onto a zero based index into the choice list.
 * "B" is 1, "the second one" is 1, "option two" is 1, "the last one" is the
 * last index. Null when the words do not name a position.
 */
function choiceIndex(raw, count) {
  const n = Number(count) || 0;
  if (n < 1) return null;
  const t = tidy(raw).toLowerCase().replace(/[.,!?;:]+$/g, "");
  if (!t) return null;
  const allowed = (idx) => (Number.isInteger(idx) && idx >= 0 && idx < n ? idx : null);

  // A bare letter, with or without its introducer: "b", "option b", "be".
  const bare = t
    .replace(/^(?:the\s+)?(?:option|choice|answer|number|letter)\s+/, "")
    .replace(/^the\s+/, "");
  if (/^[a-h]$/.test(bare)) return allowed(bare.charCodeAt(0) - 97);
  if (bare in LETTER_SOUNDS) return allowed(LETTER_SOUNDS[bare]);

  // A position inside a sentence: "I pick option two", "the second one".
  const tokens = t.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (w in ORDINALS) {
      const ord = ORDINALS[w];
      return allowed(ord === -1 ? n - 1 : ord - 1);
    }
    const value = w in UNIT ? UNIT[w] : /^\d{1,2}$/.test(w) ? Number(w) : null;
    if (value != null && value >= 1 && value <= 26) {
      const prev = tokens[i - 1] || "";
      // Only with a position word in front, or when the number is the whole
      // utterance: otherwise "I have two cats" would pick choice 2.
      if (POSITION_WORDS.includes(prev) || tokens.length === 1) return allowed(value - 1);
    }
  }
  return null;
}

/**
 * Normalize one transcript for the answer type it is going into. kind
 * "numeric" gets digits and fractions, "mcq" also gets a choice index,
 * anything else is cleaned text. `transcript` is what the provider heard with
 * filler removed, so the learner can read it back before confirming.
 */
function normalizeForKind(raw, kind = "text", choiceCount = 0) {
  const transcript = cleanSpeech(raw);
  if (!transcript) return { kind: "text", text: "", transcript: "", choiceIndex: null };
  const answerWords = stripOpener(transcript);
  if (kind === "mcq") {
    return { kind: "mcq", text: transcript, transcript, choiceIndex: choiceIndex(answerWords, choiceCount) };
  }
  if (kind === "numeric") {
    const converted = spokenToNumbers(answerWords).replace(/[.,;:]+$/, "");
    const single = extractNumber(converted);
    // Nothing was converted, so keep the child's own capitalisation.
    const fallback = converted.toLowerCase() === answerWords.toLowerCase() ? answerWords : converted;
    return { kind: "numeric", text: single || fallback, transcript, choiceIndex: null };
  }
  return { kind: "text", text: transcript, transcript, choiceIndex: null };
}

/** The plain normalizer: filler out, whitespace tidy. */
function normalize(raw) {
  return cleanSpeech(raw);
}

module.exports = {
  normalize,
  normalizeForKind,
  cleanSpeech,
  spokenToNumbers,
  extractNumber,
  choiceIndex,
  FILLERS,
};
