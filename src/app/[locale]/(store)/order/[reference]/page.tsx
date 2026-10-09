import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Alert, Container, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { OrderDetails, formatDate } from "@/components/order/order-details";
import { AutoRefresh, CopyLink } from "@/components/order/order-client";
import { getOrderForViewer } from "@/server/orders";
import { retryPayment } from "@/server/actions/orders";
import { siteUrl } from "@/lib/env";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/order/[reference]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).order.title, robots: noIndex, referrer: "no-referrer" };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/[locale]/order/[reference]">) {
  const { locale, reference } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;
  const tokenParam = typeof sp.t === "string" ? sp.t : null;
  const paymentNotice = typeof sp.payment === "string" ? sp.payment : null;

  const access = await getOrderForViewer(reference, tokenParam);
  if (!access) {
    return (
      <Container className="py-20">
        <EmptyState
          title={dict.order.notFoundTitle}
          body={dict.order.notFoundBody}
          action={
            <Button asChild variant="outline">
              <Link href={localizePath(locale, "/account/login")}>{dict.nav.signIn}</Link>
            </Button>
          }
        />
      </Container>
    );
  }
  const { order, token } = access;

  const banner = {
    confirmed: { tone: "success" as const, title: dict.order.thankYou, body: dict.order.confirmedBody },
    paid: { tone: "success" as const, title: dict.order.paidTitle, body: dict.order.paidBody },
    pending: { tone: "info" as const, title: dict.order.pendingTitle, body: dict.order.pendingBody },
    failed: { tone: "danger" as const, title: dict.order.failedTitle, body: dict.order.failedBody },
    expired: { tone: "warning" as const, title: dict.order.expiredTitle, body: dict.order.expiredBody },
    on_hold: { tone: "warning" as const, title: dict.order.onHoldTitle, body: dict.order.onHoldBody },
    cancelled: { tone: "warning" as const, title: dict.order.statuses.cancelled, body: dict.order.onHoldBody },
  }[order.displayState];

  const trackingUrl = token ? `${siteUrl()}${localizePath(locale, `/order/${order.reference}`)}?t=${token}` : null;

  return (
    <Container className="py-10 sm:py-14">
      {order.displayState === "pending" ? <AutoRefresh /> : null}
      <p className="eyebrow mb-3">{dict.order.title}</p>
      <h1 className="font-display text-4xl sm:text-5xl">{banner.title}</h1>
      <div className="hairline my-8" aria-hidden="true" />

      <Alert tone={banner.tone} className="mb-8 max-w-3xl">
        <p>{banner.body}</p>
        {order.canRetryPayment && order.reservationExpiresAt ? (
          <p className="mt-1 text-xs opacity-80">
            {t(dict.order.reservedUntil, { time: formatDate(order.reservationExpiresAt, locale, true) })}
          </p>
        ) : null}
      </Alert>

      {paymentNotice === "init_failed" && order.displayState !== "paid" ? (
        <Alert tone="danger" className="mb-8 max-w-3xl">
          {dict.checkout.errors.paymentInitFailed}
        </Alert>
      ) : null}

      {order.canRetryPayment && (order.displayState === "failed" || order.displayState === "pending") ? (
        <form action={retryPayment} className="mb-10">
          <input type="hidden" name="reference" value={order.reference} />
          <input type="hidden" name="locale" value={locale} />
          {access.via === "token" && token ? <input type="hidden" name="token" value={token} /> : null}
          <Button type="submit" size="lg">
            {dict.order.retryPayment}
          </Button>
        </form>
      ) : null}

      {trackingUrl ? (
        <div className="mb-12 max-w-3xl">
          <p className="mb-2 text-sm text-muted">{dict.order.saveLink}</p>
          <CopyLink url={trackingUrl} label={dict.order.copyLink} copiedLabel={dict.order.copied} />
        </div>
      ) : null}

      <OrderDetails order={order} locale={locale} dict={dict} />
    </Container>
  );
}
