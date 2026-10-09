import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, BilingualFields, CheckField, FormRow, Panel, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { deleteContentPage, saveContentPage } from "@/server/actions/admin/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PageFields({ a, p }: { a: AdminDictionary; p?: any }) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <FormRow>
        <TextField id="slug" label="Slug" defaultValue={p?.slug} dir="ltr" required placeholder="privacy" />
        <div className="flex items-end pb-2"><CheckField id="is_published" label={a.common.published} defaultChecked={p?.is_published ?? false} /></div>
      </FormRow>
      <BilingualFields name="title" labelAr={a.pages.titleAr} labelEn={a.pages.titleEn} valueAr={p?.title_ar} valueEn={p?.title_en} required maxLength={200} />
      <BilingualFields name="body" labelAr={a.pages.bodyAr} labelEn={a.pages.bodyEn} valueAr={p?.body_ar} valueEn={p?.body_en} multiline rows={10} maxLength={50000} />
    </>
  );
}

export default async function AdminPages({ params }: PageProps<"/[locale]/admin/pages">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ctx = await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("content_pages").select("*").order("slug");
  return (
    <>
      <AdminHeader title={a.pages.title} />
      <div className="space-y-6">
        <Panel title={a.pages.new}>
          <ActionForm action={saveContentPage} submitLabel={a.common.create} messages={messages} resetOnSuccess>
            <PageFields a={a} />
          </ActionForm>
        </Panel>
        {(data ?? []).map((p) => (
          <Panel key={p.id} title={`${locale === "ar" ? p.title_ar : p.title_en} — /pages/${p.slug}`}>
            <ActionForm action={saveContentPage} submitLabel={a.common.save} messages={messages} variant="subtle">
              <PageFields a={a} p={p} />
            </ActionForm>
            {ctx.isAdmin ? (
              <div className="mt-3">
                <ActionForm action={deleteContentPage} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                  <input type="hidden" name="id" value={p.id} />
                </ActionForm>
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
    </>
  );
}
