import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary, type AdminDictionary } from "@/i18n/admin";
import { AdminHeader, CheckField, FormRow, Panel, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Alert } from "@/components/ui/misc";
import { createServiceClient } from "@/lib/supabase/server";
import { governorates } from "@/lib/governorates";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { deleteShippingRate, deleteShippingZone, saveShippingRate, saveShippingZone } from "@/server/actions/admin/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ZoneFields({ a, z, locale }: { a: AdminDictionary; z?: any; locale: "ar" | "en" }) {
  const selected = new Set<string>(z?.governorates ?? []);
  return (
    <>
      {z ? <input type="hidden" name="id" value={z.id} /> : null}
      <FormRow>
        <TextField id="name_ar" label={a.shipping.zoneNameAr} defaultValue={z?.name_ar} dir="rtl" required />
        <TextField id="name_en" label={a.shipping.zoneNameEn} defaultValue={z?.name_en} dir="ltr" required />
        <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={z?.sort_order ?? 0} />
        <div className="flex items-end pb-2"><CheckField id="is_active" label={a.common.active} defaultChecked={z?.is_active ?? true} /></div>
      </FormRow>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{a.shipping.governorates}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {governorates.map((g) => (
            <label key={g.code} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="governorates" value={g.code} defaultChecked={selected.has(g.code)} className="size-4 accent-[var(--brand-deep)]" />
              {g[locale]}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RateFields({ a, r, zoneId }: { a: AdminDictionary; r?: any; zoneId: string }) {
  return (
    <>
      {r ? <input type="hidden" name="id" value={r.id} /> : null}
      <input type="hidden" name="zone_id" value={zoneId} />
      <FormRow>
        <TextField id="name_ar" label={a.shipping.rateNameAr} defaultValue={r?.name_ar} dir="rtl" required />
        <TextField id="name_en" label={a.shipping.rateNameEn} defaultValue={r?.name_en} dir="ltr" required />
        <TextField id="fee" label={a.shipping.fee} defaultValue={r?.fee} dir="ltr" required />
        <TextField id="free_shipping_threshold" label={a.shipping.freeThreshold} defaultValue={r?.free_shipping_threshold} dir="ltr" />
        <TextField id="min_subtotal" label={a.shipping.minSubtotal} defaultValue={r?.min_subtotal ?? 0} dir="ltr" />
        <TextField id="max_subtotal" label={a.shipping.maxSubtotal} defaultValue={r?.max_subtotal} dir="ltr" />
        <TextField id="eta_min_days" label={a.shipping.etaMin} type="number" defaultValue={r?.eta_min_days} />
        <TextField id="eta_max_days" label={a.shipping.etaMax} type="number" defaultValue={r?.eta_max_days} />
        <TextField id="sort_order" label={a.common.sortOrder} type="number" defaultValue={r?.sort_order ?? 0} />
        <div className="flex items-end pb-2"><CheckField id="is_active" label={a.common.active} defaultChecked={r?.is_active ?? true} /></div>
      </FormRow>
    </>
  );
}

export default async function AdminShipping({ params }: PageProps<"/[locale]/admin/shipping">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ctx = await requireStaffPage();
  const a = getAdminDictionary(locale);
  const messages = adminMessages(a);
  const db = createServiceClient();
  const [{ data: zones }, { data: rates }] = await Promise.all([
    db.from("shipping_zones").select("*").order("sort_order"),
    db.from("shipping_rates").select("*").order("sort_order"),
  ]);
  const covered = new Set((zones ?? []).filter((z) => z.is_active).flatMap((z) => z.governorates as string[]));
  const uncovered = governorates.filter((g) => !covered.has(g.code));
  const readOnly = !ctx.isAdmin;

  return (
    <>
      <AdminHeader title={a.shipping.title} />
      {uncovered.length > 0 ? (
        <Alert tone="warning" className="mb-6">
          {a.shipping.unassigned}: {uncovered.map((g) => g[locale]).join("، ")}
        </Alert>
      ) : null}
      <div className="space-y-8">
        {!readOnly ? (
          <Panel title={a.shipping.newZone}>
            <ActionForm action={saveShippingZone} submitLabel={a.common.create} messages={messages} resetOnSuccess>
              <ZoneFields a={a} locale={locale} />
            </ActionForm>
          </Panel>
        ) : null}
        {(zones ?? []).map((z) => (
          <Panel key={z.id} title={locale === "ar" ? z.name_ar : z.name_en}>
            {readOnly ? null : (
              <>
                <ActionForm action={saveShippingZone} submitLabel={a.common.save} messages={messages} variant="subtle">
                  <ZoneFields a={a} z={z} locale={locale} />
                </ActionForm>
                <div className="mt-3">
                  <ActionForm action={deleteShippingZone} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                    <input type="hidden" name="id" value={z.id} />
                  </ActionForm>
                </div>
              </>
            )}
            <h3 className="mt-8 mb-3 font-medium">{a.shipping.rates}</h3>
            <div className="space-y-4">
              {(rates ?? []).filter((r) => r.zone_id === z.id).map((r) => (
                <div key={r.id} className="border border-line p-4">
                  {readOnly ? (
                    <p className="text-sm">{locale === "ar" ? r.name_ar : r.name_en} — <span className="ltr-nums">{r.fee}</span></p>
                  ) : (
                    <>
                      <ActionForm action={saveShippingRate} submitLabel={a.common.save} messages={messages} variant="subtle" size="sm">
                        <RateFields a={a} r={r} zoneId={z.id} />
                      </ActionForm>
                      <div className="mt-3">
                        <ActionForm action={deleteShippingRate} submitLabel={a.common.delete} messages={messages} variant="danger" size="sm" inline confirmText={a.common.confirmDelete}>
                          <input type="hidden" name="id" value={r.id} />
                        </ActionForm>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!readOnly ? (
                <div className="border border-dashed border-line-strong p-4">
                  <h4 className="mb-3 text-sm font-medium">{a.shipping.newRate}</h4>
                  <ActionForm action={saveShippingRate} submitLabel={a.common.add} messages={messages} variant="outline" size="sm" resetOnSuccess>
                    <RateFields a={a} zoneId={z.id} />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
