import Link from "next/link";
import { ShoppingBag, User } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { getSessionUser, getUserRoles, isStaffRole } from "@/lib/auth";
import { getCartCount } from "@/server/cart";
import { BrandLogo } from "./brand-logo";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav, SearchDialog, type NavItem } from "./header-dialogs";
import { Container } from "@/components/ui/misc";

export async function SiteHeader({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const [user, cartCount] = await Promise.all([getSessionUser(), getCartCount()]);
  const roles = user ? await getUserRoles(user.id) : [];
  const href = (path: string) => localizePath(locale, path);

  const primary: NavItem[] = [
    { href: href("/shop"), label: dict.nav.shop },
    { href: `${href("/")}#collections`, label: dict.nav.collections },
    { href: `${href("/")}#ingredients`, label: dict.nav.ingredients },
    { href: `${href("/")}#story`, label: dict.nav.story },
  ];
  const secondary: NavItem[] = [
    { href: `${href("/")}#faq`, label: dict.nav.faq },
    user ? { href: href("/account"), label: dict.nav.account } : { href: href("/account/login"), label: dict.nav.signIn },
    ...(isStaffRole(roles) ? [{ href: href("/admin"), label: dict.nav.admin }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
      <Container className="grid h-[var(--header-height)] grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-1">
          <MobileNav
            items={primary}
            secondary={secondary}
            openLabel={dict.common.openMenu}
            closeLabel={dict.common.closeMenu}
            title={dict.common.menu}
            searchAction={href("/shop")}
            searchLabel={dict.shop.searchLabel}
            searchPlaceholder={dict.nav.searchPlaceholder}
            footer={
              <LanguageSwitcher
                locale={locale}
                label={dict.common.switchLanguage}
                ariaLabel={dict.common.switchLanguageLabel}
              />
            }
          />
          <nav aria-label={dict.common.menu} className="hidden lg:block">
            <ul className="flex items-center gap-7">
              {primary.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="tracking-label text-[0.78rem] text-deep transition-colors hover:text-accent-strong">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <Link href={href("/")} className="block" aria-label={`${dict.meta.brand} — ${dict.common.home}`}>
          <BrandLogo variant="mark" className="h-12 sm:h-[3.25rem]" label={dict.meta.brand} eager />
        </Link>

        <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
          <SearchDialog
            action={href("/shop")}
            label={dict.shop.searchLabel}
            placeholder={dict.nav.searchPlaceholder}
            closeLabel={dict.common.close}
          />
          <LanguageSwitcher
            locale={locale}
            label={dict.common.switchLanguage}
            ariaLabel={dict.common.switchLanguageLabel}
            className="hidden px-2 sm:inline"
          />
          {isStaffRole(roles) ? (
            <Link href={href("/admin")} className="hidden px-2 text-sm text-muted hover:text-deep xl:inline">
              {dict.nav.admin}
            </Link>
          ) : null}
          <Link
            href={user ? href("/account") : href("/account/login")}
            className="hidden size-10 items-center justify-center text-deep hover:text-accent-strong sm:inline-flex"
            aria-label={user ? dict.nav.account : dict.nav.signIn}
          >
            <User className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
          </Link>
          <Link
            href={href("/cart")}
            className="relative inline-flex size-10 items-center justify-center text-deep hover:text-accent-strong"
            aria-label={t(dict.nav.cartWithCount, { count: cartCount })}
          >
            <ShoppingBag className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
            {cartCount > 0 ? (
              <span className="ltr-nums absolute -top-0.5 end-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-deep px-1 text-[0.65rem] leading-[1.1rem] text-ivory">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
        </div>
      </Container>
    </header>
  );
}

export async function AnnouncementBar({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="bg-deep px-4 py-2 text-center text-[0.8rem] text-ivory/90">
      <p className="tracking-label text-[0.72rem]">{text}</p>
    </div>
  );
}
