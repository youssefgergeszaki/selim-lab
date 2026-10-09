import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { getDictionary } from "@/i18n";
import { AdminHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, statusTone } from "@/components/order/order-details";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/server/admin/guard";
import { listAdminOrders, PAGE_SIZE } from "@/server/admin/data";

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "on_hold"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "cancelled", "refunded", "partially_refunded", "cod_pending"] as const;

export default async function AdminOrders({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const dict = getDictionary(locale);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = (ORDER_STATUSES as readonly string[]).includes(str("status")) ? str("status") : "";
  const payment = (PAYMENT_STATUSES as readonly string[]).includes(str("payment")) ? str("payment") : "";
  const attention = str("attention") === "1";
  const q = str("q");
  const result = await listAdminOrders({ q, status, payment, attention, page: Number(str("page") || 1) });
  const base = localizePath(locale, "/admin/orders");
  const hrefFor = (p: number) =>
    `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(payment ? { payment } : {}), ...(attention ? { attention: "1" } : {}), page: String(p) })}`;

  return (
    <>
      <AdminHeader title={a.orders.title} />
      <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder={a.orders.searchPlaceholder} aria-label={a.common.search} className="h-10 w-72 rounded-[var(--radius)] border border-line-strong/70 bg-ivory px-3 text-sm" />
        <select name="status" defaultValue={status} aria-label={a.orders.status} className="h-10 rounded-[var(--radius)] border border-line-strong/70 bg-ivory px-3 text-sm">
          <option value="">{a.orders.status}: {a.common.all}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{dict.order.statuses[s]}</option>
          ))}
        </select>
        <select name="payment" defaultValue={payment} aria-label={a.orders.payment} className="h-10 rounded-[var(--radius)] border border-line-strong/70 bg-ivory px-3 text-sm">
          <option value="">{a.orders.payment}: {a.common.all}</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{dict.order.paymentStatuses[s]}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attention" value="1" defaultChecked={attention} className="size-4 accent-[var(--brand-deep)]" />
          {a.orders.needsAttention}
        </label>
        <Button type="submit" variant="subtle">{a.common.filter}</Button>
      </form>
      {result.items.length === 0 ? (
        <p className="border border-line bg-ivory p-8 text-center text-muted">{a.common.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{a.orders.reference}</Th>
              <Th>{a.orders.customer}</Th>
              <Th>{a.orders.status}</Th>
              <Th>{a.orders.payment}</Th>
              <Th>{a.orders.total}</Th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((o) => (
              <tr key={o.id} className={o.needs_attention ? "bg-danger/5" : undefined}>
                <Td>
                  <Link href={`${base}/${o.id}`} className="ltr-nums font-medium hover:underline">{o.reference}</Link>
                  <p className="text-xs text-subtle">{formatDate(o.created_at, locale, true)}</p>
                  {o.needs_attention ? <Badge tone="danger" className="mt-1">{a.orders.needsAttention}</Badge> : null}
                </Td>
                <Td>
                  <p>{o.full_name}</p>
                  <p className="ltr-nums text-xs text-subtle">{o.phone}</p>
                </Td>
                <Td><Badge tone={statusTone(o.status)}>{dict.order.statuses[o.status as keyof typeof dict.order.statuses]}</Badge></Td>
                <Td>
                  <Badge tone={statusTone(o.payment_status)}>{dict.order.paymentStatuses[o.payment_status as keyof typeof dict.order.paymentStatuses]}</Badge>
                  <p className="mt-1 text-xs text-subtle">{dict.checkout.methods[o.payment_method as keyof typeof dict.checkout.methods]}</p>
                </Td>
                <Td className="ltr-nums">{formatMoney(o.total, locale)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={result.page} pageCount={Math.ceil(result.total / PAGE_SIZE)} hrefFor={hrefFor} labels={{ previous: a.common.previous, next: a.common.next, page: a.common.page, of: a.common.of }} />
    </>
  );
}
