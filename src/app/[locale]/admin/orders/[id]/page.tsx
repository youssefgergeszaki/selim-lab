import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { getDictionary } from "@/i18n";
import { AdminHeader, CheckField, Panel, SelectField, Table, Td, Th } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Alert, Badge } from "@/components/ui/misc";
import { formatDate, statusTone } from "@/components/order/order-details";
import { formatMoney, toPiasters } from "@/lib/money";
import { governorateName } from "@/lib/governorates";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { getAdminOrder } from "@/server/admin/data";
import { setOrderStatus, setPaymentStatus, updateOrderNotes } from "@/server/actions/admin/store";

const NEXT_STATUSES: Record<string, string[]> = {
  pending: ["confirmed", "on_hold", "cancelled"],
  confirmed: ["processing", "shipped", "on_hold", "cancelled"],
  processing: ["shipped", "on_hold", "cancelled"],
  shipped: ["delivered", "on_hold"],
  on_hold: ["confirmed", "processing", "cancelled"],
  delivered: [],
  cancelled: [],
};

export default async function AdminOrderDetail({ params }: PageProps<"/[locale]/admin/orders/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireStaffPage();
  const a = getAdminDictionary(locale);
  const dict = getDictionary(locale);
  const data = await getAdminOrder(id);
  if (!data) notFound();
  const { order, items, history, payments, events } = data;
  const messages = adminMessages(a);
  const statusLabel = (s: string) => dict.order.statuses[s as keyof typeof dict.order.statuses] ?? s;
  const paymentLabel = (s: string) => dict.order.paymentStatuses[s as keyof typeof dict.order.paymentStatuses] ?? s;
  const nextStatuses = NEXT_STATUSES[order.status] ?? [];
  const paymentOptions =
    order.payment_status === "cod_pending" ? ["paid"] : order.payment_status === "paid" ? ["refunded", "partially_refunded"] : order.payment_status === "partially_refunded" ? ["refunded"] : [];
  const money = (v: string | number) => formatMoney(toPiasters(v), locale);

  return (
    <>
      <AdminHeader
        title={`${a.orders.detail} · ${order.reference}`}
        action={<Link href={localizePath(locale, "/admin/orders")} className="link-underline text-sm">{a.orders.title}</Link>}
      />
      {order.needs_attention ? <Alert tone="danger" className="mb-6">{a.orders.needsAttention}{order.admin_note ? ` — ${order.admin_note}` : ""}</Alert> : null}
      <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          <Panel title={a.orders.items}>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
              <Badge tone={statusTone(order.payment_status)}>{paymentLabel(order.payment_status)}</Badge>
              <Badge>{dict.checkout.methods[order.payment_method as keyof typeof dict.checkout.methods]}</Badge>
              <span className="text-xs text-subtle">{formatDate(order.created_at, locale, true)}</span>
            </div>
            <Table>
              <thead><tr><Th>SKU</Th><Th>{a.products.name}</Th><Th>{a.products.price}</Th><Th>×</Th><Th>{a.common.total}</Th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <Td className="ltr-nums">{i.sku}</Td>
                    <Td>{locale === "ar" ? i.product_name_ar : i.product_name_en}{(locale === "ar" ? i.variant_name_ar : i.variant_name_en) ? ` · ${locale === "ar" ? i.variant_name_ar : i.variant_name_en}` : ""}</Td>
                    <Td className="ltr-nums">{money(i.unit_price)}</Td>
                    <Td className="ltr-nums">{i.quantity}</Td>
                    <Td className="ltr-nums">{money(i.line_total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="mt-4 ms-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{dict.cart.subtotal}</dt><dd className="ltr-nums">{money(order.subtotal)}</dd></div>
              {toPiasters(order.discount_total) > 0 ? <div className="flex justify-between"><dt className="text-muted">{dict.cart.discount}{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt><dd className="ltr-nums">{formatMoney(-toPiasters(order.discount_total), locale)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-muted">{dict.cart.shipping}</dt><dd className="ltr-nums">{money(order.shipping_fee)}</dd></div>
              {toPiasters(order.cod_fee) > 0 ? <div className="flex justify-between"><dt className="text-muted">{dict.checkout.codFee}</dt><dd className="ltr-nums">{money(order.cod_fee)}</dd></div> : null}
              <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>{a.common.total}</dt><dd className="ltr-nums">{money(order.total)}</dd></div>
            </dl>
          </Panel>

          <Panel title={a.orders.attempts}>
            {payments.length === 0 ? <p className="text-sm text-muted">{a.common.none}</p> : (
              <Table>
                <thead><tr><Th>{a.orders.attempt}</Th><Th>{a.orders.status}</Th><Th>{a.common.total}</Th><Th>{a.orders.transaction}</Th><Th>{a.common.created}</Th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <Td className="ltr-nums">#{p.attempt}<p className="text-xs text-subtle">{p.special_reference}</p></Td>
                      <Td>{p.status}{p.failure_reason ? <p className="text-xs text-danger">{p.failure_reason}</p> : null}</Td>
                      <Td className="ltr-nums">{money(p.amount)} {p.currency}</Td>
                      <Td className="ltr-nums text-xs">{p.transaction_id ?? "—"}<p className="text-subtle">order {p.provider_order_id ?? "—"}</p></Td>
                      <Td className="text-xs">{formatDate(p.created_at, locale, true)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {ctx.isAdmin && events.length > 0 ? (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium">{a.orders.events}</h3>
                <ul className="space-y-1 text-xs">
                  {events.map((e) => (
                    <li key={e.id} className="ltr-nums flex flex-wrap gap-x-3 text-muted" dir="ltr">
                      <span>{formatDate(e.created_at, "en", true)}</span>
                      <span>{e.source}</span>
                      <span>{e.event_key}</span>
                      <span>hmac:{String(e.hmac_valid)}</span>
                      <span className="text-deep">{e.outcome ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title={a.orders.history}>
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3">
                  <span className="text-xs text-subtle">{formatDate(h.created_at, locale, true)}</span>
                  <span>{h.from_status ? `${statusLabel(h.from_status)} → ` : ""}{statusLabel(h.to_status)}</span>
                  {h.payment_status ? <span className="text-muted">· {paymentLabel(h.payment_status)}</span> : null}
                  {h.note ? <span className="text-muted">— {h.note}</span> : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-8">
          <Panel title={a.orders.shippingTo}>
            <address className="space-y-1 text-sm not-italic">
              <p className="font-medium">{order.full_name}</p>
              <p className="ltr-nums">{order.phone}</p>
              <p dir="ltr" className="text-start">{order.email}</p>
              <p>{order.address_line}</p>
              <p>{order.city} — {governorateName(order.governorate, locale)}</p>
              {order.notes ? <p className="text-muted">{order.notes}</p> : null}
              {order.shipping_method_name ? <p className="text-muted">{order.shipping_method_name}</p> : null}
            </address>
          </Panel>

          {nextStatuses.length > 0 ? (
            <Panel title={a.orders.changeStatus}>
              <ActionForm action={setOrderStatus} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages}>
                <input type="hidden" name="id" value={order.id} />
                <SelectField id="status" label={a.orders.status} options={nextStatuses.map((s) => ({ value: s, label: statusLabel(s) }))} />
                <div>
                  <label htmlFor="note" className="mb-1.5 block text-sm font-medium">{a.orders.note}</label>
                  <textarea id="note" name="note" rows={2} maxLength={500} className="w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 py-2 text-sm" />
                </div>
                <CheckField id="restock" label={a.orders.restock} defaultChecked />
              </ActionForm>
            </Panel>
          ) : null}

          {ctx.isAdmin && paymentOptions.length > 0 ? (
            <Panel title={a.orders.changePayment}>
              <p className="mb-4 text-xs text-subtle">{a.orders.paymentNotice}</p>
              <ActionForm action={setPaymentStatus} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages}>
                <input type="hidden" name="id" value={order.id} />
                <SelectField id="payment_status" label={a.orders.payment} options={paymentOptions.map((s) => ({ value: s, label: paymentLabel(s) }))} />
                <div>
                  <label htmlFor="pnote" className="mb-1.5 block text-sm font-medium">{a.orders.note}</label>
                  <input id="pnote" name="note" maxLength={500} className="h-10 w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 text-sm" />
                </div>
                {order.payment_status !== "cod_pending" ? <CheckField id="restock" label={a.orders.restock} /> : null}
              </ActionForm>
            </Panel>
          ) : null}

          <Panel title={a.orders.adminNote}>
            <ActionForm action={updateOrderNotes} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages}>
              <input type="hidden" name="id" value={order.id} />
              <textarea name="admin_note" aria-label={a.orders.adminNote} rows={4} maxLength={4000} defaultValue={order.admin_note ?? ""} className="w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 py-2 text-sm" />
              {order.needs_attention ? <CheckField id="clear_attention" label={a.orders.clearAttention} /> : null}
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
