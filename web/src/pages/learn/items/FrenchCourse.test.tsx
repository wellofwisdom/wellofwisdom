// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";

describe("French A1 polished course", () => {
  async function loadPkg(): Promise<{ format: string; license: string; units: { lessons: { title: string; items: unknown[] }[] }[] }> {
    const fs = await import("node:fs").then((m) => (m as unknown as { default: typeof import("node:fs") }).default ?? (m as unknown as typeof import("node:fs")));
    const path = await import("node:path").then((m) => (m as unknown as { default: typeof import("node:path") }).default ?? (m as unknown as typeof import("node:path")));
    const candidates = [
      path.resolve(process.cwd(), "docs/examples/french-a1/course.wow-course.json"),
      path.resolve(process.cwd(), "..", "docs/examples/french-a1/course.wow-course.json"),
    ];
    let f: string | null = null;
    for (const c of candidates) if (fs.existsSync(c)) { f = c; break; }
    if (!f) throw new Error(`missing French course at ${candidates.join(" or ")}`);
    const raw = fs.readFileSync(f, "utf8");
    return JSON.parse(raw) as { format: string; license: string; units: { lessons: { title: string; items: unknown[] }[] }[] };
  }

  it("exists and parses", async () => {
    const pkg = await loadPkg();
    expect(pkg.format).toBe("wellofwisdom-course");
    expect(pkg.license).toBe("CC-BY-4.0");
  });

  it("has 2 to 3 lessons with 5 to 6 items each", async () => {
    const pkg = await loadPkg() as { units: { lessons: { title: string; items: unknown[] }[] }[] };
    const lessons = pkg.units.flatMap((u) => u.lessons);
    expect(lessons.length).toBeGreaterThanOrEqual(2);
    expect(lessons.length).toBeLessThanOrEqual(3);
    for (const l of lessons) {
      const n = (l as { items: unknown[] }).items.length;
      expect(n, `lesson "${(l as { title: string }).title}" has ${n} items`).toBeGreaterThanOrEqual(5);
      expect(n, `lesson "${(l as { title: string }).title}" has ${n} items`).toBeLessThanOrEqual(6);
      expect((l as { title: string }).title.trim().length).toBeGreaterThan(0);
    }
  });

  it("contains at least one French translate or vocab item", async () => {
    const pkg = await loadPkg() as { units: { lessons: { items: { type: string; content: { kind?: string } }[] }[] }[] };
    const lessons = pkg.units.flatMap((u) => u.lessons);
    const allItems = lessons.flatMap((l: { items: { type: string; content: { kind?: string } }[] }) => l.items);
    const translate = allItems.filter((it: { content: { kind?: string } }) => it.content.kind === "translate");
    const vocab = allItems.filter((it: { content: { kind?: string } }) => it.content.kind === "vocab_card");
    expect(translate.length + vocab.length).toBeGreaterThanOrEqual(1);
    const questions = allItems.filter((it: { type: string }) => it.type === "exercise").length;
    expect(questions).toBeGreaterThanOrEqual(5);
  });
});
