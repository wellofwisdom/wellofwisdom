// SPDX-License-Identifier: AGPL-3.0-or-later
// AI learning-path outline generator: turns subject + goals + time into a
// milestone plan. Dates are spread deterministically in JS (not by the AI)
// the AI designs the sequence, the server owns the calendar.
const ai = require("./ai");

const SYSTEM = `You are a master curriculum designer creating a long-term learning path (a semester or school year).
Respond with a single valid JSON object, nothing else.

Schema:
{
  "title": string (short, inspiring, e.g. "Algebra Adventures: A Year of X"),
  "description": string (2-3 sentences: the arc of the year),
  "milestones": [
    {
      "title": string (a coherent topic block, 1-2 weeks of work),
      "description": string (1-2 sentences: what they'll understand and be able to do),
      "projectIdea": string (one hands-on project that proves the skill: described, no URLs),
      "resourceHint": string (one free/known resource by NAME only, e.g. "Khan Academy: fractions unit" or "library books on Roman Britain". NEVER a URL)
    }
  ]
}

Rules:
- Sequenced from foundations to mastery. Each milestone builds on the last.
- Count: roughly one milestone per 1.5-2.5 weeks of the timeframe you are given.
- Projects and examples should honor any LENS and the learners' interests when given.
- Ground in any GOALS text. Never invent URLs.`;

async function generateOutline({ subject, goal, startDate, endDate, lens, learnerNotes }) {
  const weeks = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / (7 * 86400000)));
  const out = await ai.chatJson(
    "course-gen", // same quality tier as course generation
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          `Subject: ${subject}`,
          `Timeframe: ${startDate} to ${endDate} (about ${weeks} weeks)`,
          goal ? `Goals / what success looks like: ${goal}` : "",
          lens ? `LENS: weave this through everything, ${lens}` : "",
          learnerNotes ? `About the learners: ${learnerNotes}` : "",
          "Return only the JSON object.",
        ].filter(Boolean).join("\n"),
      },
    ],
    { maxTokens: 6000, temperature: 0.7, usage: { note: "plan-outline" } }
  );
  return normalizeOutline(out.json, weeks);
}

function normalizeOutline(raw, weeks) {
  const title = String(raw && raw.title ? raw.title : "").replace(/<[^>]*>/g, "").trim().slice(0, 160);
  const list = Array.isArray(raw && raw.milestones) ? raw.milestones : [];
  const expected = Math.min(36, Math.max(4, Math.round(weeks / 2)));
  const milestones = list
    .map((m) => {
      const t = String(m && m.title ? m.title : "").replace(/<[^>]*>/g, "").trim().slice(0, 160);
      if (!t) return null;
      return {
        title: t,
        description: String(m.description || "").replace(/<[^>]*>/g, "").trim().slice(0, 600) || null,
        project_ideas: [
          {
            title: "Project",
            description: String(m.projectIdea || "").replace(/<[^>]*>/g, "").trim().slice(0, 500),
          },
        ].filter((p) => p.description),
        resources: [
          {
            title: String(m.resourceHint || "").replace(/<[^>]*>/g, "").trim().slice(0, 200),
            url: null,
          },
        ].filter((r) => r.title),
      };
    })
    .filter(Boolean)
    .slice(0, Math.max(expected + 6, 8)); // allow a little over, guide trims
  if (!title || milestones.length < 3) throw new Error("ai_plan_unparseable");
  return { title, description: String(raw.description || "").trim().slice(0, 800) || null, milestones };
}

/** Deterministic: spread milestone target dates evenly across the term. */
function spreadDates(startDate, endDate, count) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = Math.max(1, end - start);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? start : start + Math.round((span * (i + 1)) / count);
    return new Date(t).toISOString().slice(0, 10);
  });
}

module.exports = { generateOutline, normalizeOutline, spreadDates };
