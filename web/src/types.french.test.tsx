// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { isFrenchDirection } from "./types";

describe("French type helper", () => {
  it("isFrenchDirection matches en_to_fr and fr_to_en", () => {
    expect(isFrenchDirection("en_to_fr")).toBe(true);
    expect(isFrenchDirection("fr_to_en")).toBe(true);
  });

  it("isFrenchDirection false for Spanish directions and empty", () => {
    expect(isFrenchDirection("en_to_es")).toBe(false);
    expect(isFrenchDirection("es_to_en")).toBe(false);
    expect(isFrenchDirection("")).toBe(false);
    expect(isFrenchDirection(null)).toBe(false);
    expect(isFrenchDirection(undefined)).toBe(false);
  });
});
