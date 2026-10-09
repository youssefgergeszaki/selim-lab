import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, BilingualFields, CheckField, FormRow, ImageField, Panel, SelectField, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { createServiceClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { deleteCategory, saveCategory } from "@/server/actions/admin/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CategoryFields({ a, c }: { a: AdminDictionary; c?: any }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <FormRow>
        <SelectField id="kind" label={a.categories.kind} defaultValue={c?.kind ?? "category"} options={(["category", "collection"] as const).map((k) => ({ value: k, label: a.categories.kinds[k] }))} />
        <TextField id="slug" label={a.categories.slug} defaultValue={c?.slug} dir="ltr" required placeholder="daily-routine" />
        <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={c?.sort_order ?? 0} />
        <div className="flex items-end pb-2"><CheckField id="is_visible" label={a.common.visible} defaultChecked={c?.is_visible ?? true} /></div>
      </FormRow>
      <BilingualFields name="name" labelAr={a.categories.nameAr} labelEn={a.categories.nameEn} valueAr={c?.name_ar} valueEn={c?.name_en} required maxLength={120} />
      <BilingualFields name="description" labelAr={a.categories.descriptionAr} labelEn={a.categories.descriptionEn} valueAr={c?.description_ar} valueEn={c?.description_en} multiline rows={2} maxLength={1000} />
      <ImageField id="image" label={a.common.image} hint={a.common.imageHint} currentUrl={c ? storageUrl("site-media", c.image_path) : null} />
    </>
  );
}

export default async function AdminCategories({ params }: PageProps<"/[locale]/admin/categories">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("categories").select("*").order("kind").order("sort_order");
  return (
    <>
      <AdminHeader title={a.categories.title} />
      <div className="space-y-6">
        <Panel title={a.categories.new}>
          <ActionForm action={saveCategory} submitLabel={a.common.create} pendingLabel={a.common.saving} messages={messages} resetOnSuccess>
            <CategoryFields a={a} />
          </ActionForm>
        </Panel>
        {(data ?? []).map((c) => (
          <Panel key={c.id} title={locale === "ar" ? c.name_ar : c.name_en} actions={<Badge tone={c.kind === "collection" ? "gold" : "neutral"}>{a.categories.kinds[c.kind as "category"]}</Badge>}>
            <ActionForm action={saveCategory} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages} variant="subtle">
              <CategoryFields a={a} c={c} />
            </ActionForm>
            <div className="mt-4">
              <ActionForm action={deleteCategory} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                <input type="hidden" name="id" value={c.id} />
              </ActionForm>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
