import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getAdminDictionary } from "@/i18n/admin";
import { AdminHeader, CheckField, FormRow, Panel, TextField } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/misc";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/server/admin/guard";
import { adminMessages } from "@/server/admin/messages";
import { saveSettings } from "@/server/actions/admin/store";
import { getPaymobConfig, isPaymobMethodConfigured } from "@/server/payments/paymob";

export default async function AdminSettings({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireStaffPage("admin");
  const a = getAdminDictionary(locale);
  const { data: s } = await createServiceClient().from("store_settings").select("*").eq("id", 1).single();
  const config = getPaymobConfig();
  const social = (s?.social ?? {}) as Record<string, string>;
  const status = (ok: boolean) => <Badge tone={ok ? "success" : "warning"}>{ok ? a.settings.configured : a.settings.notConfigured}</Badge>;
  return (
    <>
      <AdminHeader title={a.settings.title} />
      <ActionForm action={saveSettings} submitLabel={a.common.save} pendingLabel={a.common.saving} messages={adminMessages(a)} className="space-y-8">
        <Panel title={a.settings.payments}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <CheckField id="paymob_card_enabled" label={a.settings.paymobCard} defaultChecked={s?.paymob_card_enabled} />
              {status(isPaymobMethodConfigured("paymob_card", config))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CheckField id="paymob_wallet_enabled" label={a.settings.paymobWallet} defaultChecked={s?.paymob_wallet_enabled} />
              {status(isPaymobMethodConfigured("paymob_wallet", config))}
            </div>
            <CheckField id="cod_enabled" label={a.settings.codEnabled} defaultChecked={s?.cod_enabled} />
            <FormRow>
              <TextField id="cod_fee" label={a.settings.codFee} defaultValue={s?.cod_fee ?? 0} dir="ltr" />
              <TextField id="cod_max_total" label={a.settings.codMax} defaultValue={s?.cod_max_total} dir="ltr" />
            </FormRow>
          </div>
        </Panel>
        <Panel title={a.settings.inventory}>
          <FormRow>
            <TextField id="reservation_minutes" label={a.settings.reservationMinutes} type="number" min="10" defaultValue={s?.reservation_minutes ?? 30} />
            <TextField id="low_stock_threshold" label={a.settings.lowStock} type="number" min="0" defaultValue={s?.low_stock_threshold ?? 5} />
          </FormRow>
        </Panel>
        <Panel title={a.settings.announcement}>
          <CheckField id="announcement_active" label={a.common.active} defaultChecked={s?.announcement_active} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField id="announcement_ar" label={a.settings.announcementAr} defaultValue={s?.announcement_ar} dir="rtl" maxLength={200} />
            <TextField id="announcement_en" label={a.settings.announcementEn} defaultValue={s?.announcement_en} dir="ltr" maxLength={200} />
          </div>
        </Panel>
        <Panel title={a.settings.contact}>
          <FormRow>
            <TextField id="contact_email" label={a.settings.email} type="email" defaultValue={s?.contact_email} dir="ltr" />
            <TextField id="contact_phone" label={a.settings.phone} defaultValue={s?.contact_phone} dir="ltr" />
            <TextField id="whatsapp" label={a.settings.whatsapp} defaultValue={s?.whatsapp} dir="ltr" />
          </FormRow>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextField id="address_ar" label={a.settings.addressAr} defaultValue={s?.address_ar} dir="rtl" maxLength={300} />
            <TextField id="address_en" label={a.settings.addressEn} defaultValue={s?.address_en} dir="ltr" maxLength={300} />
          </div>
          <h3 className="mt-6 mb-3 text-sm font-medium">{a.settings.social}</h3>
          <FormRow>
            {(["instagram", "facebook", "tiktok", "youtube", "x"] as const).map((k) => (
              <TextField key={k} id={k} label={k} defaultValue={social[k]} dir="ltr" placeholder="https://" />
            ))}
          </FormRow>
        </Panel>
      </ActionForm>
    </>
  );
}
