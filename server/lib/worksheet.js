// SPDX-License-Identifier: AGPL-3.0-or-later
// Worksheet import: paste the text of any worksheet; the AI turns it into
// graded exercise items. Added to an existing course or a new one.
const ai = require("./ai");
const { normalizeItem } = require("./coursegen");

const SYSTEM = `You convert pasted worksheet text into machine-graded exercises.
Respond with ONE valid JSON object, nothing else:
{ "items": [ { "type": "exercise", "content": { "prompt", "kind", "choices", "answer", "explanation", "hint" } } ] }
Rules:
- One exercise per worksheet question, in order. Keep the original wording (lightly cleaned).
- kind: "mcq" if the worksheet shows options (choices: [{"id":"c1","text":...}...], answer = correct choice id);
  "numeric" if the answer is a number (answer = the number);
  "text" for written answers (answer = a model answer).
- Write a one-sentence kid-friendly explanation for each, and a hint that nudges without revealing.
- Skip instructions, headers, and page furniture. If the text is not a worksheet, return {"items":[]}.`;

async function importWorksheet(spec, userId, familyId) {
  const out = await ai.chatJson(
    "exercise-gen",
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Worksheet text:\n\n${String(spec.text || "").slice(0, 12000)}\n\nReturn only the JSON.` },
    ],
    { maxTokens: 6000, temperature: 0.3, usage: { familyId, note: `worksheet: ${spec.title}` } }
  );
  const raw = out.json && Array.isArray(out.json.items) ? out.json.items : [];
  const items = raw.map(normalizeItem).filter(Boolean).filter((i) => i.type === "exercise").slice(0, 40);
  if (!items.length) throw new Error("worksheet_unparseable: no questions found in that text");
  return { items, title: String(spec.title || "Imported worksheet").slice(0, 160) };
}

module.exports = { importWorksheet };
