// SPDX-License-Identifier: AGPL-3.0-or-later
// Studio language controls. Owned by Well 2 studio target language packet.
// Re-exported so web/src/pages/Studio.tsx stays thin and the form lives
// under the owned path web/src/components/CourseStudio/*
export const CEFR_LEVELS = ["A1","A2","B1","B2","C1","C2"] as const;
export const LANGUAGE_OPTIONS = [
  { value: "", label: "None (regular course)" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "la", label: "Latin" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
] as const;
export function isValidLanguage(v: string | null | undefined): boolean {
  if (!v) return true;
  const t = String(v).trim().toLowerCase().slice(0, 20);
  return /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(t);
}
export function isValidCefr(v: string | null | undefined): boolean {
  if (!v) return true;
  const t = String(v).trim().toUpperCase().slice(0, 4);
  return (CEFR_LEVELS as readonly string[]).includes(t);
}
