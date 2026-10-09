import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary, type Dictionary } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Container, SectionHeading } from "@/components/ui/misc";
import { Disclosure } from "@/components/ui/disclosure";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ProductCard, ProductGrid } from "@/components/product/product-card";
import { NewsletterForm } from "@/components/home/newsletter-form";
import { getBestSellers, getCategories, getFeaturedProducts, type CategoryData } from "@/server/catalog";
import {
  getFaqs,
  getHomepageSections,
  getIngredients,
  getRecentReviews,
  getStoreSettings,
  defaultSettings,
  type HomepageSection,
} from "@/server/content";
import { alternatesFor } from "@/lib/seo";
import { logger } from "@/lib/logger";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/env";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: { absolute: dict.meta.defaultTitle },
    description: dict.meta.defaultDescription,
    alternates: alternatesFor(locale, "/"),
  };
}

async function safe<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    logger.error("home.data_failed", { label, error: String(error) });
    return fallback;
  }
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  const [sections, categories, bestSellers, featured, ingredients, reviews, faqs, settings] = await Promise.all([
    safe(getHomepageSections(locale), {} as Record<string, HomepageSection>, "sections"),
    safe(getCategories(locale), [], "categories"),
    safe(getBestSellers(locale, 4), [], "bestsellers"),
    safe(getFeaturedProducts(locale, 8), [], "featured"),
    safe(getIngredients(locale), [], "ingredients"),
    safe(getRecentReviews(locale, 3), [], "reviews"),
    safe(getFaqs(locale), [], "faqs"),
    safe(getStoreSettings(), defaultSettings, "settings"),
  ]);

  const collections = categories.filter((c) => c.kind === "collection");
  const tiles = (collections.length > 0 ? collections : categories).slice(0, 4);
  const featuredList = featured.filter((p) => !bestSellers.some((b) => b.id === p.id)).slice(0, 4);
  const catalogEmpty = bestSellers.length === 0 && featured.length === 0;

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SELIM LAB",
    alternateName: "سليم لاب",
    url: siteUrl(),
    logo: `${siteUrl()}/brand/selim-lab-logo.png`,
    slogan: "Science in every formula",
    ...(settings.contactEmail || settings.contactPhone
      ? {
          contactPoint: [
            {
              "@type": "ContactPoint",
              contactType: "customer service",
              ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
              ...(settings.contactPhone ? { telephone: settings.contactPhone } : {}),
              areaServed: "EG",
              availableLanguage: ["Arabic", "English"],
            },
          ],
        }
      : {}),
    ...(Object.values(settings.social).length ? { sameAs: Object.values(settings.social) } : {}),
  };

  return (
    <>
      <JsonLd data={organizationLd} />
      <Hero locale={locale} dict={dict} section={sections.hero} />

      {tiles.length > 0 ? (
        <section id="collections" aria-labelledby="collections-title" className="scroll-mt-24 py-20 sm:py-24">
          <Container>
            <SectionHeading
              id="collections-title"
              eyebrow={dict.nav.collections}
              title={sections.collections?.copy.title ?? dict.home.collectionsTitle}
              subtitle={sections.collections?.copy.body ?? dict.home.collectionsSubtitle}
            />
            <CollectionTiles locale={locale} tiles={tiles} />
          </Container>
        </section>
      ) : null}

      {bestSellers.length > 0 ? (
        <section aria-labelledby="bestsellers-title" className="py-16 sm:py-20">
          <Container>
            <SectionHeading
              id="bestsellers-title"
              title={dict.home.bestSellersTitle}
              subtitle={dict.home.bestSellersSubtitle}
              action={
                <Button asChild variant="link">
                  <Link href={localizePath(locale, "/shop")}>{dict.common.viewAll}</Link>
                </Button>
              }
            />
            <ProductGrid>
              {bestSellers.map((p) => (
                <ProductCard key={p.id} product={p} locale={locale} dict={dict} lowStockThreshold={settings.lowStockThreshold} />
              ))}
            </ProductGrid>
          </Container>
        </section>
      ) : null}

      <Philosophy dict={dict} section={sections.philosophy} />

      {ingredients.length > 0 ? (
        <section id="ingredients" aria-labelledby="ingredients-title" className="scroll-mt-24 py-20 sm:py-24">
          <Container>
            <SectionHeading
              id="ingredients-title"
              eyebrow={dict.home.ingredientsEyebrow}
              title={sections.ingredients?.copy.title ?? dict.home.ingredientsTitle}
              subtitle={sections.ingredients?.copy.body ?? dict.home.ingredientsSubtitle}
            />
            <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {ingredients.map((ing) => (
                <li key={ing.id} className="flex gap-5 bg-ivory p-7">
                  {ing.imageUrl ? (
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-surface-muted">
                      <Image src={ing.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                    </div>
                  ) : null}
                  <div>
                    <h3 className="font-display text-xl">{ing.name}</h3>
                    {ing.description ? <p className="mt-2 text-sm leading-relaxed text-muted">{ing.description}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : (
        <span id="ingredients" className="block scroll-mt-24" />
      )}

      <section aria-labelledby="featured-title" className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            id="featured-title"
            title={dict.home.featuredTitle}
            subtitle={dict.home.featuredSubtitle}
            action={
              featuredList.length > 0 ? (
                <Button asChild variant="link">
                  <Link href={localizePath(locale, "/shop")}>{dict.common.viewAll}</Link>
                </Button>
              ) : undefined
            }
          />
          {featuredList.length > 0 ? (
            <ProductGrid>
              {featuredList.map((p) => (
                <ProductCard key={p.id} product={p} locale={locale} dict={dict} lowStockThreshold={settings.lowStockThreshold} />
              ))}
            </ProductGrid>
          ) : (
            <p className="border border-line px-6 py-12 text-center text-muted">
              {catalogEmpty ? dict.home.emptyCatalog : dict.shop.emptyBody}
            </p>
          )}
        </Container>
      </section>

      <Story dict={dict} section={sections.brand_story} />

      {reviews.length > 0 ? (
        <section aria-labelledby="reviews-title" className="py-20 sm:py-24">
          <Container>
            <SectionHeading id="reviews-title" title={dict.home.reviewsTitle} subtitle={dict.home.reviewsSubtitle} align="center" />
            <ul className="grid gap-8 md:grid-cols-3">
              {reviews.map((r) => (
                <li key={r.id} className="border-t border-line-gold pt-6">
                  <p className="text-accent-strong" aria-label={`${r.rating} / 5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-line-strong">{"★".repeat(5 - r.rating)}</span>
                  </p>
                  {r.title ? <h3 className="mt-3 font-display text-xl">{r.title}</h3> : null}
                  <p className="mt-2 text-muted">{r.body}</p>
                  <p className="mt-4 text-sm text-subtle">
                    {r.displayName}
                    {r.productName ? ` · ${r.productName}` : ""}
                    {r.verifiedPurchase ? ` · ${dict.product.verifiedPurchase}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {faqs.length > 0 ? (
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 py-20 sm:py-24">
          <Container className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="eyebrow mb-3">{dict.nav.faq}</p>
              <h2 id="faq-title" className="font-display text-3xl sm:text-4xl">
                {dict.home.faqTitle}
              </h2>
            </div>
            <div className="border-t border-line">
              {faqs.map((faq) => (
                <Disclosure key={faq.id} title={faq.question} titleClassName="text-lg">
                  <p className="prose-brand">{faq.answer}</p>
                </Disclosure>
              ))}
            </div>
          </Container>
        </section>
      ) : (
        <span id="faq" className="block scroll-mt-24" />
      )}

      <section aria-labelledby="newsletter-title" className="bg-deep py-20 text-ivory">
        <Container className="flex flex-col items-center text-center">
          <div className="hairline mb-6" aria-hidden="true" />
          <h2 id="newsletter-title" className="font-display text-3xl text-ivory sm:text-4xl">
            {sections.newsletter?.copy.title ?? dict.home.newsletterTitle}
          </h2>
          <p className="mt-3 max-w-md text-ivory/75">{sections.newsletter?.copy.body ?? dict.home.newsletterSubtitle}</p>
          <NewsletterForm
            locale={locale}
            source="home"
            tone="dark"
            className="mt-8 max-w-md"
            labels={{
              placeholder: dict.home.newsletterPlaceholder,
              cta: dict.home.newsletterCta,
              success: dict.home.newsletterSuccess,
              invalid: dict.home.newsletterInvalid,
              error: dict.common.genericError,
              tooMany: dict.common.tooManyRequests,
            }}
          />
        </Container>
      </section>
    </>
  );
}

function Hero({ locale, dict, section }: { locale: Locale; dict: Dictionary; section?: HomepageSection }) {
  const copy = section?.copy ?? {};
  const ctaHref = copy.cta_href
    ? copy.cta_href.startsWith("/") && !copy.cta_href.startsWith(`/${locale}`)
      ? localizePath(locale, copy.cta_href)
      : copy.cta_href
    : localizePath(locale, "/shop");
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-line">
      <Container className="grid grid-cols-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
        <div className="max-w-xl">
          <p className="eyebrow mb-5">{copy.eyebrow ?? dict.home.heroEyebrow}</p>
          <h1 id="hero-title" className="font-display text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.2rem]">
            {copy.title ?? dict.home.heroTitle}
          </h1>
          <div className="hairline my-8" aria-hidden="true" />
          <p className="max-w-md text-lg leading-relaxed text-muted">{copy.body ?? dict.home.heroSubtitle}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={ctaHref}>{copy.cta_label ?? dict.home.heroCta}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`${localizePath(locale, "/")}#philosophy`}>{dict.home.heroSecondaryCta}</Link>
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface-muted sm:aspect-[5/5] lg:aspect-[4/5]">
            {section?.imageUrl ? (
              <Image
                src={section.imageUrl}
                alt={copy.title ?? dict.home.heroTitle}
                fill
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              // Placeholder until the business uploads hero photography from the dashboard.
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-10">
                <BrandLogo variant="full" className="w-[68%] max-w-sm" label="SELIM LAB" eager />
                <span className="sr-only">{dict.home.heroImagePlaceholder}</span>
              </div>
            )}
            <span aria-hidden="true" className="pointer-events-none absolute inset-4 border border-line-gold" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function CollectionTiles({ locale, tiles }: { locale: Locale; tiles: CategoryData[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile, index) => (
        <li key={tile.id}>
          <Link
            href={`${localizePath(locale, "/shop")}?category=${encodeURIComponent(tile.slug)}`}
            className="group relative block aspect-[3/4] overflow-hidden bg-surface-muted"
          >
            {tile.imageUrl ? (
              <Image
                src={tile.imageUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            ) : (
              <span aria-hidden="true" className="absolute inset-0 flex items-start justify-end p-6 font-display text-6xl text-gold/40">
                {String(index + 1).padStart(2, "0")}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep/60 to-transparent p-6 pt-16">
              <span className="block font-display text-2xl text-ivory">{tile.name}</span>
              {tile.description ? (
                <span className="mt-1 line-clamp-2 block text-sm text-ivory/80">{tile.description}</span>
              ) : null}
            </span>
            <span aria-hidden="true" className="pointer-events-none absolute inset-3 border border-transparent transition-colors group-hover:border-gold/60" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Philosophy({ dict, section }: { dict: Dictionary; section?: HomepageSection }) {
  const copy = section?.copy ?? {};
  return (
    <section id="philosophy" aria-labelledby="philosophy-title" className="scroll-mt-24 border-y border-line bg-surface-muted/50 py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow mb-4">{copy.eyebrow ?? dict.home.philosophyEyebrow}</p>
          <h2 id="philosophy-title" className="font-display text-3xl sm:text-5xl">
            {copy.title ?? dict.home.philosophyTitle}
          </h2>
          <div className="hairline mx-auto my-8" aria-hidden="true" />
          <p className="prose-brand text-lg">{copy.body ?? dict.home.philosophyBody}</p>
        </div>
        <ol className="mx-auto mt-16 grid max-w-5xl gap-10 sm:grid-cols-3">
          {dict.home.philosophyPoints.map((point, i) => (
            <li key={point.title} className="text-center">
              <span className="ltr-nums font-display text-3xl text-accent-strong">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 font-display text-xl">{point.title}</h3>
              <p className="mt-2 text-sm text-muted">{point.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Story({ dict, section }: { dict: Dictionary; section?: HomepageSection }) {
  const copy = section?.copy ?? {};
  return (
    <section id="story" aria-labelledby="story-title" className="scroll-mt-24 py-20 sm:py-28">
      <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="relative order-last aspect-[4/5] overflow-hidden bg-surface-muted lg:order-none">
          {section?.imageUrl ? (
            <Image src={section.imageUrl} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BrandLogo variant="mark" className="w-28 opacity-40" label="" />
            </div>
          )}
          <span aria-hidden="true" className="pointer-events-none absolute inset-4 border border-line-gold" />
        </div>
        <div className="max-w-xl">
          <p className="eyebrow mb-4">{copy.eyebrow ?? dict.home.storyEyebrow}</p>
          <h2 id="story-title" className="font-display text-3xl sm:text-5xl">
            {copy.title ?? dict.home.storyTitle}
          </h2>
          <div className="hairline my-8" aria-hidden="true" />
          <p className="prose-brand text-lg">{copy.body ?? dict.home.storyBody}</p>
          <p className="mt-8 font-display text-xl italic text-accent-strong">{dict.home.storySignature}</p>
        </div>
      </Container>
    </section>
  );
}
