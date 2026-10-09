import { notFound } from "next/navigation";
import { isLocale, localizePath } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, BilingualFields, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { createProduct } from "@/server/actions/admin/products";

export default async function NewProduct({ params }: PageProps<"/[locale]/admin/products/new">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage();
  const a = getAdminDictionary(locale);
  return (
    <>
      <AdminHeader title={a.products.new} description={a.products.claimsNotice} />
      <Panel>
        <ActionForm
          action={createProduct}
          submitLabel={a.common.create}
          pendingLabel={a.common.saving}
          messages={adminMessages(a)}
          redirectTo={`${localizePath(locale, "/admin/products")}/{id}`}
        >
          <BilingualFields name="name" labelAr={`${a.products.name} (${a.common.arabic})`} labelEn={`${a.products.name} (${a.common.english})`} required maxLength={200} />
          <BilingualFields name="slug" labelAr={`${a.products.slug} (${a.common.arabic})`} labelEn={`${a.products.slug} (${a.common.english})`} maxLength={200} />
          <p className="text-xs text-subtle">{a.products.slugHint}</p>
        </ActionForm>
      </Panel>
    </>
  );
}
