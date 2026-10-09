export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BCP-47 tag used for Intl formatting. Latin digits keep prices and SKUs consistent. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

/** Returns the locale prefix of a pathname, if any. */
export function localeFromPathname(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

/** Prefix an internal path with a locale: localizePath("en", "/shop") -> "/en/shop". */
export function localizePath(locale: Locale, path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/**
 * Swap the locale segment of a pathname, preserving the rest of the path
 * so the language switcher keeps the visitor on the same page.
 */
export function switchLocalePath(pathname: string, target: Locale): string {
  const segments = pathname.split("/");
  if (isLocale(segments[1])) {
    segments[1] = target;
    return segments.join("/") || `/${target}`;
  }
  return localizePath(target, pathname);
}

/** Path prefixes that must never be locale-prefixed by the proxy. */
export const unlocalizedPrefixes = [
  "/api",
  "/auth",
  "/_next",
  "/brand",
  "/fonts",
  "/sitemap.xml",
  "/robots.txt",
  "/icon",
  "/apple-icon",
  "/favicon",
  "/manifest",
];

export type LocaleDecision =
  | { action: "next"; locale: Locale | null }
  | { action: "redirect"; location: string };

/**
 * Pure routing decision used by the proxy (and covered by unit tests):
 * - "/" always redirects to the Arabic storefront (Arabic-first brand)
 * - other paths without a locale prefix use the visitor's saved language, else Arabic
 * - localized and unlocalized (API, assets) paths pass through.
 */
export function decideLocaleRouting(
  pathname: string,
  search: string,
  cookieLocale?: string | null,
): LocaleDecision {
  if (unlocalizedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p + "."))) {
    return { action: "next", locale: null };
  }
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) {
    return { action: "next", locale: null };
  }
  const current = localeFromPathname(pathname);
  if (current) return { action: "next", locale: current };
  const target: Locale =
    pathname === "/" ? defaultLocale : isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return { action: "redirect", location: `${localizePath(target, pathname)}${search}` };
}

export const LOCALE_COOKIE = "sl_locale";
