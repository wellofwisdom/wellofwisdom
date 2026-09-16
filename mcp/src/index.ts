// SPDX-License-Identifier: AGPL-3.0-or-later
// Well of Wisdom MCP server (stdio). Reads WOW_URL and WOW_API_TOKEN from env.
// Tools: list_courses, get_course, import_course_package, generate_course, list_learners,
// get_learner_progress, list_open_courses.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const WOW_URL = (process.env.WOW_URL || "http://localhost:3000").replace(/\/$/, "");
const WOW_TOKEN = String(process.env.WOW_API_TOKEN || "").trim();

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (WOW_TOKEN) h["authorization"] = `Bearer ${WOW_TOKEN}`;
  return h;
}

async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
  const url = path.startsWith("http") ? path : `${WOW_URL}${path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: authHeaders(),
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  if (!res.ok) {
    const code = (json as { error?: string } | null)?.error || `http_${res.status}`;
    throw new Error(`${code}: ${text.slice(0, 400)}`);
  }
  return json;
}

const TOOLS = [
  {
    name: "list_courses",
    description: "List courses in your family",
    inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_course",
    description: "Get a course tree by id",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "number" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "import_course_package",
    description: "Import a wellofwisdom-course package JSON into your family",
    inputSchema: {
      type: "object" as const,
      properties: { course: { type: "object" } },
      required: ["course"],
      additionalProperties: false,
    },
  },
  {
    name: "generate_course",
    description: "Start course generation. Returns job id then polls until done. Pass topic and optional learnerId, lens, gradeLevel, notes",
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: { type: "string" },
        learnerId: { type: "number" },
        lens: { type: "string" },
        gradeLevel: { type: "number" },
        notes: { type: "string" },
      },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "list_learners",
    description: "List learners in your family",
    inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
  },
  {
    name: "get_learner_progress",
    description: "Get progress overview (same shape as GET /api/progress filtered to one learner)",
    inputSchema: {
      type: "object" as const,
      properties: { learnerId: { type: "number" } },
      required: ["learnerId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_open_courses",
    description: "List published open courses on any instance (no auth needed). Optionally pass url for another instance.",
    inputSchema: {
      type: "object" as const,
      properties: { url: { type: "string" } },
      additionalProperties: false,
    },
  },
];

async function main() {
  const server = new Server({ name: "wellofwisdom", version: "0.0.1" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args || {}) as Record<string, unknown>;
    try {
      if (name === "list_courses") {
        const data = await api("/api/courses") as { courses: unknown[] };
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      if (name === "get_course") {
        const data = await api(`/api/courses/${Number(a.id)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      if (name === "import_course_package") {
        const data = await api("/api/courses/import", { method: "POST", body: a.course });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      if (name === "generate_course") {
        const started = await api("/api/courses/generate", {
          method: "POST",
          body: { topic: a.topic, learnerId: a.learnerId, lens: a.lens, gradeLevel: a.gradeLevel, notes: a.notes },
        }) as { jobId: number };
        const jobId = started.jobId;
        // Poll for up to 5 minutes
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const j = await api(`/api/courses/jobs/${jobId}`) as { job: { status: string; result?: unknown; error?: string } };
          if (j.job.status === "done" || j.job.status === "error") {
            return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
          }
        }
        return { content: [{ type: "text", text: JSON.stringify({ jobId, note: "still running, check GET /api/courses/jobs/" + jobId }, null, 2) }] };
      }
      if (name === "list_learners") {
        const data = await api("/api/family/learners");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      if (name === "get_learner_progress") {
        const data = await api("/api/progress") as { learners: { id: number }[] };
        const found = (data.learners || []).find((l) => Number(l.id) === Number(a.learnerId));
        return { content: [{ type: "text", text: JSON.stringify(found || { error: "not_found" }, null, 2) }] };
      }
      if (name === "list_open_courses") {
        const base = String(a.url || WOW_URL).replace(/\/$/, "");
        const url = `${base}/api/public/courses`;
        const res = await fetch(url);
        const text = await res.text();
        return { content: [{ type: "text", text }] };
      }
      throw new Error(`unknown tool ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
