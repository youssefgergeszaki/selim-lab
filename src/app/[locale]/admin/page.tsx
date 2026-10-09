import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { getDictionary } from "@/i18n";
import { AdminHeader, Panel, StatCard, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { formatDate, statusTone } from "@/components/order/order-details";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/server/admin/guard";
import { getOverviewStats } from "@/server/admin/data";

export default async function AdminOverview({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const dict = getDictionary(locale);
  const stats = await getOverviewStats();
  const base = localizePath(locale, "/admin");

  return (
    <>
      <AdminHeader title={a.nav.overview} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={a.overview.ordersToday} value={stats.ordersToday} href={`${base}/orders`} />
        <StatCard label={a.overview.orders30} value={stats.orders30} href={`${base}/orders`} />
        <StatCard label={a.overview.revenue30} value={formatMoney(stats.revenue30, locale)} />
        <StatCard label={a.overview.awaitingAction} value={stats.awaiting} href={`${base}/orders?status=confirmed`} />
        <StatCard
          label={a.overview.needsAttention}
          value={stats.needsAttention}
          tone={stats.needsAttention ? "danger" : "neutral"}
          href={`${base}/orders?attention=1`}
        />
        <StatCard
          label={`${a.overview.lowStock} / ${a.overview.outOfStock}`}
          value={`${stats.lowStock.length} / ${stats.outOfStockCount}`}
          tone={stats.outOfStockCount ? "warning" : "neutral"}
          href={`${base}/products`}
        />
      </div>
      <p className="mt-3 text-xs text-subtle">{a.overview.revenueNote}</p>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={a.overview.recentOrders}>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted">{a.common.empty}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{a.orders.reference}</Th>
                  <Th>{a.orders.customer}</Th>
                  <Th>{a.orders.status}</Th>
                  <Th>{a.orders.total}</Th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`${base}/orders/${o.id}`} className="ltr-nums link-underline">
                        {o.reference}
                      </Link>
                      <p className="text-xs text-subtle">{formatDate(o.created_at, locale, true)}</p>
                    </Td>
                    <Td>{o.full_name}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={statusTone(o.status)}>{dict.order.statuses[o.status as keyof typeof dict.order.statuses]}</Badge>
                        <Badge tone={statusTone(o.payment_status)}>
                          {dict.order.paymentStatuses[o.payment_status as keyof typeof dict.order.paymentStatuses]}
                        </Badge>
                      </div>
                    </Td>
                    <Td className="ltr-nums">{formatMoney(o.total, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel title={a.overview.lowStockTitle}>
          {stats.lowStock.length === 0 ? (
            <p className="text-sm text-muted">{a.common.empty}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {stats.lowStock.slice(0, 15).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`${base}/products/${v.productId}`} className="min-w-0 hover:underline">
                    <span className="block truncate">{v.translations.find((t) => t.locale === locale)?.name ?? v.sku}</span>
                    <span className="ltr-nums text-xs text-subtle">{v.sku}</span>
                  </Link>
                  <Badge tone={v.available === 0 ? "danger" : "warning"}>{v.available}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
