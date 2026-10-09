import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, Panel, SelectField, Table, Td, Th, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { grantRole, revokeRole } from "@/server/actions/admin/store";

export default async function AdminTeam({ params }: PageProps<"/[locale]/admin/team">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage("admin");
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const db = createServiceClient();
  const { data: roles } = await db.from("user_roles").select("user_id, role, created_at").order("created_at");
  const emails = new Map<string, string>();
  for (const r of roles ?? []) {
    if (emails.has(r.user_id)) continue;
    const { data } = await db.auth.admin.getUserById(r.user_id);
    emails.set(r.user_id, data.user?.email ?? r.user_id);
  }
  const roleOptions = (["staff", "admin"] as const).map((r) => ({ value: r, label: a.roles[r] }));
  return (
    <>
      <AdminHeader title={a.team.title} description={a.team.hint} />
      <Panel title={a.team.grant} className="mb-8">
        <ActionForm action={grantRole} submitLabel={a.team.grant} messages={messages} resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="email" label={a.team.email} type="email" dir="ltr" required />
            <SelectField id="role" label={a.team.role} options={roleOptions} />
          </div>
        </ActionForm>
      </Panel>
      <Table>
        <thead><tr><Th>{a.team.email}</Th><Th>{a.team.role}</Th><Th>{a.common.actions}</Th></tr></thead>
        <tbody>
          {(roles ?? []).map((r) => (
            <tr key={`${r.user_id}-${r.role}`}>
              <Td><span dir="ltr">{emails.get(r.user_id)}</span></Td>
              <Td>{a.roles[r.role as "admin"]}</Td>
              <Td>
                <ActionForm action={revokeRole} submitLabel={a.team.revoke} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                  <input type="hidden" name="user_id" value={r.user_id} />
                  <input type="hidden" name="role" value={r.role} />
                </ActionForm>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
