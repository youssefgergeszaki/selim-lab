import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { getAdminDictionary } from "@/i18n/admin";
import { getSessionUser, getStaffContext } from "@/lib/auth";
import { noIndex } from "@/lib/seo";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { robots: noIndex, title: { default: "Dashboard", template: "%s | SELIM LAB Dashboard" } };

/**
 * Every dashboard route is authorised here on the server (and again inside each action).
 * Hidden links are never the protection: non-staff users get a 404.
 */
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`${localizePath(locale, "/account/login")}?next=${encodeURIComponent(localizePath(locale, "/admin"))}`);
  const ctx = await getStaffContext("staff");
  if (!ctx) notFound();
  const a = getAdminDictionary(locale);
  const dict = getDictionary(locale);
  const base = localizePath(locale, "/admin");

  const groups = [
    [
      { href: base, label: a.nav.overview },
      { href: `${base}/orders`, label: a.nav.orders },
      { href: `${base}/products`, label: a.nav.products },
      { href: `${base}/categories`, label: a.nav.categories },
      { href: `${base}/shipping`, label: a.nav.shipping },
      { href: `${base}/coupons`, label: a.nav.coupons },
    ],
    [
      { href: `${base}/content`, label: a.nav.content },
      { href: `${base}/ingredients`, label: a.nav.ingredients },
      { href: `${base}/faqs`, label: a.nav.faqs },
      { href: `${base}/pages`, label: a.nav.pages },
      { href: `${base}/reviews`, label: a.nav.reviews },
    ],
    ctx.isAdmin
      ? [
          { href: `${base}/customers`, label: a.nav.customers },
          { href: `${base}/settings`, label: a.nav.settings },
          { href: `${base}/team`, label: a.nav.team },
          { href: `${base}/audit`, label: a.nav.audit },
        ]
      : [],
  ].filter((g) => g.length > 0);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-line bg-ivory lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-e lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <Link href={base} className="flex items-center gap-3" aria-label={a.title}>
            <BrandLogo variant="mark" className="h-10" label="SELIM LAB" eager />
            <span className="text-sm font-medium">{a.title}</span>
          </Link>
          <LanguageSwitcher locale={locale} label={dict.common.switchLanguage} ariaLabel={dict.common.switchLanguageLabel} />
        </div>
        <AdminNav groups={groups} base={base} label={a.title} />
        <div className="space-y-1 border-t border-line px-5 py-4 text-xs text-subtle">
          <p>
            {a.signedInAs}: <span dir="ltr">{ctx.user.email}</span>
          </p>
          <p>{ctx.roles.map((r) => a.roles[r]).join("، ")}</p>
          <Link href={localizePath(locale, "/")} className="link-underline mt-2 inline-block text-deep">
            {a.backToStore}
          </Link>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
