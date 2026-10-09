import Image from "next/image";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { governorateName } from "@/lib/governorates";
import { intlLocale } from "@/i18n/config";
import type { OrderView } from "@/server/orders";
import { Badge } from "@/components/ui/misc";
import { BrandLogo } from "@/components/layout/brand-logo";

export function formatDate(value: string, locale: Locale, withTime = false) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

export function statusTone(status: string): "neutral" | "gold" | "success" | "warning" | "danger" {
  if (["delivered", "paid", "confirmed"].includes(status)) return "success";
  if (["shipped", "processing"].includes(status)) return "gold";
  if (["cancelled", "failed", "expired"].includes(status)) return "danger";
  if (["on_hold", "refunded", "partially_refunded"].includes(status)) return "warning";
  return "neutral";
}

/** Items, totals, address and tracking — shared by the guest order page and the account page. */
export function OrderDetails({ order, locale, dict }: { order: OrderView; locale: Locale; dict: Dictionary }) {
  const statusLabel = (s: string) => dict.order.statuses[s as keyof typeof dict.order.statuses] ?? s;
  const paymentLabel = (s: string) => dict.order.paymentStatuses[s as keyof typeof dict.order.paymentStatuses] ?? s;
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_360px]">
      <div className="space-y-10">
        <dl className="grid gap-x-8 gap-y-4 border-y border-line py-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-subtle">{dict.order.reference}</dt>
            <dd className="ltr-nums mt-1 font-medium">{order.reference}</dd>
          </div>
          <div>
            <dt className="text-subtle">{dict.order.date}</dt>
            <dd className="mt-1">{formatDate(order.createdAt, locale, true)}</dd>
          </div>
          <div>
            <dt className="text-subtle">{dict.order.status}</dt>
            <dd className="mt-1">
              <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-subtle">{dict.order.paymentStatus}</dt>
            <dd className="mt-1">
              <Badge tone={statusTone(order.paymentStatus)}>{paymentLabel(order.paymentStatus)}</Badge>
              <span className="ms-2 text-muted">{dict.checkout.methods[order.paymentMethod]}</span>
            </dd>
          </div>
        </dl>

        <section aria-labelledby="order-items">
          <h2 id="order-items" className="mb-4 font-display text-2xl">
            {dict.order.items}
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-surface-muted">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <BrandLogo variant="mark" className="w-6 opacity-30" label="" />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{locale === "ar" ? item.nameAr : item.nameEn}</p>
                    <p className="text-xs text-subtle">
                      {(locale === "ar" ? item.variantAr : item.variantEn) ?? ""}
                      {(locale === "ar" ? item.variantAr : item.variantEn) ? " · " : ""}
                      <span className="ltr-nums">{item.sku}</span>
                    </p>
                    <p className="ltr-nums mt-1 text-xs text-muted">
                      {formatMoney(item.unitPrice, locale)} × {item.quantity}
                    </p>
                  </div>
                  <p className="ltr-nums shrink-0">{formatMoney(item.unitPrice * item.quantity, locale)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {order.history.length > 0 ? (
          <section aria-labelledby="order-timeline">
            <h2 id="order-timeline" className="mb-4 font-display text-2xl">
              {dict.order.timeline}
            </h2>
            <ol className="relative space-y-4 border-s border-line-gold ps-6">
              {order.history.map((h, i) => (
                <li key={`${h.createdAt}-${i}`} className="relative text-sm">
                  <span aria-hidden="true" className="absolute -start-[1.72rem] top-1.5 size-2.5 rounded-full bg-gold" />
                  <p className="font-medium">
                    {statusLabel(h.toStatus)}
                    {h.paymentStatus ? <span className="text-muted"> · {paymentLabel(h.paymentStatus)}</span> : null}
                  </p>
                  <p className="text-xs text-subtle">{formatDate(h.createdAt, locale, true)}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <aside className="h-fit space-y-8 border border-line bg-surface p-6">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{dict.cart.subtotal}</dt>
            <dd className="ltr-nums">{formatMoney(order.subtotal, locale)}</dd>
          </div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between text-success">
              <dt>
                {dict.cart.discount}
                {order.couponCode ? ` (${order.couponCode})` : ""}
              </dt>
              <dd className="ltr-nums">{formatMoney(-order.discountTotal, locale)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted">
              {dict.cart.shipping}
              {order.shippingMethodName ? ` · ${order.shippingMethodName}` : ""}
            </dt>
            <dd className="ltr-nums">{order.shippingFee === 0 ? dict.cart.free : formatMoney(order.shippingFee, locale)}</dd>
          </div>
          {order.codFee > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">{dict.checkout.codFee}</dt>
              <dd className="ltr-nums">{formatMoney(order.codFee, locale)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-line pt-3 text-base font-medium">
            <dt>{dict.cart.grandTotal}</dt>
            <dd className="ltr-nums">{formatMoney(order.total, locale)}</dd>
          </div>
        </dl>
        <div className="text-sm">
          <h2 className="eyebrow mb-3">{dict.order.deliverTo}</h2>
          <address className="space-y-0.5 not-italic text-muted">
            <p className="text-deep">{order.fullName}</p>
            <p>{order.addressLine}</p>
            <p>
              {order.city}
              {locale === "ar" ? "، " : ", "}
              {governorateName(order.governorate, locale)}
            </p>
            <p className="ltr-nums">{order.phone}</p>
            <p dir="ltr" className="text-start">
              {order.email}
            </p>
            {order.notes ? <p className="pt-2 text-xs">{order.notes}</p> : null}
          </address>
        </div>
      </aside>
    </div>
  );
}
