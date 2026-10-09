import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, BilingualFields, CheckField, FormRow, ImageField, Panel, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { createServiceClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { deleteIngredient, saveIngredient } from "@/server/actions/admin/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function IngredientFields({ a, i }: { a: AdminDictionary; i?: any }) {
  return (
    <>
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      <BilingualFields name="name" labelAr={a.ingredients.nameAr} labelEn={a.ingredients.nameEn} valueAr={i?.name_ar} valueEn={i?.name_en} required maxLength={120} />
      <BilingualFields name="description" labelAr={a.ingredients.descriptionAr} labelEn={a.ingredients.descriptionEn} valueAr={i?.description_ar} valueEn={i?.description_en} multiline rows={3} maxLength={2000} />
      <FormRow>
        <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={i?.sort_order ?? 0} />
        <div className="flex items-end pb-2"><CheckField id="is_published" label={a.common.published} defaultChecked={i?.is_published ?? true} /></div>
      </FormRow>
      <ImageField id="image" label={a.common.image} hint={a.common.imageHint} currentUrl={i ? storageUrl("site-media", i.image_path) : null} />
    </>
  );
}

export default async function AdminIngredients({ params }: PageProps<"/[locale]/admin/ingredients">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("ingredients").select("*").order("sort_order");
  return (
    <>
      <AdminHeader title={a.ingredients.title} description={a.content.hint} />
      <div className="space-y-6">
        <Panel title={a.ingredients.new}>
          <ActionForm action={saveIngredient} submitLabel={a.common.create} messages={messages} resetOnSuccess>
            <IngredientFields a={a} />
          </ActionForm>
        </Panel>
        {(data ?? []).map((i) => (
          <Panel key={i.id} title={locale === "ar" ? i.name_ar : i.name_en}>
            <ActionForm action={saveIngredient} submitLabel={a.common.save} messages={messages} variant="subtle">
              <IngredientFields a={a} i={i} />
            </ActionForm>
            <div className="mt-3">
              <ActionForm action={deleteIngredient} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                <input type="hidden" name="id" value={i.id} />
              </ActionForm>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
