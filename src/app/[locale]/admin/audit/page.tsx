import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, Table, Td, Th } from "@/components/admin/ui";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/components/order/order-details";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { pageRange, PAGE_SIZE } from "@/server/admin/data";

export default async function AdminAudit({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage("admin");
  const a = getAdminDictionary(locale);
  const { page, from, to } = pageRange(Number((await searchParams).page ?? 1));
  const { data, count } = await createServiceClient()
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  return (
    <>
      <AdminHeader title={a.audit.title} />
      <Table>
        <thead><tr><Th>{a.audit.when}</Th><Th>{a.audit.actor}</Th><Th>{a.audit.action}</Th><Th>{a.audit.entity}</Th><Th>{a.audit.details}</Th></tr></thead>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={row.id}>
              <Td className="whitespace-nowrap text-xs">{formatDate(row.created_at, locale, true)}</Td>
              <Td><span dir="ltr" className="text-xs">{row.actor_email ?? "—"}</span></Td>
              <Td className="ltr-nums text-xs">{row.action}</Td>
              <Td className="ltr-nums text-xs">{row.entity_type}{row.entity_id ? ` · ${String(row.entity_id).slice(0, 8)}` : ""}</Td>
              <Td><code dir="ltr" className="block max-w-md truncate text-xs text-muted">{JSON.stringify(row.metadata)}</code></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={Math.ceil((count ?? 0) / PAGE_SIZE)} hrefFor={(p) => `?page=${p}`} labels={{ previous: a.common.previous, next: a.common.next, page: a.common.page, of: a.common.of }} />
    </>
  );
}
