// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import en from "./en";
import es from "./es";

describe("i18n", () => {
  it("every key in en exists in es", () => {
    const missing = (Object.keys(en) as (keyof typeof en)[]).filter((k) => !(k in es));
    expect(missing, `missing Spanish keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("no extra keys in es that are not in en", () => {
    const extra = Object.keys(es).filter((k) => !(k in (en as Record<string, string>)));
    expect(extra, `extra Spanish keys not in English: ${extra.join(", ")}`).toEqual([]);
  });

  it("en and es values are non-empty strings", () => {
    for (const k of Object.keys(en)) {
      const v = (en as Record<string, string>)[k];
      expect(typeof v, k + " not a string").toBe("string");
      expect((v as string).length, k + " empty").toBeGreaterThan(0);
    }
    for (const k of Object.keys(es as Record<string, string>)) {
      const v = (es as Record<string, string>)[k];
      expect(typeof v, k + " (es) not a string").toBe("string");
      expect((v as string).length, k + " (es) empty").toBeGreaterThan(0);
    }
  });

  it("no JSX text node in translated learn files is a bare English string", async () => {
    const allowlist = new Set([
      "Well of Wisdom",
      "Well of Wisdom app",
    ]);
    const src = await import("node:fs").then((m) => (m as { default: typeof import("node:fs") }).default ?? (m as unknown as typeof import("node:fs")));
    const path = await import("node:path").then((m) => (m as { default: typeof import("node:path") }).default ?? (m as unknown as typeof import("node:path")));
    const { fileURLToPath } = await import("node:url");
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../pages/learn");
    const entries = src.readdirSync(dir);
    const violations: string[] = [];
    for (const entry of entries) {
      if (entry === "LessonPlayer.tsx") continue;
      if (entry === "learn.smoke.test.tsx") continue;
      const full = path.join(dir, entry);
      const stat = src.statSync(full);
      if (stat.isDirectory()) continue;
      if (!entry.endsWith(".tsx")) continue;
      const text = src.readFileSync(full, "utf8");
      const re = />\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw = m[1].trim();
        if (!raw) continue;
        if (allowlist.has(raw)) continue;
        const start = m.index;
        const before = text.slice(Math.max(0, start - 200), start);
        const lineStart = before.lastIndexOf("\n");
        const snippetStart = lineStart === -1 ? 0 : lineStart + 1;
        const lineEnd = text.indexOf("\n", m.index + m[0].length);
        const snippetEnd = lineEnd === -1 ? text.length : lineEnd;
        const lineSnippet = text.slice(snippetStart, snippetEnd).trim();
        if (lineSnippet.includes("t(") || lineSnippet.includes("t`")) continue;
        if (/^[A-Za-z]{1,3}$/.test(raw)) continue;
        violations.push(`${entry}:${raw} :: ${lineSnippet.slice(0, 120)}`);
      }
    }
    expect(violations, `bare English JSX text found in learn files (not wrapped in {expression}):\n${violations.join("\n")}`).toEqual([]);
  });
});
