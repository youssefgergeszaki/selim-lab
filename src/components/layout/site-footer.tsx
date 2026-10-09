import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import type { StoreSettings } from "@/server/content";
import { BrandLogo } from "./brand-logo";
import { Container } from "@/components/ui/misc";
import { NewsletterForm } from "@/components/home/newsletter-form";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};

export function SiteFooter({
  locale,
  settings,
  pages,
  categories,
}: {
  locale: Locale;
  settings: StoreSettings;
  pages: { slug: string; title: string }[];
  categories: { slug: string; name: string }[];
}) {
  const dict = getDictionary(locale);
  const href = (path: string) => localizePath(locale, path);
  const address = locale === "ar" ? settings.addressAr : settings.addressEn;
  const socials = Object.entries(settings.social);

  return (
    <footer className="mt-24 border-t border-line-gold bg-surface-muted/60">
      <Container className="py-16">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr] [&>*]:min-w-0">
          <div className="max-w-sm">
            <BrandLogo variant="full" className="w-44" label={dict.meta.brand} />
            <p className="mt-6 text-sm leading-relaxed text-muted">{dict.footer.about}</p>
          </div>

          <div>
            <h2 className="eyebrow mb-5">{dict.footer.shop}</h2>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href={href("/shop")} className="text-muted hover:text-deep">
                  {dict.shop.allProducts}
                </Link>
              </li>
              {categories.slice(0, 6).map((c) => (
                <li key={c.slug}>
                  <Link href={`${href("/shop")}?category=${encodeURIComponent(c.slug)}`} className="text-muted hover:text-deep">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="eyebrow mb-5">{dict.footer.help}</h2>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href={`${href("/")}#faq`} className="text-muted hover:text-deep">
                  {dict.nav.faq}
                </Link>
              </li>
              <li>
                <Link href={href("/track-order")} className="text-muted hover:text-deep">
                  {dict.footer.trackOrder}
                </Link>
              </li>
              <li>
                <Link href={href("/account")} className="text-muted hover:text-deep">
                  {dict.nav.account}
                </Link>
              </li>
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link href={href(`/pages/${p.slug}`)} className="text-muted hover:text-deep">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="eyebrow mb-5">{dict.home.newsletterTitle}</h2>
            <p className="mb-4 text-sm text-muted">{dict.home.newsletterSubtitle}</p>
            <NewsletterForm
              locale={locale}
              source="footer"
              labels={{
                placeholder: dict.home.newsletterPlaceholder,
                cta: dict.home.newsletterCta,
                success: dict.home.newsletterSuccess,
                invalid: dict.home.newsletterInvalid,
                error: dict.common.genericError,
                tooMany: dict.common.tooManyRequests,
              }}
            />
            {(settings.contactEmail || settings.contactPhone || settings.whatsapp || address) && (
              <div className="mt-8 space-y-1.5 text-sm text-muted">
                <h2 className="eyebrow mb-3">{dict.footer.contact}</h2>
                {settings.contactEmail ? (
                  <p>
                    <a href={`mailto:${settings.contactEmail}`} className="hover:text-deep">
                      {settings.contactEmail}
                    </a>
                  </p>
                ) : null}
                {settings.contactPhone ? (
                  <p>
                    <a href={`tel:${settings.contactPhone}`} className="ltr-nums hover:text-deep">
                      {settings.contactPhone}
                    </a>
                  </p>
                ) : null}
                {settings.whatsapp ? (
                  <p>
                    <a
                      href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
                      className="hover:text-deep"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      WhatsApp · <span className="ltr-nums">{settings.whatsapp}</span>
                    </a>
                  </p>
                ) : null}
                {address ? <p>{address}</p> : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>{t(dict.footer.rights, { year: new Date().getFullYear() })}</p>
          {socials.length > 0 ? (
            <ul className="flex flex-wrap gap-5" aria-label={dict.footer.follow}>
              {socials.map(([key, url]) => (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="tracking-label hover:text-deep">
                    {SOCIAL_LABELS[key] ?? key}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Container>
    </footer>
  );
}
