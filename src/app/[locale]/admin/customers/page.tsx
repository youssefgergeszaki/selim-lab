import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, Panel, Table, Td, Th } from "@/components/admin/ui";
import { Alert, Badge } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/components/order/order-details";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { audit } from "@/lib/audit";

const PER_PAGE = 50;

/** Administrators only: customer personal data is restricted. Viewing is audit-logged. */
export default async function AdminCustomers({ params, searchParams }: PageProps<"/[locale]/admin/customers">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ctx = await requireStaffPage("admin");
  const a = getAdminDictionary(locale);
  const page = Math.max(Number((await searchParams).page ?? 1) || 1, 1);
  const db = createServiceClient();

  const { data: usersPage, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
  const users = error ? [] : usersPage.users;
  const ids = users.map((u) => u.id);
  const [profiles, orders, subscribers] = await Promise.all([
    ids.length ? db.from("profiles").select("id, full_name, phone, marketing_opt_in").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("orders").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] }),
    db.from("newsletter_subscribers").select("email, locale, status, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  await audit(ctx, "customers.view", "customers", null, { page });
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const orderCounts = new Map<string, number>();
  for (const o of orders.data ?? []) orderCounts.set(o.user_id, (orderCounts.get(o.user_id) ?? 0) + 1);

  return (
    <>
      <AdminHeader title={a.customers.title} />
      <Alert tone="warning" className="mb-6">{a.customers.restricted}</Alert>
      <Table>
        <thead><tr><Th>{a.customers.name}</Th><Th>{a.customers.email}</Th><Th>{a.customers.phone}</Th><Th>{a.customers.orders}</Th><Th>{a.customers.joined}</Th></tr></thead>
        <tbody>
          {users.map((u) => {
            const p = profileById.get(u.id);
            return (
              <tr key={u.id}>
                <Td>{p?.full_name ?? "—"}{p?.marketing_opt_in ? <Badge tone="gold" className="ms-2">{a.customers.marketing}</Badge> : null}</Td>
                <Td><span dir="ltr">{u.email}</span></Td>
                <Td className="ltr-nums">{p?.phone ?? "—"}</Td>
                <Td className="ltr-nums">{orderCounts.get(u.id) ?? 0}</Td>
                <Td>{formatDate(u.created_at, locale)}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} pageCount={users.length === PER_PAGE ? page + 1 : page} hrefFor={(p) => `?page=${p}`} labels={{ previous: a.common.previous, next: a.common.next, page: a.common.page, of: a.common.of }} />

      <Panel title={a.customers.newsletter} className="mt-10">
        {(subscribers.data ?? []).length === 0 ? <p className="text-sm text-muted">{a.common.empty}</p> : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {(subscribers.data ?? []).map((s) => (
              <li key={s.email} className="flex justify-between gap-3 border-b border-line py-1.5">
                <span dir="ltr">{s.email}</span>
                <span className="text-xs text-subtle">{s.locale} · {s.status} · {formatDate(s.created_at, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
