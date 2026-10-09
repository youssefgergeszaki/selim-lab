import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { isLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Breadcrumbs, Container, SectionHeading } from "@/components/ui/misc";
import { Disclosure } from "@/components/ui/disclosure";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ProductGallery } from "@/components/product/product-gallery";
import { AddToCartForm } from "@/components/product/add-to-cart";
import { ProductCard, ProductGrid } from "@/components/product/product-card";
import { ReviewForm } from "@/components/product/review-form";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductBySlug, getRelatedProducts, type ProductDetail } from "@/server/catalog";
import { getProductReviews, getStoreSettings } from "@/server/content";
import { getSessionUser } from "@/lib/auth";
import { alternatesFor } from "@/lib/seo";
import { siteUrl } from "@/lib/env";
import { toDecimalString } from "@/lib/money";

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function load(locale: Locale, rawSlug: string) {
  const slug = decodeSlug(rawSlug);
  const result = await getProductBySlug(locale, slug);
  if (result.redirectSlug) {
    permanentRedirect(localizePath(locale, `/products/${encodeURIComponent(result.redirectSlug)}`));
  }
  return result.product;
}

function productPaths(product: ProductDetail): Partial<Record<Locale, string>> {
  const out: Partial<Record<Locale, string>> = {};
  for (const [l, s] of Object.entries(product.slugs)) {
    if (s) out[l as Locale] = `/products/${encodeURIComponent(s)}`;
  }
  return out;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await load(locale, slug);
  if (!product) return {};
  const title = product.seoTitle || product.name;
  const description = product.seoDescription || product.shortDescription || undefined;
  return {
    title,
    description,
    alternates: alternatesFor(locale, productPaths(product)),
    openGraph: {
      title,
      description,
      type: "website",
      images: product.images.slice(0, 1).map((img) => ({ url: img.url, alt: img.alt })),
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const product = await load(locale, slug);
  if (!product) notFound();

  const [related, reviews, settings, user] = await Promise.all([
    getRelatedProducts(locale, product, 4),
    getProductReviews(product.id),
    getStoreSettings(),
    getSessionUser(),
  ]);

  const defaultVariant =
    product.variants.find((v) => v.isDefault && v.available > 0) ??
    product.variants.find((v) => v.available > 0) ??
    product.variants.find((v) => v.isDefault) ??
    product.variants[0];
  const primaryCategory = product.categories[0];
  const url = `${siteUrl()}${localizePath(locale, `/products/${encodeURIComponent(product.slug)}`)}`;
  const averageRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  // Structured data uses only verified catalogue data (no invented claims or ratings).
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: defaultVariant.sku,
    brand: { "@type": "Brand", name: "SELIM LAB" },
    url,
    ...(product.shortDescription || product.description
      ? { description: product.shortDescription || product.description?.slice(0, 500) }
      : {}),
    ...(product.images.length ? { image: product.images.map((i) => i.url) } : {}),
    ...(primaryCategory ? { category: primaryCategory.name } : {}),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      price: toDecimalString(v.price),
      priceCurrency: "EGP",
      availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
    })),
    ...(averageRating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: averageRating.toFixed(1),
            reviewCount: reviews.length,
          },
        }
      : {}),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dict.common.home, item: `${siteUrl()}${localizePath(locale, "/")}` },
      { "@type": "ListItem", position: 2, name: dict.shop.title, item: `${siteUrl()}${localizePath(locale, "/shop")}` },
      { "@type": "ListItem", position: 3, name: product.name, item: url },
    ],
  };

  const details = [
    { key: "description", title: dict.product.description, body: product.description },
    { key: "ingredients", title: dict.product.ingredients, body: product.ingredients },
    { key: "howToUse", title: dict.product.howToUse, body: product.howToUse },
    { key: "warnings", title: dict.product.warnings, body: product.warnings },
  ].filter((d) => d.body && d.body.trim());

  return (
    <>
      <JsonLd data={[productLd, breadcrumbLd]} />
      <Container className="py-8 sm:py-12">
        <Breadcrumbs
          label={dict.common.breadcrumb}
          items={[
            { label: dict.common.home, href: localizePath(locale, "/") },
            { label: dict.shop.title, href: localizePath(locale, "/shop") },
            ...(primaryCategory
              ? [{ label: primaryCategory.name, href: `${localizePath(locale, "/shop")}?category=${encodeURIComponent(primaryCategory.slug)}` }]
              : []),
            { label: product.name },
          ]}
        />

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <ProductGallery
            images={product.images}
            labels={{ gallery: dict.product.gallery, showImage: dict.product.showImage }}
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <BrandLogo variant="mark" className="w-24 opacity-30" label="" />
                <span className="sr-only">{dict.product.noImage}</span>
              </div>
            }
          />

          <div className="lg:pt-4">
            {primaryCategory ? (
              <p className="eyebrow mb-4">
                <Link href={`${localizePath(locale, "/shop")}?category=${encodeURIComponent(primaryCategory.slug)}`}>
                  {primaryCategory.name}
                </Link>
              </p>
            ) : null}
            <h1 className="font-display text-4xl sm:text-5xl">{product.name}</h1>
            {product.shortDescription ? <p className="mt-4 text-lg text-muted">{product.shortDescription}</p> : null}
            {averageRating !== null ? (
              <p className="mt-3 text-sm text-muted">
                <span className="text-accent-strong" aria-hidden="true">
                  {"★".repeat(Math.round(averageRating))}
                </span>{" "}
                {t(dict.product.ratingOutOf, { rating: averageRating.toFixed(1) })} · {reviews.length}
              </p>
            ) : null}
            <div className="hairline my-8" aria-hidden="true" />

            <AddToCartForm
              locale={locale}
              variants={product.variants}
              defaultVariantId={defaultVariant.id}
              cartHref={localizePath(locale, "/cart")}
              lowStockThreshold={settings.lowStockThreshold}
              labels={{
                variant: dict.product.variant,
                quantity: dict.product.quantity,
                decrease: dict.product.decrease,
                increase: dict.product.increase,
                addToCart: dict.product.addToCart,
                adding: dict.product.adding,
                added: dict.product.added,
                viewCart: dict.product.viewCart,
                outOfStock: dict.product.outOfStock,
                inStock: dict.product.inStock,
                lowStock: dict.product.lowStock,
                sku: dict.product.sku,
                originalPrice: dict.product.originalPrice,
                onlyLeft: dict.cart.onlyLeft,
                genericError: dict.common.genericError,
                tooMany: dict.common.tooManyRequests,
              }}
            />

            <div className="mt-10 border-t border-line">
              {details.map((d, i) => (
                <Disclosure key={d.key} title={d.title} defaultOpen={i === 0} titleClassName="eyebrow !text-deep">
                  <p className="prose-brand">{d.body}</p>
                </Disclosure>
              ))}
              {product.attributes.length > 0 ? (
                <Disclosure title={dict.product.attributes} titleClassName="eyebrow !text-deep">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    {product.attributes.map((a) => (
                      <div key={a.label} className="contents">
                        <dt className="text-subtle">{a.label}</dt>
                        <dd className="text-deep">{a.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Disclosure>
              ) : null}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-subtle">{dict.product.cosmeticNotice}</p>
          </div>
        </div>
      </Container>

      <section aria-labelledby="reviews-title" className="mt-16 border-t border-line py-16">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 id="reviews-title" className="font-display text-3xl">
              {dict.product.reviews}
            </h2>
            {reviews.length === 0 ? (
              <p className="mt-4 text-muted">{dict.product.noReviews}</p>
            ) : (
              <ul className="mt-8 space-y-8">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b border-line pb-8">
                    <p className="text-accent-strong" aria-label={t(dict.product.ratingOutOf, { rating: r.rating })}>
                      {"★".repeat(r.rating)}
                      <span className="text-line-strong">{"★".repeat(5 - r.rating)}</span>
                    </p>
                    {r.title ? <h3 className="mt-2 font-display text-xl">{r.title}</h3> : null}
                    <p className="mt-2 whitespace-pre-line text-muted">{r.body}</p>
                    <p className="mt-3 text-xs text-subtle">
                      {r.displayName}
                      {r.verifiedPurchase ? ` · ${dict.product.verifiedPurchase}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            {user ? (
              <ReviewForm
                productId={product.id}
                locale={locale}
                labels={{
                  title: dict.product.writeReview,
                  rating: dict.product.reviewRating,
                  reviewTitle: dict.product.reviewTitle,
                  body: dict.product.reviewBody,
                  submit: dict.product.reviewSubmit,
                  pending: dict.product.reviewPending,
                  signIn: dict.product.reviewSignIn,
                  invalid: dict.checkout.errors.validation,
                  duplicate: dict.product.reviewDuplicate,
                  error: dict.common.genericError,
                  tooMany: dict.common.tooManyRequests,
                  optional: dict.common.optional,
                }}
              />
            ) : (
              <p className="text-muted">
                <Link
                  className="link-underline text-deep"
                  href={`${localizePath(locale, "/account/login")}?next=${encodeURIComponent(localizePath(locale, `/products/${encodeURIComponent(product.slug)}`))}`}
                >
                  {dict.product.reviewSignIn}
                </Link>
              </p>
            )}
          </div>
        </Container>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="py-16">
          <Container>
            <SectionHeading id="related-title" title={dict.product.related} />
            <ProductGrid>
              {related.map((p) => (
                <ProductCard key={p.id} product={p} locale={locale} dict={dict} lowStockThreshold={settings.lowStockThreshold} />
              ))}
            </ProductGrid>
          </Container>
        </section>
      ) : null}
    </>
  );
}
