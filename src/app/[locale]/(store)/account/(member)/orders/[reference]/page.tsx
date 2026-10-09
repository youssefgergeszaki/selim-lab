import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { OrderDetails } from "@/components/order/order-details";
import { getOrderForViewer } from "@/server/orders";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders/[reference]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).order.title, robots: noIndex };
}

export default async function AccountOrderPage({ params }: PageProps<"/[locale]/account/orders/[reference]">) {
  const { locale, reference } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const access = await getOrderForViewer(reference);
  // Only the owner may view through the account area.
  if (!access || access.via !== "owner") notFound();
  return (
    <div>
      <Link href={localizePath(locale, "/account")} className="link-underline text-sm">
        {dict.common.back}
      </Link>
      <h2 className="mt-4 mb-8 font-display text-3xl">
        {dict.order.title} <span className="ltr-nums text-muted">{access.order.reference}</span>
      </h2>
      <OrderDetails order={access.order} locale={locale} dict={dict} />
      <p className="mt-8 text-sm">
        <Link href={localizePath(locale, `/order/${access.order.reference}`)} className="link-underline">
          {dict.order.timeline}
        </Link>
      </p>
    </div>
  );
}
