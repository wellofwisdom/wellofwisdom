# Language v1 content prep (Spanish A1 first)

This is a preparation note only. No registry code is added here. When Well 19 lands, this document is the source to turn into real exercise kinds, server grading, learner review, and editor forms.

## Purpose

Spanish A1 first, then French and Latin, on the same Well of Wisdom platform. Studio gains a target language and CEFR level. Instructions stay in the learner's language. Content is in the target language. This file lists the new item kinds Language v1 will add, what each kind stores, and how it grades, before any file in server/lib/items/kinds or the web player is touched.

## Example course that already runs

`docs/examples/spanish-a1/course.wow-course.json` is a Spanish A1 course pack with four lessons, built only from kinds that already exist on main at 24b3953. It is ready to import and play today.

- Lesson 1 Hola, greetings and introductions, with match, categorize, order, multi, and a speaking prompt done as text plus aloud practice
- Lesson 2 En el aula, classroom and colors, with two listen prompts done as audio plus transcript, and mcq, multi, order, and categorize items after each
- Lesson 3 Mi familia y mi casa, family and home, with flashcard review, match, mcq, scenario dialogue, and two speaking plus ordering checks
- Lesson 4 Un dia en el mercado, graded reader and listening of the same story, with mcq, multi, categorize, text retell, and a short writing project

The pack uses no new kinds, no registry edits, and no migrations. It covers A1 vocabulary, listening prompts, speaking prompts, and a graded reader, exactly as the packet asked.

Future kinds below let the same lessons grade more exactly. For now the course uses text items for speaking prompts, audio items for listening, and flashcards for vocabulary, which is good enough for review on paper or out loud.

## Kinds already available and how they stand in

- `mcq` single choice with explanation and hints. Used for quick comprehension checks.
- `multi` several choices where more than one is right. Used to check listening.
- `order` put words or phrases in order. Used to build correct Spanish sentences word by word without free typing.
- `match` link Spanish to English. Used for vocabulary pairs.
- `categorize` sort cards into buckets. Used for friendly versus polite forms, and food versus people.
- `scenario` choose a path through a short dialogue. Used for polite neighbour chat. Grades by whether the final node is in the good set.
- `hotspot`, `plot` not used in this A1 pack, but available for later image and map tasks. Left alone for now.

Non exercise kinds used: `article`, `flashcards`, `audio` with a transcript, `figure`, `steps`, `project`. Flashcards carry the eight word sets a learner reviews. Audio items hold fixed listening clips as transcripts, so they play when TTS and audio uploads are added without changing the course shape.

## New kinds planned for Language v1 (not implemented)

Each sketch shows desired shapes, not final code. Names here are working names. Well 19 will confirm them.

### 1 vocab_card

A small vocabulary card for spaced review. Close to flashcards but one card at a time with a level.

Content shape:

```json
{
  "kind": "vocab_card",
  "lemma": "hola",
  "form": "hola",
  "gloss": "hello",
  "example": "Hola, me llamo Ana.",
  "exampleGloss": "Hello, my name is Ana.",
  "pos": "interjection",
  "level": "A1",
  "imagePrompt": "a friendly wave, soft watercolour, no text",
  "audioText": "hola",
  "alternatives": ["hello", "hi"]
}
```

Answer shape: learner sees `lemma` or a picture and types or picks `gloss` or `form`. For a type in answer, normalize case, trim, and accept `alternatives`. For a tap choice, answer is the id of the correct gloss.

Grading: exact match after lowercasing and stripping surrounding punctuation. One point when correct.

Notes: feeds the existing spaced review scheduler without change. `imagePrompt` is for paid generation only. `audioText` is the text to speak with TTS at play time.

### 2 listen_choice (listen and choose)

The learner hears audio once, then picks the matching text, image, or translation. Audio is passed as a local media URL or a `audioText` fallback for TTS.

Content shape:

```json
{
  "kind": "listen_choice",
  "prompt": "What did you hear? Pick the sentence you heard.",
  "audioText": "El libro es rojo.",
  "audioUrl": "/media/123",
  "choices": [
    { "id": "c1", "text": "El libro es rojo." },
    { "id": "c2", "text": "La silla es azul." },
    { "id": "c3", "text": "La mesa es verde." }
  ],
  "answer": "c1"
}
```

Answer shape: choice id such as `c1`. Single pick only.

Grading: 1 when the picked id matches `answer`, else 0.

### 3 listen_repeat (listen and repeat, STT with per word feedback)

The learner listens, then speaks. The server turns speech to text and checks it word by word against the expected Spanish text.

Content shape:

```json
{
  "kind": "listen_repeat",
  "prompt": "Listen and repeat: El libro es rojo.",
  "expected": "El libro es rojo.",
  "audioText": "El libro es rojo.",
  "audioUrl": "/media/123",
  "alternatives": ["El libro es rojo"],
  "hints": ["Say each word clearly: El - libro - es - rojo."]
}
```

Learner answer shape:

```json
{ "transcript": "el libro es rojo", "confidence": 0.92 }
```

Or a plain string when the client only has text. Confidence is kept but not used to pass or fail.

Content `explanation` shows the expected text and a gentle tip. `hints` are short nudges before speaking.

Grading: lower case both expected and transcript, strip punctuation, split into words, then count words that match in order. Score is `matchedWords / expectedWords`. `correct` is true when the score is 1. Feedback can list which words were off when STT includes per word detail. Punctuation and accents are ignored for A1.

### 4 cloze (fill the gap)

A sentence or short paragraph with one or more gaps. One word or short phrase per gap. Accents are normalized so `si` and `si` let local review pass, but `manana` versus `manana` is shown as a hint.

Content shape:

```json
{
  "kind": "cloze",
  "prompt": "Complete the sentence.",
  "text": "Me llamo {{1}} y vivo con mi {{2}}.",
  "blanks": [
    { "id": "1", "answer": "Ana", "alternatives": [] },
    { "id": "2", "answer": "familia", "alternatives": ["madre", "padre"] }
  ]
}
```

Learner answer shape:

```json
{ "1": "Ana", "2": "familia" }
```

Grading: each blank is checked after lowercasing, trimming, and accent folding for A1. `correct` when every blank matches. `score` is `correctBlanks / totalBlanks`.

### 5 translate (rubric graded with alternatives)

A short translation task between English and Spanish. Graded by exact alternatives first, then by a small rubric when no alternative matched, so a teacher can keep review steady.

Content shape:

```json
{
  "kind": "translate",
  "prompt": "Translate to Spanish: My name is Ana.",
  "direction": "en_to_es",
  "expected": "Me llamo Ana.",
  "alternatives": ["Me llamo Ana", "Soy Ana"],
  "rubric": "Names self with me llamo or soy, includes a name, spelling close enough for a friendly reader."
}
```

Learner answer shape: plain string, the translation.

Grading: normalize case and punctuation. If the answer matches `expected` or any `alternatives` exactly, `correct` is true and `score` is 1. Otherwise `correct` is false and grading returns `needsReview` true so the guide's rubric review can set the score. No AI grading in v1; the rubric is shown to the guide.

### 6 dialogue (tutor role play)

A short branching dialogue where the learner writes a reply at each turn and the tutor keeps them in the scene. Uses the existing tutor infrastructure with a stricter grade.

Content shape:

```json
{
  "kind": "dialogue",
  "prompt": "Greet your neighbour and answer where you live.",
  "scene": "You meet Sofia at the door. She says: Hola! Como te llamas?",
  "turns": 3,
  "goals": ["greet back", "give your name", "say where you live"],
  "goodEndings": ["used polite form", "asked a question back"]
}
```

Learner answer shape: list of turns, each a string.

```json
{ "turns": ["Hola, me llamo Ana. Y tu?", "Vivo con mi familia en la casa azul."] }
```

Grading: v1 keeps it simple. `correct` when the learner wrote at least `turns` replies and each reply is not empty after trimming. The tutor keeps chat feedback, but grading is only completeness, not style.

### 7 graded_reader (chapter at level with tap a word glosses)

A short reader at a CEFR level, with glosses a learner can tap. It is an article variant with level and glosses kept alongside the text, not a new exercise grading.

Content shape:

```json
{
  "kind": "graded_reader",
  "title": "Un dia en el mercado",
  "level": "A1",
  "body": "Buenos dias! Me llamo Lucia. Hoy es sabado...",
  "glosses": {
    "mercado": "market",
    "manzanas": "apples",
    "cuanto cuesta": "how much does it cost"
  }
}
```

Learner answer shape: none. Reading is followed by normal exercise items in the same lesson, whose grading proves comprehension.

Notes: generation rewrites a public domain chapter at the requested CEFR level and keeps the same glossing. Learner language tips stay in the learner's language. Later, pronunciation scoring can be added as a separate offline model and does not change these shapes.

## How the example course will move to the new kinds

When the registry is open, the four Spanish lessons will be edited in small passes:

- Flashcards for core vocabulary move to vocab_card items where spaced review matters, one card per teaching point
- Audio items that already carry a transcript gain a paired listen_choice or listen_repeat item after them, with the transcript as `audioText`
- Two sentence items where word order is taught move from `order` to `cloze` with blanks, where the blank expects the key word rather than a drag order
- The market reader stays an article plus a graded_reader note, and the comprehension checks stay as mcq and multi until cloze is ready

No migration is needed for these courses. All of them remain plain course JSON.

## Out of scope for this prep

STT provider wiring, TTS voice choice per target language, spaced review scheduling changes, French pack, Latin pack, and any change to grade or share. Those wait for their own well or for Well 19 to land.
