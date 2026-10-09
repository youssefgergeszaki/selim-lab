import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Alert, Container, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CouponForm } from "@/components/cart/coupon-form";
import { getCartView } from "@/server/cart";
import { getShippingConfig } from "@/server/content";
import { removeCartItem, updateCartItem } from "@/server/actions/cart";
import { availableShippingOptions } from "@/lib/commerce/shipping";
import { couponMessages } from "@/lib/commerce/messages";
import { formatMoney } from "@/lib/money";
import { governorates } from "@/lib/governorates";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).cart.title, robots: noIndex };
}

export default async function CartPage({ params, searchParams }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;
  const govParam = typeof sp.gov === "string" ? sp.gov : "";
  const governorate = governorates.some((g) => g.code === govParam) ? govParam : "";

  const [cart, shipping] = await Promise.all([getCartView(locale), getShippingConfig()]);

  if (cart.lines.length === 0) {
    return (
      <Container className="py-16 sm:py-24">
        <h1 className="sr-only">{dict.cart.title}</h1>
        <EmptyState
          title={dict.cart.empty}
          body={dict.cart.emptyBody}
          action={
            <Button asChild>
              <Link href={localizePath(locale, "/shop")}>{dict.cart.continueShopping}</Link>
            </Button>
          }
        />
      </Container>
    );
  }

  const afterDiscount = cart.totals.subtotal - cart.totals.discount;
  const estimate = governorate
    ? availableShippingOptions(shipping.zones, shipping.rates, governorate, afterDiscount)[0] ?? null
    : null;
  const freeShippingCoupon = cart.coupon?.discountType === "free_shipping";
  const estimatedFee = estimate ? (freeShippingCoupon ? 0 : estimate.effectiveFee) : null;
  const canCheckout = cart.lines.some((l) => l.purchasable);
  const productHref = (slug: string | null) =>
    slug ? localizePath(locale, `/products/${encodeURIComponent(slug)}`) : localizePath(locale, "/shop");

  return (
    <Container className="py-10 sm:py-14">
      <h1 className="font-display text-4xl sm:text-5xl">{dict.cart.title}</h1>
      <div className="hairline my-8" aria-hidden="true" />

      {cart.hasIssues ? (
        <Alert tone="warning" className="mb-8">
          {dict.checkout.errors.outOfStock}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_380px]">
        <section aria-label={dict.cart.title}>
          <ul className="divide-y divide-line border-y border-line">
            {cart.lines.map((line) => (
              <li key={line.itemId} className="grid grid-cols-[88px_1fr] gap-5 py-6 sm:grid-cols-[112px_1fr]">
                <Link href={productHref(line.slug)} className="relative block aspect-[4/5] overflow-hidden bg-surface-muted" tabIndex={-1} aria-hidden="true">
                  {line.imageUrl ? (
                    <Image src={line.imageUrl} alt="" fill sizes="112px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <BrandLogo variant="mark" className="w-8 opacity-30" label="" />
                    </span>
                  )}
                </Link>
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl">
                        <Link href={productHref(line.slug)} className="hover:text-accent-strong">
                          {line.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-sm text-subtle">
                        {line.variantName ? `${line.variantName} · ` : ""}
                        <span className="ltr-nums">{line.sku}</span>
                      </p>
                    </div>
                    <p className="ltr-nums text-deep">{formatMoney(line.lineTotal, locale)}</p>
                  </div>
                  <p className="ltr-nums text-sm text-muted">
                    {formatMoney(line.unitPrice, locale)}
                    {line.compareAtPrice ? (
                      <span className="ms-2 text-subtle line-through">{formatMoney(line.compareAtPrice, locale)}</span>
                    ) : null}
                  </p>
                  {!line.purchasable ? (
                    <p className="text-sm text-danger">
                      {line.available > 0 ? t(dict.cart.onlyLeft, { count: line.available }) : dict.cart.unavailable}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <form action={updateCartItem} className="flex items-center gap-2">
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <label htmlFor={`qty-${line.itemId}`} className="sr-only">
                        {dict.cart.quantity}
                      </label>
                      <Select
                        id={`qty-${line.itemId}`}
                        name="quantity"
                        defaultValue={String(Math.min(line.quantity, 10))}
                        className="ltr-nums h-9 w-20 text-sm"
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n} disabled={line.available > 0 && n > line.available}>
                            {n}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="subtle" size="sm">
                        {dict.cart.update}
                      </Button>
                    </form>
                    <form action={removeCartItem}>
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <Button type="submit" variant="link" size="sm" className="text-sm text-muted">
                        {dict.cart.remove}
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Button asChild variant="link" className="mt-6">
            <Link href={localizePath(locale, "/shop")}>{dict.cart.continueShopping}</Link>
          </Button>
        </section>

        <aside aria-labelledby="summary-title" className="h-fit border border-line bg-surface p-6 lg:sticky lg:top-28">
          <h2 id="summary-title" className="font-display text-2xl">
            {dict.checkout.summary}
          </h2>
          <div className="mt-6">
            <CouponForm
              locale={locale}
              appliedCode={cart.couponCode}
              appliedValid={Boolean(cart.coupon)}
              labels={{
                label: dict.cart.couponLabel,
                apply: dict.cart.couponApply,
                remove: dict.cart.couponRemove,
                applied: dict.cart.couponApplied,
              }}
              messages={couponMessages(dict, locale)}
            />
            {cart.couponCode && cart.couponError ? (
              <p role="alert" className="mt-2 text-sm text-warning">
                {couponMessages(dict, locale, cart.couponMinSubtotal)[cart.couponError]}
              </p>
            ) : null}
          </div>

          <dl className="mt-6 space-y-3 border-t border-line pt-6 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{dict.cart.subtotal}</dt>
              <dd className="ltr-nums">{formatMoney(cart.totals.subtotal, locale)}</dd>
            </div>
            {cart.totals.discount > 0 ? (
              <div className="flex justify-between gap-4 text-success">
                <dt>{dict.cart.discount}</dt>
                <dd className="ltr-nums">{formatMoney(-cart.totals.discount, locale)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{dict.cart.shipping}</dt>
              <dd className="ltr-nums text-end">
                {estimatedFee !== null
                  ? estimatedFee === 0
                    ? dict.cart.free
                    : formatMoney(estimatedFee, locale)
                  : cart.shippingFrom !== null
                    ? t(dict.cart.shippingFrom, { amount: formatMoney(cart.shippingFrom, locale) })
                    : dict.cart.shippingCalculatedAtCheckout}
              </dd>
            </div>
          </dl>

          <form method="get" className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="gov-estimate" className="mb-1 block text-xs text-subtle">
                {dict.cart.estimateFor}
              </label>
              <Select id="gov-estimate" name="gov" defaultValue={governorate} className="h-9 text-sm">
                <option value="">{dict.cart.selectGovernorate}</option>
                {governorates.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g[locale]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="subtle" size="sm">
              {dict.cart.update}
            </Button>
          </form>
          {governorate && !estimate ? <p className="mt-2 text-xs text-warning">{dict.checkout.noShippingAvailable}</p> : null}

          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-6">
            <span className="font-medium">{dict.cart.grandTotal}</span>
            <span className="ltr-nums text-xl font-medium">
              {formatMoney(afterDiscount + (estimatedFee ?? 0), locale)}
            </span>
          </div>
          {estimatedFee === null ? <p className="mt-1 text-xs text-subtle">{dict.cart.shippingCalculatedAtCheckout}</p> : null}

          {canCheckout ? (
            <Button asChild size="lg" className="mt-6 w-full">
              <Link href={localizePath(locale, "/checkout")}>{dict.cart.checkout}</Link>
            </Button>
          ) : (
            <Button size="lg" className="mt-6 w-full" disabled>
              {dict.cart.checkout}
            </Button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-subtle">{dict.checkout.secureNotice}</p>
        </aside>
      </div>
    </Container>
  );
}
