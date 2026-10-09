import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import {
  AdminHeader,
  BilingualFields,
  CheckField,
  FormRow,
  ImageField,
  Panel,
  SelectField,
  TextField,
} from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { getAdminProduct } from "@/server/admin/data";
import {
  adjustVariantStock,
  deleteProduct,
  deleteProductImage,
  deleteVariant,
  saveVariant,
  updateProduct,
  updateProductImage,
  uploadProductImage,
} from "@/server/actions/admin/products";

type Attr = { label: string; value: string };
const attrsToText = (value: unknown) =>
  Array.isArray(value) ? (value as Attr[]).map((a) => `${a.label}: ${a.value}`).join("\n") : "";

export default async function EditProduct({ params }: PageProps<"/[locale]/admin/products/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireStaffPage();
  const a = getAdminDictionary(locale);
  const data = await getAdminProduct(id);
  if (!data) notFound();
  const { product, ar, en, variants, images, categoryIds, allCategories } = data;
  const messages = adminMessages(a);
  const base = localizePath(locale, "/admin/products");
  const storeUrl = (ar || en) ? localizePath(locale, `/products/${encodeURIComponent((locale === "ar" ? ar?.slug : en?.slug) ?? "")}`) : null;

  return (
    <>
      <AdminHeader
        title={(locale === "ar" ? ar?.name : en?.name) ?? a.products.title}
        description={a.products.claimsNotice}
        action={
          <div className="flex items-center gap-3 text-sm">
            <Link href={base} className="link-underline">
              {a.products.title}
            </Link>
            {product.status === "published" && storeUrl ? (
              <Link href={storeUrl} className="link-underline" target="_blank">
                {a.common.view}
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="space-y-8">
        <Panel>
          <ActionForm action={updateProduct} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages}>
            <input type="hidden" name="id" value={product.id} />
            <FormRow>
              <SelectField
                id="status"
                label={a.products.statusLabel}
                defaultValue={product.status}
                options={(["draft", "published", "archived"] as const).map((s) => ({ value: s, label: a.products.status[s] }))}
              />
              <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={product.sort_order} />
              <div className="flex items-end pb-2">
                <CheckField id="is_featured" label={a.products.featured} defaultChecked={product.is_featured} />
              </div>
            </FormRow>
            <BilingualFields name="name" labelAr={`${a.products.name} (AR)`} labelEn={`${a.products.name} (EN)`} valueAr={ar?.name} valueEn={en?.name} required maxLength={200} />
            <BilingualFields name="slug" labelAr={`${a.products.slug} (AR)`} labelEn={`${a.products.slug} (EN)`} valueAr={ar?.slug} valueEn={en?.slug} maxLength={200} />
            <BilingualFields name="short_description" labelAr={`${a.products.shortDescription} (AR)`} labelEn={`${a.products.shortDescription} (EN)`} valueAr={ar?.short_description} valueEn={en?.short_description} multiline rows={2} maxLength={500} />
            <BilingualFields name="description" labelAr={`${a.products.description} (AR)`} labelEn={`${a.products.description} (EN)`} valueAr={ar?.description} valueEn={en?.description} multiline rows={5} />
            <BilingualFields name="ingredients" labelAr={`${a.products.ingredients} (AR)`} labelEn={`${a.products.ingredients} (EN)`} valueAr={ar?.ingredients} valueEn={en?.ingredients} multiline rows={4} />
            <BilingualFields name="how_to_use" labelAr={`${a.products.howToUse} (AR)`} labelEn={`${a.products.howToUse} (EN)`} valueAr={ar?.how_to_use} valueEn={en?.how_to_use} multiline rows={3} />
            <BilingualFields name="warnings" labelAr={`${a.products.warnings} (AR)`} labelEn={`${a.products.warnings} (EN)`} valueAr={ar?.warnings} valueEn={en?.warnings} multiline rows={3} />
            <BilingualFields name="attributes" labelAr={`${a.products.attributes} (AR)`} labelEn={`${a.products.attributes} (EN)`} valueAr={attrsToText(ar?.attributes)} valueEn={attrsToText(en?.attributes)} multiline rows={3} />
            <p className="-mt-2 text-xs text-subtle">{a.products.attributesHint}</p>
            <BilingualFields name="seo_title" labelAr={`${a.products.seoTitle} (AR)`} labelEn={`${a.products.seoTitle} (EN)`} valueAr={ar?.seo_title} valueEn={en?.seo_title} maxLength={120} />
            <BilingualFields name="seo_description" labelAr={`${a.products.seoDescription} (AR)`} labelEn={`${a.products.seoDescription} (EN)`} valueAr={ar?.seo_description} valueEn={en?.seo_description} multiline rows={2} maxLength={320} />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{a.products.categories}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {allCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="categories" value={c.id} defaultChecked={categoryIds.has(c.id)} className="size-4 accent-[var(--brand-deep)]" />
                    {locale === "ar" ? c.name_ar : c.name_en}
                    <span className="text-xs text-subtle">({a.categories.kinds[c.kind as "category"]})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </Panel>

        <Panel title={a.products.variants}>
          {variants.length === 0 ? <p className="mb-4 text-sm text-warning">{a.products.noVariants}</p> : null}
          <div className="space-y-6">
            {variants.map((v) => (
              <div key={v.id} className="border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="ltr-nums font-medium">{v.sku}</span>
                  {v.is_default ? <Badge tone="gold">{a.products.defaultVariant}</Badge> : null}
                  {!v.is_active ? <Badge>{a.common.inactive}</Badge> : null}
                  <span className="ltr-nums text-subtle">
                    {a.products.stock}: {v.stock_quantity} · {a.products.reserved}: {v.reserved_quantity} · {a.products.available}:{" "}
                    {Math.max(v.stock_quantity - v.reserved_quantity, 0)}
                  </span>
                </div>
                <ActionForm action={saveVariant} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={messages} variant="subtle" size="sm">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="product_id" value={product.id} />
                  <FormRow>
                    <TextField id="sku" label={a.products.sku} defaultValue={v.sku} dir="ltr" required />
                    <TextField id="name_ar" label={`${a.products.variantName} (AR)`} defaultValue={v.name_ar} dir="rtl" />
                    <TextField id="name_en" label={`${a.products.variantName} (EN)`} defaultValue={v.name_en} dir="ltr" />
                    <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={v.sort_order} />
                    <TextField id="price" label={a.products.price} defaultValue={String(v.price)} dir="ltr" required />
                    <TextField id="compare_at_price" label={a.products.compareAt} defaultValue={v.compare_at_price === null ? "" : String(v.compare_at_price)} dir="ltr" />
                    <div className="flex items-end gap-4 pb-2">
                      <CheckField id="is_default" label={a.products.defaultVariant} defaultChecked={v.is_default} />
                      <CheckField id="is_active" label={a.common.active} defaultChecked={v.is_active} />
                    </div>
                  </FormRow>
                </ActionForm>
                <div className="mt-4 flex flex-wrap items-end gap-6 border-t border-line pt-4">
                  <ActionForm action={adjustVariantStock} submitLabel={a.products.adjustStock} messages={messages} variant="outline" size="sm" inline resetOnSuccess>
                    <input type="hidden" name="variant_id" value={v.id} />
                    <input name="delta" aria-label={a.products.adjustBy} placeholder={a.products.adjustBy} dir="ltr" required className="h-9 w-28 rounded-[var(--radius)] border border-line-strong/70 bg-surface px-2 text-sm" />
                    <input name="note" aria-label={a.products.adjustNote} placeholder={a.products.adjustNote} maxLength={300} className="h-9 w-56 rounded-[var(--radius)] border border-line-strong/70 bg-surface px-2 text-sm" />
                  </ActionForm>
                  <ActionForm action={deleteVariant} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                    <input type="hidden" name="id" value={v.id} />
                  </ActionForm>
                </div>
              </div>
            ))}

            <div className="border border-dashed border-line-strong p-4">
              <h3 className="mb-3 font-medium">{a.products.addVariant}</h3>
              <ActionForm action={saveVariant} submitLabel={a.common.add} pendingLabel={a.common.saving} messages={messages} variant="outline" size="sm" resetOnSuccess>
                <input type="hidden" name="product_id" value={product.id} />
                <FormRow>
                  <TextField id="sku" label={a.products.sku} dir="ltr" required placeholder="SL-XXX-50" />
                  <TextField id="name_ar" label={`${a.products.variantName} (AR)`} dir="rtl" />
                  <TextField id="name_en" label={`${a.products.variantName} (EN)`} dir="ltr" />
                  <TextField id="price" label={a.products.price} dir="ltr" required />
                  <TextField id="compare_at_price" label={a.products.compareAt} dir="ltr" />
                  <TextField id="initial_stock" label={a.products.stock} type="number" min="0" defaultValue={0} />
                  <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={(variants.length + 1) * 10} />
                  <div className="flex items-end gap-4 pb-2">
                    <CheckField id="is_default" label={a.products.defaultVariant} defaultChecked={variants.length === 0} />
                    <CheckField id="is_active" label={a.common.active} defaultChecked />
                  </div>
                </FormRow>
              </ActionForm>
            </div>
          </div>
        </Panel>

        <Panel title={a.products.images}>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {images.map((img) => (
              <div key={img.id} className="border border-line p-3">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt={img.alt_en ?? ""} className="mb-3 aspect-[4/5] w-full object-cover" />
                ) : null}
                <ActionForm action={updateProductImage} submitLabel={a.common.save} messages={messages} variant="subtle" size="sm">
                  <input type="hidden" name="id" value={img.id} />
                  <TextField id="alt_ar" label={`${a.products.altText} (AR)`} defaultValue={img.alt_ar} dir="rtl" maxLength={200} />
                  <TextField id="alt_en" label={`${a.products.altText} (EN)`} defaultValue={img.alt_en} dir="ltr" maxLength={200} />
                  <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={img.sort_order} />
                </ActionForm>
                <div className="mt-3">
                  <ActionForm action={deleteProductImage} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                    <input type="hidden" name="id" value={img.id} />
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
          <ActionForm action={uploadProductImage} submitLabel={a.common.uploadImage} pendingLabel={a.common.saving} messages={messages} variant="outline" resetOnSuccess>
            <input type="hidden" name="product_id" value={product.id} />
            <ImageField id="image" label={a.common.uploadImage} hint={a.common.imageHint} />
            <FormRow className="lg:grid-cols-2">
              <TextField id="alt_ar" label={`${a.products.altText} (AR)`} dir="rtl" maxLength={200} />
              <TextField id="alt_en" label={`${a.products.altText} (EN)`} dir="ltr" maxLength={200} />
            </FormRow>
          </ActionForm>
        </Panel>

        {ctx.isAdmin ? (
          <Panel>
            <ActionForm
              action={deleteProduct}
              submitLabel={a.common.delete}
              messages={messages}
              variant="danger"
              confirmText={a.common.confirmDelete}
              redirectTo={base}
            >
              <input type="hidden" name="id" value={product.id} />
            </ActionForm>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
