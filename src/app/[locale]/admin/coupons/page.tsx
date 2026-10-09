import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, CheckField, FormRow, Panel, SelectField, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { createServiceClient } from "@/lib/supabase/server";
import { isoToStoreLocal } from "@/lib/dates";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { saveCoupon } from "@/server/actions/admin/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CouponFields({ a, c }: { a: AdminDictionary; c?: any }) {
  return (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <FormRow>
        <TextField id="code" label={a.coupons.code} defaultValue={c?.code} dir="ltr" required maxLength={32} />
        <SelectField id="discount_type" label={a.coupons.type} defaultValue={c?.discount_type ?? "percentage"} options={(["percentage", "fixed", "free_shipping"] as const).map((t) => ({ value: t, label: a.coupons.types[t] }))} />
        <TextField id="value" label={a.coupons.value} defaultValue={c?.value ?? 0} dir="ltr" />
        <TextField id="max_discount" label={a.coupons.maxDiscount} defaultValue={c?.max_discount} dir="ltr" />
        <TextField id="min_subtotal" label={a.coupons.minSubtotal} defaultValue={c?.min_subtotal ?? 0} dir="ltr" />
        <TextField id="starts_at" label={a.coupons.startsAt} type="datetime-local" defaultValue={isoToStoreLocal(c?.starts_at)} />
        <TextField id="ends_at" label={a.coupons.endsAt} type="datetime-local" defaultValue={isoToStoreLocal(c?.ends_at)} />
        <TextField id="usage_limit" label={a.coupons.usageLimit} type="number" defaultValue={c?.usage_limit} />
        <TextField id="per_customer_limit" label={a.coupons.perCustomer} type="number" defaultValue={c?.per_customer_limit} />
        <TextField id="description" label={a.coupons.description} defaultValue={c?.description} maxLength={300} />
        <div className="flex items-end pb-2"><CheckField id="is_active" label={a.common.active} defaultChecked={c?.is_active ?? true} /></div>
      </FormRow>
    </>
  );
}

export default async function AdminCoupons({ params }: PageProps<"/[locale]/admin/coupons">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ctx = await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const { data } = await createServiceClient().from("coupons").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <AdminHeader title={a.coupons.title} />
      <div className="space-y-6">
        {ctx.isAdmin ? (
          <Panel title={a.coupons.new}>
            <ActionForm action={saveCoupon} submitLabel={a.common.create} messages={messages} resetOnSuccess>
              <CouponFields a={a} />
            </ActionForm>
          </Panel>
        ) : null}
        {(data ?? []).map((c) => (
          <Panel
            key={c.id}
            title={c.code}
            actions={
              <div className="flex gap-2">
                <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? a.common.active : a.common.inactive}</Badge>
                <Badge className="ltr-nums">{a.coupons.used}: {c.usage_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</Badge>
              </div>
            }
          >
            {ctx.isAdmin ? (
              <ActionForm action={saveCoupon} submitLabel={a.common.save} messages={messages} variant="subtle">
                <CouponFields a={a} c={c} />
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">{a.coupons.types[c.discount_type as "fixed"]} · <span className="ltr-nums">{c.value}</span></p>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
