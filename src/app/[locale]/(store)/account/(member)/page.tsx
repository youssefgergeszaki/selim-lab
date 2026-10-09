import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, statusTone } from "@/components/order/order-details";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listCustomerOrders } from "@/server/orders";
import { noIndex } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).account.title, robots: noIndex };
}

export default async function AccountPage({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const page = Math.max(Number.parseInt(String((await searchParams).page ?? "1"), 10) || 1, 1);
  const [user, { orders, total }] = await Promise.all([getSessionUser(), listCustomerOrders(page, 10)]);

  return (
    <section aria-labelledby="orders-title">
      <p className="mb-2 text-muted">{t(dict.account.welcome, { name: user?.fullName || user?.email || "" })}</p>
      <h2 id="orders-title" className="mb-6 font-display text-2xl">
        {dict.account.orders}
      </h2>
      {orders.length === 0 ? (
        <EmptyState
          title={dict.account.noOrders}
          action={
            <Button asChild>
              <Link href={localizePath(locale, "/shop")}>{dict.cart.continueShopping}</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-start text-sm">
            <thead>
              <tr className="border-b border-line text-subtle">
                <th scope="col" className="py-3 text-start font-normal">{dict.order.reference}</th>
                <th scope="col" className="py-3 text-start font-normal">{dict.order.date}</th>
                <th scope="col" className="py-3 text-start font-normal">{dict.order.status}</th>
                <th scope="col" className="py-3 text-start font-normal">{dict.cart.total}</th>
                <th scope="col" className="py-3"><span className="sr-only">{dict.account.viewOrder}</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line">
                  <td className="ltr-nums py-4 font-medium">{o.reference}</td>
                  <td className="py-4 text-muted">{formatDate(o.createdAt, locale)}</td>
                  <td className="py-4">
                    <Badge tone={statusTone(o.status)}>
                      {dict.order.statuses[o.status as keyof typeof dict.order.statuses] ?? o.status}
                    </Badge>
                  </td>
                  <td className="ltr-nums py-4">{formatMoney(o.total, locale)}</td>
                  <td className="py-4 text-end">
                    <Link href={localizePath(locale, `/account/orders/${o.reference}`)} className="link-underline">
                      {dict.account.viewOrder}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={Math.ceil(total / 10)}
        hrefFor={(p) => `${localizePath(locale, "/account")}?page=${p}`}
        labels={{ previous: dict.common.previous, next: dict.common.next, page: dict.common.page, of: dict.common.of }}
      />
    </section>
  );
}
