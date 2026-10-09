import type { Dictionary } from "./dictionaries/ar";
import { ar } from "./dictionaries/ar";
import { en } from "./dictionaries/en";
import type { Locale } from "./config";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Replace {placeholders} in a dictionary string. */
export function t(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Pick the localized value from an `{ ar, en }` pair, falling back to the other language. */
export function pick(locale: Locale, ar: string | null | undefined, en: string | null | undefined): string {
  const primary = locale === "ar" ? ar : en;
  const fallback = locale === "ar" ? en : ar;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || "";
}
