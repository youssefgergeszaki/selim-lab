import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { AnnouncementBar, SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getPageLinks, getStoreSettings, defaultSettings } from "@/server/content";
import { getCategories } from "@/server/catalog";
import { logger } from "@/lib/logger";

async function safe<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    logger.error("layout.data_failed", { label, error: String(error) });
    return fallback;
  }
}

export default async function StoreLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const [settings, pages, categories] = await Promise.all([
    safe(getStoreSettings(), defaultSettings, "settings"),
    safe(getPageLinks(locale), [], "pages"),
    safe(getCategories(locale), [], "categories"),
  ]);
  const announcement = settings.announcementActive
    ? (locale === "ar" ? settings.announcementAr : settings.announcementEn) || null
    : null;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:bg-deep focus:px-4 focus:py-2 focus:text-ivory"
      >
        {dict.common.skipToContent}
      </a>
      <AnnouncementBar text={announcement} />
      <SiteHeader locale={locale} />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter
        locale={locale}
        settings={settings}
        pages={pages}
        categories={categories.filter((c) => c.kind === "category")}
      />
    </>
  );
}
