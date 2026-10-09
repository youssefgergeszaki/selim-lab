import type { MetadataRoute } from "next";
import { locales, localizePath } from "@/i18n/config";
import { siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getAllProductSlugs, getCategories } from "@/server/catalog";
import { getPageLinks } from "@/server/content";

export const revalidate = 3600;

/** Public, indexable URLs only (no account, checkout, order or admin routes). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const alt = (path: (l: (typeof locales)[number]) => string) => ({
    languages: Object.fromEntries(locales.map((l) => [l === "ar" ? "ar-EG" : "en-EG", `${base}${localizePath(l, path(l))}`])),
  });
  const entries: MetadataRoute.Sitemap = [];
  for (const l of locales) {
    entries.push({ url: `${base}${localizePath(l, "/")}`, changeFrequency: "weekly", priority: 1, alternates: alt(() => "/") });
    entries.push({ url: `${base}${localizePath(l, "/shop")}`, changeFrequency: "daily", priority: 0.9, alternates: alt(() => "/shop") });
  }
  try {
    const [slugs, categories, pages] = await Promise.all([getAllProductSlugs(), getCategories("en"), getPageLinks("en")]);
    const byProduct = new Map<string, Partial<Record<string, string>>>();
    for (const s of slugs) byProduct.set(s.productId, { ...(byProduct.get(s.productId) ?? {}), [s.locale]: s.slug });
    for (const s of slugs) {
      const translations = byProduct.get(s.productId)!;
      entries.push({
        url: `${base}${localizePath(s.locale, `/products/${encodeURIComponent(s.slug)}`)}`,
        lastModified: s.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(
            Object.entries(translations).map(([l, slug]) => [
              l === "ar" ? "ar-EG" : "en-EG",
              `${base}${localizePath(l as "ar", `/products/${encodeURIComponent(slug!)}`)}`,
            ]),
          ),
        },
      });
    }
    for (const c of categories) {
      for (const l of locales) {
        entries.push({ url: `${base}${localizePath(l, "/shop")}?category=${encodeURIComponent(c.slug)}`, changeFrequency: "weekly", priority: 0.6 });
      }
    }
    for (const p of pages) {
      for (const l of locales) {
        entries.push({ url: `${base}${localizePath(l, `/pages/${p.slug}`)}`, changeFrequency: "yearly", priority: 0.3, alternates: alt(() => `/pages/${p.slug}`) });
      }
    }
  } catch (error) {
    logger.error("sitemap.failed", { error: String(error) });
  }
  return entries;
}
