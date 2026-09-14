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
      const v = (en as Record<string,string>)[k];
      expect(typeof v, k + " not a string").toBe("string");
      expect((v as string).length, k + " empty").toBeGreaterThan(0);
    }
    for (const k of Object.keys(es as Record<string,string>)) {
      const v = (es as Record<string,string>)[k];
      expect(typeof v, k + " (es) not a string").toBe("string");
      expect((v as string).length, k + " (es) empty").toBeGreaterThan(0);
    }
  });
});
