import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, BilingualFields, CheckField, FormRow, Panel, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { deleteFaq, saveFaq } from "@/server/actions/admin/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FaqFields({ a, f }: { a: AdminDictionary; f?: any }) {
  return (
    <>
      {f ? <input type="hidden" name="id" value={f.id} /> : null}
      <BilingualFields name="question" labelAr={a.faqs.questionAr} labelEn={a.faqs.questionEn} valueAr={f?.question_ar} valueEn={f?.question_en} required maxLength={300} />
      <BilingualFields name="answer" labelAr={a.faqs.answerAr} labelEn={a.faqs.answerEn} valueAr={f?.answer_ar} valueEn={f?.answer_en} multiline rows={3} required maxLength={5000} />
      <FormRow>
        <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={f?.sort_order ?? 0} />
        <div className="flex items-end pb-2"><CheckField id="is_published" label={a.common.published} defaultChecked={f?.is_published ?? true} /></div>
      </FormRow>
    </>
  );
}

export default async function AdminFaqs({ params }: PageProps<"/[locale]/admin/faqs">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("faqs").select("*").order("sort_order");
  return (
    <>
      <AdminHeader title={a.faqs.title} />
      <div className="space-y-6">
        <Panel title={a.faqs.new}>
          <ActionForm action={saveFaq} submitLabel={a.common.create} messages={messages} resetOnSuccess>
            <FaqFields a={a} />
          </ActionForm>
        </Panel>
        {(data ?? []).map((f) => (
          <Panel key={f.id} title={locale === "ar" ? f.question_ar : f.question_en}>
            <ActionForm action={saveFaq} submitLabel={a.common.save} messages={messages} variant="subtle">
              <FaqFields a={a} f={f} />
            </ActionForm>
            <div className="mt-3">
              <ActionForm action={deleteFaq} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                <input type="hidden" name="id" value={f.id} />
              </ActionForm>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
