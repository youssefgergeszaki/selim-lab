import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, Table, Td, Th } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/components/order/order-details";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { moderateReview } from "@/server/actions/admin/content";

export default async function AdminReviews({ params, searchParams }: PageProps<"/[locale]/admin/reviews">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const statusParam = (await searchParams).status;
  const status = typeof statusParam === "string" && ["pending", "approved", "rejected"].includes(statusParam) ? statusParam : "pending";
  const { data } = await createServiceClient()
    .from("reviews")
    .select("id, display_name, rating, title, body, status, verified_purchase, created_at, product_id, products(product_translations(locale, name))")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <AdminHeader title={a.reviews.title} />
      <nav className="mb-6 flex gap-2 text-sm">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <a key={s} href={`?status=${s}`} aria-current={s === status ? "page" : undefined} className={s === status ? "border-b border-deep pb-1 font-medium" : "pb-1 text-muted"}>
            {a.reviews.statuses[s]}
          </a>
        ))}
      </nav>
      {(data ?? []).length === 0 ? (
        <p className="border border-line bg-ivory p-8 text-center text-muted">{a.common.empty}</p>
      ) : (
        <Table>
          <thead><tr><Th>{a.reviews.product}</Th><Th>{a.reviews.rating}</Th><Th>{a.common.view}</Th><Th>{a.common.actions}</Th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const names = ((r.products as any)?.product_translations ?? []) as { locale: string; name: string }[];
              return (
                <tr key={r.id}>
                  <Td>{names.find((n) => n.locale === locale)?.name ?? "—"}<p className="text-xs text-subtle">{r.display_name} · {formatDate(r.created_at, locale)}</p>{r.verified_purchase ? <Badge tone="success" className="mt-1">✓</Badge> : null}</Td>
                  <Td className="text-accent-strong">{"★".repeat(r.rating)}</Td>
                  <Td className="max-w-md">{r.title ? <p className="font-medium">{r.title}</p> : null}<p className="whitespace-pre-line text-muted">{r.body}</p></Td>
                  <Td>
                    <div className="flex flex-col gap-2">
                      {r.status !== "approved" ? (
                        <ActionForm action={moderateReview} submitLabel={a.reviews.approve} messages={messages} size="sm" inline>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="approved" />
                        </ActionForm>
                      ) : null}
                      {r.status !== "rejected" ? (
                        <ActionForm action={moderateReview} submitLabel={a.reviews.reject} messages={messages} size="sm" variant="danger" inline>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="rejected" />
                        </ActionForm>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
