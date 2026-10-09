import { localizePath, type Locale } from "@/i18n/config";

/**
 * Only allow same-site relative redirects ("/ar/account"), never protocol-relative ("//evil")
 * or absolute URLs — prevents open redirects through ?next=.
 */
export function safeNextPath(next: unknown, locale: Locale, fallback = "/account"): string {
  if (typeof next === "string" && /^\/(?!\/)[^\s\\]*$/.test(next) && !next.startsWith("/api/") && next.length <= 300) {
    return next;
  }
  return localizePath(locale, fallback);
}
