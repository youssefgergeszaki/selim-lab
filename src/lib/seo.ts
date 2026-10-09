import type { Metadata } from "next";
import { locales, localizePath, type Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/env";

/**
 * Canonical + hreflang alternates for a page that exists in both locales.
 * `paths` may give a different path per locale (e.g. localized product slugs).
 */
export function alternatesFor(
  locale: Locale,
  path: string | Partial<Record<Locale, string>>,
): NonNullable<Metadata["alternates"]> {
  const pathFor = (l: Locale) => (typeof path === "string" ? path : (path[l] ?? path[locale] ?? "/"));
  const languages: Record<string, string> = {};
  for (const l of locales) {
    if (typeof path !== "string" && !path[l]) continue;
    languages[l === "ar" ? "ar-EG" : "en-EG"] = `${siteUrl()}${localizePath(l, pathFor(l))}`;
  }
  languages["x-default"] = `${siteUrl()}${localizePath("ar", pathFor("ar"))}`;
  return {
    canonical: `${siteUrl()}${localizePath(locale, pathFor(locale))}`,
    languages,
  };
}

/** Metadata for private pages (account, checkout, orders, admin). */
export const noIndex: Metadata["robots"] = { index: false, follow: false, nocache: true };
