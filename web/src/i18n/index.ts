// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />
import { createContext, useCallback, useContext, useEffect } from "react";
import en, { type TranslationKey } from "./en";
import es from "./es";

export type Lang = "en" | "es";
export type { TranslationKey };

const dictionaries: Record<Lang, Record<TranslationKey, string>> = {
  en: en as Record<TranslationKey, string>,
  es,
};

const warned = new Set<string>();

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? `{${k}}` : String(v);
  });
}

export function normalizeLang(raw: unknown): Lang {
  const s = String(raw || "").trim().toLowerCase().slice(0, 2);
  if (s === "es") return "es";
  return "en";
}

export function tKey(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[lang] || dictionaries.en;
  let template = dict[key];
  if (template == null) {
    if (import.meta.env.DEV && !warned.has(`${lang}:${key}`)) {
      warned.add(`${lang}:${key}`);
      console.warn(`[i18n] missing key "${key}" for lang "${lang}", falling back to English`);
    }
    template = dictionaries.en[key];
  }
  if (template == null) {
    if (import.meta.env.DEV && !warned.has(`en:${key}`)) {
      warned.add(`en:${key}`);
      console.warn(`[i18n] missing key "${key}" even in English`);
    }
    return key;
  }
  return interpolate(template, vars);
}

export const I18nContext = createContext<{ lang: Lang; t: (key: TranslationKey, vars?: Record<string, string | number>) => string }>({
  lang: "en",
  t: (key, vars) => tKey("en", key, vars),
});

export function useT() {
  return useContext(I18nContext);
}

export function useLangDocumentEffect(lang: Lang) {
  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      /* ignore */
    }
  }, [lang]);
}

export function makeT(lang: Lang) {
  return (key: TranslationKey, vars?: Record<string, string | number>) => tKey(lang, key, vars);
}

/** Pick a browser speechSynthesis voice whose lang starts with desired lang. */
export function pickVoiceForLang(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  const want = lang === "es" ? "es" : "en";
  const exact = voices.find((v) => String(v.lang || "").toLowerCase().startsWith(want + "-") || String(v.lang || "").toLowerCase() === want);
  if (exact) return exact;
  const loose = voices.find((v) => String(v.lang || "").toLowerCase().startsWith(want));
  if (loose) return loose;
  return null;
}

export function speakWithLang(text: string, lang: Lang, opts?: { rate?: number; onend?: () => void; onerror?: () => void }) {
  if (typeof speechSynthesis === "undefined" || !text) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 6000));
    u.rate = opts?.rate ?? 1;
    try {
      const voices = speechSynthesis.getVoices();
      const voice = pickVoiceForLang(voices, lang);
      if (voice) u.voice = voice;
      if (!u.lang || !String(u.lang).startsWith(lang === "es" ? "es" : "en")) {
        u.lang = lang === "es" ? "es-ES" : "en-US";
      }
    } catch {
      /* voice selection is best effort */
    }
    if (opts?.onend) u.onend = opts.onend;
    if (opts?.onerror) u.onerror = opts.onerror;
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

// Convenience hook that returns a t bound to the current lang.
export function useTCallback() {
  const { lang } = useT();
  return useCallback((key: TranslationKey, vars?: Record<string, string | number>) => tKey(lang, key, vars), [lang]);
}

// For places outside React (e.g. direct speech call), read lang from storage or argument.
export function currentLang(): Lang {
  try {
    const v = localStorage.getItem("wow-learner-lang");
    if (v) return normalizeLang(v);
  } catch {}
  try {
    const docLang = document.documentElement.lang;
    if (docLang) return normalizeLang(docLang);
  } catch {}
  return "en";
}
