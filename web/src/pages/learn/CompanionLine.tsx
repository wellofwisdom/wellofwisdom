// SPDX-License-Identifier: AGPL-3.0-or-later
// CompanionLine: a one-line reaction from the crew for flavor. Picks the
// first approved character with a name and turns it into a tiny
// encouragement tied to the chapter title. No API, no TTS cost on render:
// narration stays with NarratorButton. Text only, only shows when there
// is a crew member to speak.
interface CharacterForLine {
  name: string;
  approved: boolean;
}

interface Props {
  chapterTitle: string;
  characters: CharacterForLine[];
}

const LINE_TEMPLATES = [
  (name: string) => `${name} whispers: we have got this.`,
  (name: string) => `${name} nods toward the path ahead.`,
  (name: string) => `${name} says: one step at a time.`,
  (name: string) => `${name} grins: ready when you are.`,
];

function pickLine(name: string, chapterTitle: string): string {
  const key = String(chapterTitle).trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const idx = h % LINE_TEMPLATES.length;
  return LINE_TEMPLATES[idx](name);
}

export default function CompanionLine({ chapterTitle, characters }: Props) {
  const speaker = (characters || []).find((c) => c.approved && c.name && String(c.name).trim());
  if (!speaker) return null;
  const line = pickLine(String(speaker.name).trim(), chapterTitle);
  return (
    <p className="companionline muted small" aria-label={`Companion: ${line}`}>
      <span aria-hidden="true">💬 </span>{line}
    </p>
  );
}
