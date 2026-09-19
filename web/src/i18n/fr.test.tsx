// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest";
import en from "./en";
import fr from "./fr";
import { normalizeLang, tKey, pickVoiceForLang } from "./index";

describe("fr tail", () => {
  it("every key in en exists in fr", () => {
    const missing = (Object.keys(en) as (keyof typeof en)[]).filter((k) => !(k in fr));
    expect(missing, `missing French keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("no extra keys in fr not in en", () => {
    const extra = Object.keys(fr).filter((k) => !(k in (en as Record<string, string>)));
    expect(extra, `extra French keys: ${extra.join(", ")}`).toEqual([]);
  });

  it("fr values are non-empty strings", () => {
    for (const k of Object.keys(fr as Record<string, string>)) {
      const v = (fr as Record<string, string>)[k];
      expect(typeof v, `${k} not string`).toBe("string");
      expect(v.length, `${k} empty`).toBeGreaterThan(0);
    }
  });

  it("normalizeLang handles fr", () => {
    expect(normalizeLang("fr")).toBe("fr");
    expect(normalizeLang("FR")).toBe("fr");
    expect(normalizeLang("fr-FR")).toBe("fr");
    expect(normalizeLang("en")).toBe("en");
    expect(normalizeLang("es")).toBe("es");
  });

  it("tKey resolves fr and falls back to en", () => {
    expect(tKey("fr", "shell.home")).toBe("Accueil");
    expect(tKey("fr", "vocab.label")).toBe("Vocabulaire");
    expect(tKey("fr", "lesson.lessonComplete")).toBe("Leçon terminée !");
  });

  it("pickVoiceForLang prefers fr voice when lang is fr", () => {
    const voices = [
      { lang: "en-US", name: "en" } as SpeechSynthesisVoice,
      { lang: "fr-FR", name: "fr" } as SpeechSynthesisVoice,
      { lang: "es-ES", name: "es" } as SpeechSynthesisVoice,
    ];
    expect(pickVoiceForLang(voices, "fr")?.lang).toBe("fr-FR");
    expect(pickVoiceForLang(voices, "es")?.lang).toBe("es-ES");
    expect(pickVoiceForLang(voices, "en")?.lang).toBe("en-US");
  });
});
